/**
 * Realtime Module — Socket.io server with V2 contracts
 *
 * - Typed events from @agentropolis/shared
 * - Mode-aware chunk payloads (stub / real / hybrid)
 * - world:placeBuilding + world:removeBuilding handlers
 * - In-memory AOI subscription state
 * - city:sync on connect, chunk:payload on subscribe
 */

import { Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { Types } from 'mongoose';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  CitySyncPayload,
  SpectatorSyncPayload,
  ViewportSubscribePayload,
  ViewportUnsubscribePayload,
  WorldPlaceBuildingPayload,
  WorldPlaceBuildingResponse,
  WorldRemoveBuildingPayload,
  WorldRemoveBuildingResponse,
  ParcelBuyPayload,
  ParcelBuyResponse,
  AgentRegisterPayload,
  AgentRegisterResponse,
  AgentActionPayload,
  AgentActionResponse,
  ChunkPayloadData,
  TickCompletePayload,
  CityMode,
  AgentJoinedPayload,
  AgentUpdatedPayload,
  CrimeCommittedPayload,
  CrimeArrestedPayload,
} from '@agentropolis/shared/contracts/v2';
import { SOCKET_EVENTS } from '@agentropolis/shared/contracts/v2';
import { AgentModel } from '@agentropolis/db';
import { env } from '../../config/env';
import { generateStubChunk } from './stubProvider';
import { AoiState } from './aoiState';
import { eventStore, publishEvent, setEventStoreIO } from './eventStore';
import * as worldService from '../world/worldService';
import { ensureCity } from '../world/cityService';
import type { ICityState } from '../world/models/CityState';
import { worldToChunk } from '../world/worldRepo';
import {
  handleRegister,
  authenticateSocket,
  buildAgentSnapshot,
  actionQueue,
  type SocketAuthData,
  type ActionSideEffects,
} from '../agent';
import { getLastMetrics } from '../tick';

// ============ TYPES ============

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// ============ STATE ============

const FALLBACK_SEED = 42;
const FALLBACK_RADIUS = 3;
const FALLBACK_CITY_ID = 'city-001';

let cityState: ICityState | null = null;

let io: TypedServer;
let spectatorCount = 0;
let tickNo = 0;
const aoiState = new AoiState();

// City account IDs (set via setAccountIds after bootstrap)
// Note: treasuryAccountId/npcPoolAccountId stored here for access by other modules if needed.
// Primary consumers are the tick runner (has its own copies) and action queue processor.
let storedCityId: string | null = null;
let treasuryAccountId: Types.ObjectId | null = null;
let npcPoolAccountId: Types.ObjectId | null = null;

/** Get stored account IDs (for modules that need them outside tick context) */
export function getAccountIds() {
  return { cityId: storedCityId, treasuryAccountId, npcPoolAccountId };
}

/** Per-socket auth data */
const socketAuthMap = new Map<string, SocketAuthData>();

/** Last economy snapshot from tick:complete (used for spectator:sync) */
let lastEconomySnapshot: TickCompletePayload['economy'] | undefined;

function getCityMode(): CityMode {
  return env.cityMode;
}

// ============ CHUNK PAYLOAD (mode-aware) ============

function getCityId(): string {
  return cityState?.cityId ?? FALLBACK_CITY_ID;
}

function getSeed(): number {
  return cityState?.seed ?? FALLBACK_SEED;
}

function getActiveRadius(): number {
  return cityState?.activeRadiusChunks ?? FALLBACK_RADIUS;
}

async function getChunkPayloadForMode(
  chunkX: number,
  chunkZ: number,
): Promise<ChunkPayloadData> {
  const mode = getCityMode();
  const seed = getSeed();

  if (mode === 'stub') {
    return generateStubChunk(seed, chunkX, chunkZ);
  }

  // real + hybrid: base map + DB overrides merged
  return worldService.getChunkPayload(getCityId(), chunkX, chunkZ, seed);
}

// ============ PUBLISH HELPER ============

/**
 * Broadcast chunk:payload to all sockets subscribed to a chunk.
 * Used after building placement/removal to push updates.
 */
async function publishChunk(chunkX: number, chunkZ: number): Promise<void> {
  if (!io) return;

  const payload = await getChunkPayloadForMode(chunkX, chunkZ);
  const chunkKey = `${chunkX},${chunkZ}`;

  // Iterate all sockets and send to those subscribed to this chunk
  for (const [socketId] of io.sockets.sockets) {
    const chunks = aoiState.getChunks(socketId);
    if (chunks.some((c) => `${c.chunkX},${c.chunkZ}` === chunkKey)) {
      io.sockets.sockets.get(socketId)?.emit(
        SOCKET_EVENTS.CHUNK_PAYLOAD as 'chunk:payload',
        payload,
      );
    }
  }
}

