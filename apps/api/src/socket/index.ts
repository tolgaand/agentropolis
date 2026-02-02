/**
 * Socket.io Server
 *
 * SPECTATOR-FIRST ARCHITECTURE:
 * - Room-based subscriptions for optimized event delivery
 * - Send full sync_state on room join
 * - Only broadcast events to relevant rooms
 *
 * ROOMS:
 * - multiverse: Global events (time.tick, world.update, trade.completed, fx.rate.batch)
 * - world:<id>: World-specific detailed updates
 * - world:<id>:map: Map state for a specific world (heavy payload)
 * - game:map: V2 unified map - all parcels across all worlds (single world architecture)
 *
 * MULTIVERSE EVENTS:
 * - time.tick: Game clock updates (every tick) → multiverse room
 * - world.update: Individual world state changes → multiverse room
 * - trade.completed: Trade transactions → multiverse room
 * - fx.rate.batch: Exchange rate updates → multiverse room
 * - sync.state: Full state sync on room join
 * - map_state: Map data → world:<id>:map room (filtered) or game:map room (all parcels)
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  RealtimeEvent,
  MapStatePayload,
  TimeTick,
  MultiverseSyncState,
  TradeCompleted,
  WorldUpdate,
  WorldUpdateBatch,
  PriceUpdateBatch,
  WorldId,
  RoomJoinPayload,
  RoomLeavePayload,
  ParcelCreatedPayload,
  ParcelUpdatedPayload,
  MapParcel,
  MapObject,
  TradeOfferCreated,
  ResourceId,
} from '@agentropolis/shared';
import { SOCKET_EVENTS } from '@agentropolis/shared';
import { WorldModel, TradeModel, TradeOfferModel } from '@agentropolis/db';
import { env } from '../config/env';
import { mapState } from '../game/map/state';
import { timeServer } from '../time/TimeServer';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

let io: TypedServer;
let spectatorCount = 0;

// Track room memberships for logging
const roomCounts: Record<string, number> = {};

export function initializeSocket(httpServer: HttpServer): TypedServer {
  io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: TypedSocket) => {
    const connectTime = Date.now();
    spectatorCount++;
    mapState.setSpectatorCount(spectatorCount);
    console.log(`[Socket ${connectTime}] CONNECT: ${socket.id} (total: ${spectatorCount})`);

    // Broadcast updated spectator count
    broadcastSpectatorCount();

    // === ROOM SUBSCRIPTION HANDLERS ===
    socket.on('room.join', async (payload: RoomJoinPayload) => {
      const joinTime = Date.now();
      const { room } = payload;
      socket.join(room);
      roomCounts[room] = (roomCounts[room] || 0) + 1;
      console.log(`[Socket ${joinTime}] ROOM_JOIN: ${socket.id} -> ${room} (${roomCounts[room]} members)`);

      // Send initial state based on room type
      if (room === 'multiverse') {
        await sendMultiverseState(socket);
      } else if (room === 'game:map') {
        // V2: Single world - send all parcels from all worlds
        sendGameMapState(socket);
      } else if (room.startsWith('world:') && room.endsWith(':map')) {
        // world:<id>:map - send map state for that world
        const worldId = room.replace('world:', '').replace(':map', '') as WorldId;
        sendWorldMapState(socket, worldId);
      } else if (room.startsWith('world:')) {
        // world:<id> - send world detail state
        const worldId = room.replace('world:', '') as WorldId;
        await sendWorldDetailState(socket, worldId);
      }
    });

    socket.on('room.leave', (payload: RoomLeavePayload) => {
      const { room } = payload;
      socket.leave(room);
      roomCounts[room] = Math.max(0, (roomCounts[room] || 1) - 1);
      console.log(`[Socket] ${socket.id} left room: ${room} (${roomCounts[room]} members)`);
    });

    // Legacy handlers (for backward compatibility)
    socket.on('request_state', () => {
      sendInitialState(socket);
    });

    socket.on('join_parcel', (parcelId: string) => {
      socket.join(`parcel:${parcelId}`);
    });

    socket.on('leave_parcel', (parcelId: string) => {
      socket.leave(`parcel:${parcelId}`);
    });

    // Legacy sync request - clients should use room.join instead
    socket.on('sync.request', async () => {
      await sendMultiverseState(socket);
    });

    socket.on('disconnect', () => {
      spectatorCount--;
      mapState.setSpectatorCount(spectatorCount);
      console.log(`[Socket] Spectator disconnected: ${socket.id} (total: ${spectatorCount})`);
      broadcastSpectatorCount();
    });
  });

  return io;
}

/**
 * Send initial map and time state to a newly connected spectator
 * @deprecated Use room.join with 'world:<id>:map' instead
 */