// ============ INIT ============

export function initializeSocket(httpServer: HttpServer): TypedServer {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  setEventStoreIO(io);

  io.on('connection', async (socket: TypedSocket) => {
    spectatorCount++;

    // Authenticate socket (agent vs spectator)
    const authData = await authenticateSocket(
      (socket.handshake.auth as Record<string, string> | undefined),
    );
    socketAuthMap.set(socket.id, authData);

    const roleLabel = authData.role === 'agent' ? `agent:${authData.agentName}` : 'spectator';
    console.log(`[Socket] Connected: ${socket.id} [${roleLabel}] (total: ${spectatorCount})`);

    // Broadcast connection count
    io.emit(SOCKET_EVENTS.CONNECTED as 'connected', { spectatorCount });

    // Send city:sync immediately on connect
    const syncPayload: CitySyncPayload = {
      cityId: getCityId(),
      seed: getSeed(),
      tickNo,
      mode: getCityMode(),
      activeRadiusChunks: getActiveRadius(),
      serverTime: new Date().toISOString(),
    };
    socket.emit(SOCKET_EVENTS.CITY_SYNC as 'city:sync', syncPayload);

    // Send spectator:sync — backlog + agent list
    buildSpectatorSync(syncPayload)
      .then((spectatorPayload) => {
        socket.emit(SOCKET_EVENTS.SPECTATOR_SYNC as 'spectator:sync', spectatorPayload);
      })
      .catch((err) => {
        console.error('[Socket] Failed to build spectator:sync:', err);
      });

    // ---- city:resync — re-send city:sync on demand ----
    socket.on(SOCKET_EVENTS.CITY_RESYNC as 'city:resync', () => {
      const resyncPayload: CitySyncPayload = {
        cityId: getCityId(),
        seed: getSeed(),
        tickNo,
        mode: getCityMode(),
        activeRadiusChunks: getActiveRadius(),
        serverTime: new Date().toISOString(),
      };
      socket.emit(SOCKET_EVENTS.CITY_SYNC as 'city:sync', resyncPayload);
      console.log(`[Socket] ${socket.id} requested city:resync`);
    });

    // ---- viewport:subscribe ----
    socket.on(
      SOCKET_EVENTS.VIEWPORT_SUBSCRIBE as 'viewport:subscribe',
      async (payload: ViewportSubscribePayload) => {
        const newChunks = aoiState.subscribe(socket.id, payload.chunks);

        console.log(
          `[Socket] ${socket.id} subscribed to ${newChunks.length} new chunks ` +
          `(total: ${aoiState.getChunks(socket.id).length})`,
        );

        // Send chunk:payload for each newly subscribed chunk
        for (const { chunkX, chunkZ } of newChunks) {
          const chunkData = await getChunkPayloadForMode(chunkX, chunkZ);
          socket.emit(SOCKET_EVENTS.CHUNK_PAYLOAD as 'chunk:payload', chunkData);
        }
      },
    );

    // ---- viewport:unsubscribe ----
    socket.on(
      SOCKET_EVENTS.VIEWPORT_UNSUBSCRIBE as 'viewport:unsubscribe',
      (payload: ViewportUnsubscribePayload) => {
        aoiState.unsubscribe(socket.id, payload.chunks);
        console.log(
          `[Socket] ${socket.id} unsubscribed from ${payload.chunks.length} chunks ` +
          `(remaining: ${aoiState.getChunks(socket.id).length})`,
        );
      },
    );

    // ---- world:placeBuilding ----
    socket.on(
      SOCKET_EVENTS.WORLD_PLACE_BUILDING as 'world:placeBuilding',
      async (payload: WorldPlaceBuildingPayload, ack: (r: WorldPlaceBuildingResponse) => void) => {
        try {
          const result = await worldService.placeBuilding(payload.cityId, {
            worldX: payload.worldX,
            worldZ: payload.worldZ,
            type: payload.type,
            assetKey: payload.assetKey,
            rotY: payload.rotY,
            tileW: payload.tileW,
            tileD: payload.tileD,
            level: payload.level,
            ownerId: payload.ownerId,
          });

          if (typeof ack === 'function') {
            ack(result);
          }

          // On success, broadcast updated chunk to all subscribers
          if (result.ok) {
            const { chunkX, chunkZ } = worldToChunk(payload.worldX, payload.worldZ);
            console.log(
              `[World] Building placed: ${payload.assetKey} at (${payload.worldX},${payload.worldZ}) → chunk(${chunkX},${chunkZ})`,
            );
            await publishChunk(chunkX, chunkZ);
          }
        } catch (err) {
          console.error('[World] placeBuilding error:', err);
          if (typeof ack === 'function') {
            ack({ ok: false, reason: 'internal_error' });
          }
        }
      },
    );

    // ---- world:removeBuilding ----
    socket.on(
      SOCKET_EVENTS.WORLD_REMOVE_BUILDING as 'world:removeBuilding',
      async (payload: WorldRemoveBuildingPayload, ack: (r: WorldRemoveBuildingResponse) => void) => {
        try {
          // Find the building first to know which chunk to broadcast
          const building = await import('../world/worldRepo').then(
            (repo) => repo.findBuilding(payload.cityId, payload.buildingId),
          );

          const result = await worldService.removeBuilding(payload.cityId, payload.buildingId, payload.ownerId);

          if (typeof ack === 'function') {
            ack(result);
          }

          // On success, broadcast updated chunk
          if (result.ok && building) {
            console.log(
              `[World] Building removed: ${payload.buildingId} from chunk(${building.chunkX},${building.chunkZ})`,
            );
            await publishChunk(building.chunkX, building.chunkZ);
          }
        } catch (err) {
          console.error('[World] removeBuilding error:', err);
          if (typeof ack === 'function') {
            ack({ ok: false, reason: 'internal_error' });
          }
        }
      },
    );

    // ---- parcel:buy ----
    socket.on(
      SOCKET_EVENTS.PARCEL_BUY as 'parcel:buy',
      async (payload: ParcelBuyPayload, ack: (r: ParcelBuyResponse) => void) => {
        try {
          const result = await worldService.buyParcel(
            payload.cityId,
            payload.worldX,
            payload.worldZ,
            payload.ownerId,
          );

          if (typeof ack === 'function') {
            ack(result);
          }

          if (result.ok) {
            console.log(
              `[World] Parcel bought: (${payload.worldX},${payload.worldZ}) by ${payload.ownerId}`,
            );
          }
        } catch (err) {
          console.error('[World] buyParcel error:', err);
          if (typeof ack === 'function') {
            ack({ ok: false, reason: 'internal_error' });
          }
        }
      },
    );

    // ---- agent:register ----
    socket.on(
      SOCKET_EVENTS.AGENT_REGISTER as 'agent:register',
      async (payload: AgentRegisterPayload, ack: (r: AgentRegisterResponse) => void) => {
        try {
          if (!storedCityId) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'city_not_ready' });
            return;
          }

          const { response, sideEffects } = await handleRegister(payload, storedCityId);

          if (typeof ack === 'function') ack(response);

          // Broadcast side effects
          broadcastSideEffects(sideEffects, tickNo);
        } catch (err) {
          console.error('[Agent] register error:', err);
          if (typeof ack === 'function') ack({ ok: false, reason: 'internal_error' });
        }
      },
    );

    // ---- agent:action (queue-based: enqueue now, process at next tick Phase 0) ----
    socket.on(
      SOCKET_EVENTS.AGENT_ACTION as 'agent:action',
      async (payload: AgentActionPayload, ack: (r: AgentActionResponse) => void) => {
        try {
          if (!storedCityId) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'city_not_ready' });
            return;
          }

          // Basic validation only — full processing happens in tick Phase 0
          const { AgentModel } = await import('@agentropolis/db');
          const agent = await AgentModel.findById(payload.agentId).lean();
          if (!agent) {
            if (typeof ack === 'function') ack({ ok: false, reason: 'agent_not_found' });
            return;
          }
          if (agent.status === 'jailed') {
            if (typeof ack === 'function') ack({ ok: false, reason: 'agent_jailed' });
            return;
          }

          // Enqueue — no isTickRunning check needed, actions are always accepted
          const enqueueResult = actionQueue.enqueue(socket.id, payload);
          if (!enqueueResult.ok) {
            if (typeof ack === 'function') ack({ ok: false, reason: enqueueResult.reason });
            return;
          }

          // Immediate ack: accepted into queue, result comes via action:result
          if (typeof ack === 'function') ack({ ok: true, queued: true });

          console.log(
            `[Agent] action queued: ${payload.type} by ${payload.agentId} (requestId=${enqueueResult.requestId}, queueSize=${actionQueue.size()})`,
          );
        } catch (err) {
          console.error('[Agent] action enqueue error:', err);
          if (typeof ack === 'function') ack({ ok: false, reason: 'internal_error' });
        }
      },
    );

    // ---- disconnect ----
    socket.on('disconnect', () => {
      spectatorCount--;
      aoiState.removeSocket(socket.id);
      socketAuthMap.delete(socket.id);
      console.log(`[Socket] Disconnected: ${socket.id} (total: ${spectatorCount})`);
      io.emit(SOCKET_EVENTS.CONNECTED as 'connected', { spectatorCount });
    });
  });

  return io;
}

// ============ ACCESSORS ============

export function getIO(): TypedServer {
  return io;
}

export function getSpectatorCount(): number {
  return spectatorCount;
}

export function getAoiState(): AoiState {
  return aoiState;
}

export function getCurrentTick(): number {
  return tickNo;
}

export { publishChunk };

// ============ ACCOUNT IDS (set by server.ts after bootstrap) ============

export function setAccountIds(
  cityId: string,
  treasuryAccId: Types.ObjectId,
  npcPoolAccId: Types.ObjectId,
): void {
  storedCityId = cityId;
  treasuryAccountId = treasuryAccId;
  npcPoolAccountId = npcPoolAccId;
}

// ============ SIDE EFFECT BROADCAST ============

function broadcastSideEffects(effects: ActionSideEffects[], tick: number): void {
  if (!io) return;

  for (const effect of effects) {
    switch (effect.type) {
      case 'agent_joined': {
        const data = effect.data as unknown as AgentJoinedPayload;
        io.emit(SOCKET_EVENTS.AGENT_JOINED as 'agent:joined', data);
        publishEvent('agent_joined', `${data.agent.name} joined the city`, tick, {
          severity: 'minor',
          tags: ['agents'],
          detail: `Profession: ${data.agent.profession}`,
        });
        break;
      }
      case 'agent_updated': {
        const data = effect.data as unknown as AgentUpdatedPayload;
        io.emit(SOCKET_EVENTS.AGENT_UPDATED as 'agent:updated', data);
        publishEvent('agent_updated', `${data.agent.name}: ${data.outcome}`, tick, {
          tags: ['agents'],
        });
        break;
      }
      case 'crime_committed': {
        const data = effect.data as unknown as CrimeCommittedPayload;
        io.emit(SOCKET_EVENTS.CRIME_COMMITTED as 'crime:committed', data);
        publishEvent('crime', `${data.perpetratorName} robbed ${data.victimName}`, tick, {
          severity: 'minor',
          tags: ['crime'],
          detail: `Amount: $${data.amount}${data.caught ? ' (caught!)' : ''}`,
        });
        break;
      }
      case 'crime_arrested': {
        const data = effect.data as unknown as CrimeArrestedPayload;
        io.emit(SOCKET_EVENTS.CRIME_ARRESTED as 'crime:arrested', data);
        publishEvent('arrest', `${data.agentName} arrested`, tick, {
          severity: 'minor',
          tags: ['crime'],
          detail: `Fine: $${data.fineAmount}, Jail: ${data.jailTicks} ticks`,
        });
        break;
      }
    }
  }
}