function sendInitialState(socket: TypedSocket): void {
  // Legacy: Don't auto-send map state on connect
  // Clients should join appropriate rooms
  console.log(`[Socket] Legacy request_state from ${socket.id} - ignoring (use room.join)`);
}

/**
 * Send world detail state to a socket
 */
async function sendWorldDetailState(socket: TypedSocket, worldId: WorldId): Promise<void> {
  try {
    const world = await WorldModel.findById(worldId);
    if (!world) {
      console.error(`[Socket] World not found: ${worldId}`);
      return;
    }

    // Send world-specific detailed data
    const update: WorldUpdate = {
      worldId: world.id as WorldId,
      gdp: world.gdp,
      population: world.population,
      prosperityIndex: world.prosperityIndex,
      tradeBalance: world.tradeBalance,
      totalExports: world.totalExports,
      totalImports: world.totalImports,
    };

    socket.emit(SOCKET_EVENTS.WORLD_UPDATE as 'world.update', update);
  } catch (error) {
    console.error(`[Socket] Error sending world detail state:`, error);
  }
}

/**
 * Send unified map state for V2 single world (all parcels)
 * Sends ALL parcels across all worlds without filtering
 */
function sendGameMapState(socket: TypedSocket): void {
  const timeState = timeServer.getState();

  // Get ALL map data (not filtered by world)
  const payload: MapStatePayload = {
    map: mapState.getFullMapData(),
    time: {
      dayIndex: timeState.dayIndex,
      minuteOfDay: timeState.minuteOfDay,
      phase: timeState.phase,
      hourDisplay: timeServer.getTimeDisplay(),
      isNewPhase: false,
    },
    connectedSpectators: spectatorCount,
  };

  socket.emit('map_state', payload);
  console.log(`[Socket] Sent unified map state (${payload.map.parcels.length} parcels)`);
}

/**
 * Send map state for a specific world
 * Filters parcels and objects to only include those belonging to this world
 */
function sendWorldMapState(socket: TypedSocket, worldId: WorldId): void {
  const timeState = timeServer.getState();

  // Get map data filtered by worldId
  const payload: MapStatePayload = {
    map: mapState.getMapDataForWorld(worldId),
    time: {
      dayIndex: timeState.dayIndex,
      minuteOfDay: timeState.minuteOfDay,
      phase: timeState.phase,
      hourDisplay: timeServer.getTimeDisplay(),
      isNewPhase: false,
    },
    connectedSpectators: spectatorCount,
  };

  socket.emit('map_state', payload);
  console.log(`[Socket] Sent map state for world: ${worldId} (${payload.map.parcels.length} parcels)`);
}

/**
 * Broadcast spectator count to all connected clients
 */
function broadcastSpectatorCount(): void {
  if (!io) return;
  io.emit('connected', { spectatorCount });
}

/**
 * Broadcast a city event to all spectators
 */
export function broadcastEvent(event: RealtimeEvent): void {
  if (!io) return;

  // Broadcast to all spectators
  io.emit('city_event', event);

  // Also emit to parcel-specific room if applicable
  if (event.parcelId) {
    io.to(`parcel:${event.parcelId}`).emit('city_event', event);
  }
}

/**
 * Broadcast map state update to ALL world map rooms
 * Use broadcastMapStateToWorld(worldId) for world-specific updates
 * @deprecated Prefer broadcastMapStateToWorld for specific worlds
 */
export function broadcastMapState(): void {
  if (!io) return;

  // In multiverse architecture, we don't broadcast map state globally
  // This is kept for backward compatibility but does nothing
  console.log('[Socket] broadcastMapState() called - use broadcastMapStateToWorld() instead');
}

/**
 * Get the Socket.io server instance
 */
export function getIO(): TypedServer {
  return io;
}

/**
 * Get current spectator count
 */
export function getSpectatorCount(): number {
  return spectatorCount;
}

// ============================================================================
// MULTIVERSE SOCKET FUNCTIONS
// ============================================================================

/**
 * Build and send multiverse state to a socket
 * Uses Redis cache for exchange rates when available
 */
async function sendMultiverseState(socket: TypedSocket): Promise<void> {
  const startTime = Date.now();
  console.log(`[Socket ${startTime}] SYNC_BUILD_START: ${socket.id}`);
  try {
    const timeState = timeServer.getState();
    console.log(`[Socket ${Date.now()}] SYNC_TIME: day=${timeState.dayIndex}, minute=${timeState.minuteOfDay}`);

    const worlds = await WorldModel.find();
    console.log(`[Socket ${Date.now()}] SYNC_WORLDS: found ${worlds.length} worlds`);
    const recentTrades = await TradeModel.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('sellerId', 'name')
      .populate('buyerId', 'name');

    // Build world state map
    const worldsMap: MultiverseSyncState['worlds'] = {} as MultiverseSyncState['worlds'];

    for (const world of worlds) {
      worldsMap[world.id as WorldId] = {
        id: world.id as WorldId,
        name: world.name,
        tagline: world.tagline,
        gdp: world.gdp,
        population: world.population,
        prosperityIndex: world.prosperityIndex,
        tradeBalance: world.tradeBalance,
        armySize: (world as unknown as Record<string, unknown>).armySize as number ?? 0,
        territoryCount: (world as unknown as Record<string, unknown>).territoryCount as number ?? 0,
        currency: world.currency,
      };
    }

    // Build recent trades array
    const tradesData: TradeCompleted[] = recentTrades.map((trade) => {
      // Populated refs are objects with _id+name; extract properly
      const sellerRef = trade.sellerId as unknown as { _id?: { toString(): string }; name?: string } | null;
      const buyerRef = trade.buyerId as unknown as { _id?: { toString(): string }; name?: string } | null;
      const sellerId = sellerRef && typeof sellerRef === 'object' && sellerRef._id
        ? sellerRef._id.toString()
        : trade.sellerId?.toString() || '';
      const buyerId = buyerRef && typeof buyerRef === 'object' && buyerRef._id
        ? buyerRef._id.toString()
        : trade.buyerId?.toString() || '';
      return {
        tradeId: trade.id,
        offerId: trade.offerId?.toString(),
        sellerId,
        sellerName: sellerRef?.name || 'Unknown',
        buyerId,
        buyerName: buyerRef?.name || 'Unknown',
        sellerWorldId: trade.sellerWorldId,
        buyerWorldId: trade.buyerWorldId,
        resourceId: trade.resourceId,
        quantity: trade.quantity,
        totalPrice: trade.totalPrice,
        currency: trade.currency,
      };
    });

    // Fetch active offers for sync
    const activeOfferDocs = await TradeOfferModel.find({
      status: { $in: ['open', 'partial'] },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 }).limit(20).populate('sellerId', 'name worldId').lean();

    const activeOffersData: TradeOfferCreated[] = activeOfferDocs.map(offer => {
      const seller = offer.sellerId as unknown as { _id: string; name: string; worldId: string };
      return {
        offerId: String(offer._id),
        sellerId: seller?._id?.toString() || '',
        sellerName: seller?.name || 'Unknown',
        sellerWorldId: (seller?.worldId || offer.sellerWorldId) as WorldId,
        resourceId: offer.resourceId as ResourceId,
        quantity: offer.remainingQuantity ?? offer.quantity,
        pricePerUnit: offer.pricePerUnit,
        currency: offer.currency,
      };
    });

    const syncState: MultiverseSyncState = {
      time: {
        day: timeState.dayIndex,
        hour: Math.floor(timeState.minuteOfDay / 60),
        minute: timeState.minuteOfDay % 60,
        speed: 1,
        isPaused: false,
      },
      worlds: worldsMap,
      exchangeRates: {}, // V2: Single currency (Crown), no exchange rates
      recentTrades: tradesData,
      activeOffers: activeOffersData,
    };

    const emitTime = Date.now();
    console.log(`[Socket ${emitTime}] SYNC_EMIT: ${socket.id} with ${Object.keys(worldsMap).length} worlds (build took ${emitTime - startTime}ms)`);
    socket.emit(SOCKET_EVENTS.SYNC_STATE as 'sync.state', syncState);
    console.log(`[Socket ${Date.now()}] SYNC_SENT: ${socket.id}`);
  } catch (error) {
    console.error(`[Socket ${Date.now()}] SYNC_ERROR: ${socket.id}`, error);
  }
}

/**
 * Broadcast time tick to multiverse room only
 */
export function broadcastTimeTick(tick: TimeTick): void {
  if (!io) return;
  // Only send to clients in the multiverse room
  io.to('multiverse').emit(SOCKET_EVENTS.TIME_TICK as 'time.tick', tick);
}

/**
 * Broadcast trade completed to multiverse room
 */
export function broadcastTradeOfferCreated(offer: TradeOfferCreated): void {
  if (!io) return;
  io.to('multiverse').emit(SOCKET_EVENTS.TRADE_OFFER_CREATED as 'trade.offer.created', offer);
  io.to(`world:${offer.sellerWorldId}`).emit(SOCKET_EVENTS.TRADE_OFFER_CREATED as 'trade.offer.created', offer);
}

export function broadcastTradeCompleted(trade: TradeCompleted): void {
  if (!io) return;
  // Send to multiverse room and affected world rooms
  io.to('multiverse').emit(SOCKET_EVENTS.TRADE_COMPLETED as 'trade.completed', trade);
  io.to(`world:${trade.sellerWorldId}`).emit(SOCKET_EVENTS.TRADE_COMPLETED as 'trade.completed', trade);
  if (trade.buyerWorldId !== trade.sellerWorldId) {
    io.to(`world:${trade.buyerWorldId}`).emit(SOCKET_EVENTS.TRADE_COMPLETED as 'trade.completed', trade);
  }
}