// ============ CITY BOOTSTRAP ============

/**
 * Bootstrap city state from MongoDB. Must be called after connectDatabase().
 * Creates the city record if it doesn't exist (upsert).
 */
export async function bootstrapCity(cityId?: string): Promise<void> {
  cityState = await ensureCity(cityId ?? FALLBACK_CITY_ID);
  console.log(
    `✓ City bootstrapped: ${cityState.cityId} (seed=${cityState.seed}, radius=${cityState.activeRadiusChunks})`,
  );
}

// ============ TICK HEARTBEAT (optional stub) ============

let tickInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start a stub tick heartbeat (broadcasts tick:complete every N ms).
 * No simulation — just increments a counter.
 */
export function startTickHeartbeat(intervalMs = 3000): void {
  if (tickInterval) return;

  tickInterval = setInterval(() => {
    tickNo++;
    if (io) {
      io.emit(SOCKET_EVENTS.TICK_COMPLETE as 'tick:complete', {
        tick: tickNo,
        serverTime: new Date().toISOString(),
      });
    }
  }, intervalMs);

  console.log(`✓ Tick heartbeat started (${intervalMs}ms interval)`);
}

export function stopTickHeartbeat(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    console.log('Tick heartbeat stopped');
  }
}

// ============ ECONOMY SNAPSHOT ============

export function setLastEconomySnapshot(snapshot: TickCompletePayload['economy']): void {
  lastEconomySnapshot = snapshot;
}

// ============ SPECTATOR SYNC BUILDER ============

async function buildSpectatorSync(city: CitySyncPayload): Promise<SpectatorSyncPayload> {
  // Fetch active agents
  let agents: SpectatorSyncPayload['agents'] = [];
  try {
    if (storedCityId) {
      const agentDocs = await AgentModel.find({
        cityId: storedCityId,
        status: { $ne: 'inactive' },
      });
      agents = await Promise.all(agentDocs.map((a) => buildAgentSnapshot(a)));
    }
  } catch (err) {
    console.error('[Socket] Failed to fetch agents for spectator:sync:', err);
  }

  return {
    city,
    recentEvents: eventStore.recent(100),
    agents,
    economy: lastEconomySnapshot,
    metrics: getLastMetrics() ?? undefined,
  };
}

// Re-export publishEvent for tick runner
export { publishEvent } from './eventStore';