/**
 * Broadcast world update to multiverse room and specific world room
 */
export function broadcastWorldUpdate(update: WorldUpdate): void {
  if (!io) return;
  // Send to multiverse room (summary) and specific world room (detail)
  io.to('multiverse').emit(SOCKET_EVENTS.WORLD_UPDATE as 'world.update', update);
  io.to(`world:${update.worldId}`).emit(SOCKET_EVENTS.WORLD_UPDATE as 'world.update', update);
}


/**
 * Broadcast batch world updates to multiverse room
 */
export function broadcastWorldUpdateBatch(batch: WorldUpdateBatch): void {
  if (!io) return;
  io.to('multiverse').emit(SOCKET_EVENTS.WORLD_UPDATE_BATCH as 'world.update.batch', batch);
}

/**
 * Broadcast market price updates to multiverse room
 */
export function broadcastMarketPrices(batch: PriceUpdateBatch): void {
  if (!io) return;
  io.to('multiverse').emit(SOCKET_EVENTS.MARKET_PRICE_BATCH as 'market.price.batch', batch);
}

/**
 * Broadcast map state to a specific world's map room only
 * Filters parcels and objects to only include those belonging to this world
 */
export function broadcastMapStateToWorld(worldId: WorldId): void {
  if (!io) return;
  const timeState = timeServer.getState();

  const payload: MapStatePayload = {
    map: mapState.getMapDataForWorld(worldId),
    time: {
      dayIndex: timeState.dayIndex,
      minuteOfDay: timeState.minuteOfDay,
      phase: timeState.phase,
      hourDisplay: timeServer.getTimeDisplay(),
      isNewPhase: false,
    },
    connectedSpectators: spectatorCount,
  };

  // Only send to clients in the world:<id>:map room
  io.to(`world:${worldId}:map`).emit('map_state', payload);
}

/**
 * Broadcast unified map state to game:map room (V2: single world)
 * Sends all parcels across all worlds
 */
export function broadcastGameMapState(): void {
  if (!io) return;
  const timeState = timeServer.getState();
  const payload: MapStatePayload = {
    map: mapState.getFullMapData(),
    time: {
      dayIndex: timeState.dayIndex,
      minuteOfDay: timeState.minuteOfDay,
      phase: timeState.phase,
      hourDisplay: timeServer.getTimeDisplay(),
      isNewPhase: false,
    },
    connectedSpectators: spectatorCount,
  };
  io.to('game:map').emit('map_state', payload);
}

// ============================================================================
// PARCEL SOCKET FUNCTIONS
// ============================================================================

/**
 * Broadcast parcel created event to world map room
 * Called when a new agent registers and gets assigned a parcel
 */
export function broadcastParcelCreated(
  worldId: WorldId,
  parcel: MapParcel,
  objects: MapObject[],
  agent: {
    id: string;
    name: string;
    aiModel: string;
    type?: string;
    legacyMessage?: string;
    registeredAt: string;
  }
): void {
  if (!io) return;

  const payload: ParcelCreatedPayload = {
    parcel,
    objects,
    agent,
  };

  const event = {
    type: 'parcel_created' as const,
    timestamp: new Date().toISOString(),
    payload,
    scope: 'global' as const,
    parcelId: parcel.id,
  };

  // Send to world map room
  io.to(`world:${worldId}:map`).emit('city_event', event);

  // Also broadcast to unified game:map room (V2)
  io.to('game:map').emit('city_event', event);

  console.log(`[Socket] Broadcast parcel_created: ${parcel.id} to world:${worldId}:map and game:map`);
}

/**
 * Broadcast parcel updated event to world map room
 * Called when parcel data changes (legacy message, buildings, etc.)
 */
export function broadcastParcelUpdated(
  worldId: WorldId,
  parcelId: string,
  changes: ParcelUpdatedPayload['changes']
): void {
  if (!io) return;

  const payload: ParcelUpdatedPayload = {
    parcelId,
    changes,
  };

  const event = {
    type: 'parcel_updated' as const,
    timestamp: new Date().toISOString(),
    payload,
    scope: 'parcel' as const,
    parcelId,
  };

  // Send to world map room
  io.to(`world:${worldId}:map`).emit('city_event', event);

  // Also broadcast to unified game:map room (V2)
  io.to('game:map').emit('city_event', event);

  console.log(`[Socket] Broadcast parcel_updated: ${parcelId} to world:${worldId}:map and game:map`);
}

