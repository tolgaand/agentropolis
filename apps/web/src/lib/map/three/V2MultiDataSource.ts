/**
 * V2MultiDataSource - Router + providers for offline/stub/real data layers
 *
 * Supports three modes:
 *   - 'offline': Pure procedural + user overrides (OfflineDataSource)
 *   - 'stub': Deterministic fake "authoritative" chunk data simulating backend
 *   - 'real': Actual backend socket connection, DB-backed chunk payloads
 *
 * StubProvider generates backend-shaped chunk payloads using seed + chunk coords.
 * SocketProvider connects to the backend via socket.io and receives real chunk data.
 *
 * The "active chunks" set tracks AOI subscription state.
 */

import { TILES_PER_CHUNK, ASSET_REGISTRY, SeededRandom } from './V2Config';
import { type BuildingInfo } from './V2Stores';
import type {
  ChunkPayloadData,
  CitySyncPayload,
  Placement,
} from '@agentropolis/shared/contracts/v2';
import { SOCKET_EVENTS } from '@agentropolis/shared/contracts/v2';
import {
  getSocket,
  reconnectSocket,
  type TypedSocket,
} from '../../../socket/socket.client';

// ============ TYPES ============

export type DataSourceMode = 'offline' | 'stub' | 'real';

/** Backend-compatible chunk payload shape (legacy local format) */
export interface ChunkPayload {
  chunkX: number;
  chunkZ: number;
  buildings: ChunkBuilding[];
}

/** Single building in a chunk payload (legacy local format) */
export interface ChunkBuilding {
  id: string;
  type: string;
  worldX: number;
  worldZ: number;
  rotY: number;       // degrees: 0, 90, 180, 270
  level: number;
  ownerId?: string;
}

// ============ CONVERSION HELPERS ============

/**
 * Convert shared Placement (from backend chunk:payload) into BuildingInfo.
 */
function placementToBuildingInfo(
  p: Placement,
  chunkX: number,
  chunkZ: number,
  index: number,
): BuildingInfo {
  const meta = ASSET_REGISTRY[p.assetKey];
  const localX = ((p.worldX % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
  const localZ = ((p.worldZ % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;

  return {
    id: p.buildingId ?? `real_${chunkX}_${chunkZ}_${index}_${p.worldX}_${p.worldZ}`,
    worldX: p.worldX,
    worldZ: p.worldZ,
    chunkX,
    chunkZ,
    localX,
    localZ,
    type: p.type,
    level: p.level ?? 1,
    assetKey: p.assetKey,
    tileW: meta?.tileW ?? 1,
    tileD: meta?.tileD ?? 1,
    rotation: p.rotY ? (p.rotY * Math.PI / 180) : undefined,
  };
}

/**
 * Convert ChunkPayloadData (shared contract) into BuildingInfo[].
 */
export function chunkPayloadToBuildingInfos(data: ChunkPayloadData): BuildingInfo[] {
  return data.placements.map((p, i) => placementToBuildingInfo(p, data.chunkX, data.chunkZ, i));
}

// ============ STUB PROVIDER ============

/** Asset keys eligible for stub generation (1x1 buildings only for simplicity) */
const STUB_BUILDING_KEYS = Object.entries(ASSET_REGISTRY)
  .filter(([, m]) => m.type === 'building' && m.tileW === 1 && m.tileD === 1)
  .map(([k]) => k);

/** 2x2 building keys for occasional larger placements */
const STUB_LARGE_KEYS = Object.entries(ASSET_REGISTRY)
  .filter(([, m]) => m.type === 'building' && m.tileW === 2 && m.tileD === 2)
  .map(([k]) => k);

/**
 * Generate a deterministic chunk payload given chunk coords.
 * Uses a seed derived from chunk position for reproducibility.
 */
export function generateStubChunk(chunkX: number, chunkZ: number): ChunkPayload {
  // Deterministic seed from chunk coords
  const chunkSeed = Math.abs(chunkX * 73856093 + chunkZ * 19349663 + 42) % 2147483647 || 1;
  const rng = new SeededRandom(chunkSeed);

  const buildings: ChunkBuilding[] = [];

  // Place 2-5 buildings per chunk on buildable tiles (not on roads)
  const count = 2 + Math.floor(rng.next() * 4);

  for (let i = 0; i < count; i++) {
    // Pick a random buildable tile (avoid roads at localX/Z % 4 === 0)
    let localX: number;
    let localZ: number;
    let attempts = 0;
    do {
      localX = Math.floor(rng.next() * TILES_PER_CHUNK);
      localZ = Math.floor(rng.next() * TILES_PER_CHUNK);
      attempts++;
    } while ((localX % 4 === 0 || localZ % 4 === 0) && attempts < 20);

    if (localX % 4 === 0 || localZ % 4 === 0) continue;

    const worldX = chunkX * TILES_PER_CHUNK + localX;
    const worldZ = chunkZ * TILES_PER_CHUNK + localZ;

    // 80% small, 20% large
    const useLarge = rng.next() < 0.2 && STUB_LARGE_KEYS.length > 0;
    const key = useLarge
      ? STUB_LARGE_KEYS[Math.floor(rng.next() * STUB_LARGE_KEYS.length)]
      : STUB_BUILDING_KEYS[Math.floor(rng.next() * STUB_BUILDING_KEYS.length)];

    const rotOptions = [0, 90, 180, 270];
    const rotY = rotOptions[Math.floor(rng.next() * 4)];

    buildings.push({
      id: `stub_${chunkX}_${chunkZ}_${i}`,
      type: ASSET_REGISTRY[key].type,
      worldX,
      worldZ,
      rotY,
      level: 1 + Math.floor(rng.next() * 3),
      ownerId: rng.next() < 0.3 ? `agent_${Math.floor(rng.next() * 100)}` : undefined,
    });

    // Attach the assetKey — not in the backend shape but needed for rendering
    (buildings[buildings.length - 1] as ChunkBuilding & { assetKey: string }).assetKey = key;
  }

  return { chunkX, chunkZ, buildings };
}

/**
 * Convert a ChunkPayload into BuildingInfo[] suitable for the RealLayer store.
 */
export function payloadToBuildingInfos(payload: ChunkPayload): BuildingInfo[] {
  return payload.buildings.map(b => {
    const assetKey = (b as ChunkBuilding & { assetKey?: string }).assetKey ?? '';
    const meta = ASSET_REGISTRY[assetKey];
    const localX = ((b.worldX % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
    const localZ = ((b.worldZ % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;

    return {
      id: b.id,
      worldX: b.worldX,
      worldZ: b.worldZ,
      chunkX: payload.chunkX,
      chunkZ: payload.chunkZ,
      localX,
      localZ,
      type: b.type,
      level: b.level,
      assetKey,
      tileW: meta?.tileW ?? 1,
      tileD: meta?.tileD ?? 1,
      rotation: b.rotY ? (b.rotY * Math.PI / 180) : undefined,
    };
  });
}

// ============ SOCKET PROVIDER ============

export interface SocketProviderCallbacks {
  onCitySync?: (data: CitySyncPayload) => void;
  onChunkPayload?: (data: ChunkPayloadData, buildings: BuildingInfo[]) => void;
  onConnected?: (spectatorCount: number) => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
}

export class SocketProvider {
  private socket: TypedSocket | null = null;
  private callbacks: SocketProviderCallbacks;
  private citySync: CitySyncPayload | null = null;
  private connected = false;
  private pendingSubscribes: Array<{ chunkX: number; chunkZ: number }> = [];

  constructor(callbacks: SocketProviderCallbacks) {
    this.callbacks = callbacks;
  }

  get isConnected(): boolean { return this.connected; }
  get lastCitySync(): CitySyncPayload | null { return this.citySync; }

  connect(): void {
    if (this.socket) return;

    this.socket = getSocket();

    this.socket.on(SOCKET_EVENTS.CITY_SYNC as 'city:sync', (data) => {
      this.citySync = data;
      this.connected = true;
      console.log(`[SocketProvider] city:sync received: mode=${data.mode}, seed=${data.seed}`);
      this.callbacks.onCitySync?.(data);

      // Re-subscribe any pending chunks after (re)connect
      if (this.pendingSubscribes.length > 0) {
        console.log(`[SocketProvider] Re-subscribing ${this.pendingSubscribes.length} pending chunks`);
        this.socket!.emit(
          SOCKET_EVENTS.VIEWPORT_SUBSCRIBE as 'viewport:subscribe',
          { chunks: this.pendingSubscribes },
        );
      }
    });

    this.socket.on(SOCKET_EVENTS.CHUNK_PAYLOAD as 'chunk:payload', (data) => {
      const buildings = chunkPayloadToBuildingInfos(data);
      console.log(
        `[SocketProvider] chunk:payload (${data.chunkX},${data.chunkZ}): ` +
        `${data.placements.length} placements → ${buildings.length} buildings`,
      );
      this.callbacks.onChunkPayload?.(data, buildings);
    });

    this.socket.on(SOCKET_EVENTS.CONNECTED as 'connected', (data) => {
      this.callbacks.onConnected?.(data.spectatorCount);
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('[SocketProvider] Disconnected');
      this.callbacks.onDisconnect?.();
    });

    this.socket.on('connect', () => {
      if (this.citySync) {
        // This is a reconnect (we had a previous sync)
        console.log('[SocketProvider] Reconnected');
        this.callbacks.onReconnect?.();
      }
    });

    // If socket is already connected (singleton was created by React context),
    // city:sync was already emitted before our listener was registered.
    // Mark as connected and re-request city:sync from server.
    if (this.socket.connected) {
      this.connected = true;
      console.log('[SocketProvider] Socket already connected, requesting city:resync');
      this.socket.emit('city:resync');
    }
  }

  disconnect(): void {
    this.connected = false;
    this.citySync = null;
    this.pendingSubscribes = [];
    // Don't destroy the singleton socket, just remove listeners
    if (this.socket) {
      this.socket.off(SOCKET_EVENTS.CITY_SYNC as 'city:sync');
      this.socket.off(SOCKET_EVENTS.CHUNK_PAYLOAD as 'chunk:payload');
      this.socket.off(SOCKET_EVENTS.CONNECTED as 'connected');
      this.socket.off('disconnect');
      this.socket.off('connect');
      this.socket = null;
    }
  }

  subscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>): void {
    // Track for reconnect
    for (const c of chunks) {
      const key = `${c.chunkX},${c.chunkZ}`;
      if (!this.pendingSubscribes.some(p => `${p.chunkX},${p.chunkZ}` === key)) {
        this.pendingSubscribes.push(c);
      }
    }

    if (this.socket?.connected) {
      this.socket.emit(
        SOCKET_EVENTS.VIEWPORT_SUBSCRIBE as 'viewport:subscribe',
        { chunks },
      );
    }
  }

  unsubscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>): void {
    // Remove from pending
    const removeKeys = new Set(chunks.map(c => `${c.chunkX},${c.chunkZ}`));
    this.pendingSubscribes = this.pendingSubscribes.filter(
      c => !removeKeys.has(`${c.chunkX},${c.chunkZ}`),
    );

    if (this.socket?.connected) {
      this.socket.emit(
        SOCKET_EVENTS.VIEWPORT_UNSUBSCRIBE as 'viewport:unsubscribe',
        { chunks },
      );
    }
  }

  /** Force reconnect the socket */
  reconnect(): void {
    reconnectSocket();
  }

  /** Get underlying socket for advanced use */
  getSocket(): TypedSocket | null {
    return this.socket;
  }
}

// ============ MULTI-SOURCE ROUTER ============

export interface MultiSourceRouterCallbacks {
  onChunkLoaded?: (chunkX: number, chunkZ: number, buildings: BuildingInfo[]) => void;
  onChunkUpdated?: (chunkX: number, chunkZ: number, buildings: BuildingInfo[]) => void;
  onModeChanged?: (mode: DataSourceMode) => void;
  onCitySync?: (data: CitySyncPayload) => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
}

export class MultiSourceRouter {
  private _mode: DataSourceMode = 'offline';
  private activeChunks = new Set<string>();
  private callbacks: MultiSourceRouterCallbacks = {};

  /** Chunk payload cache for stub mode (deterministic, so safe to cache) */
  private stubCache = new Map<string, ChunkPayload>();

  /** Socket provider for real mode */
  private socketProvider: SocketProvider | null = null;

  /** Track last city:sync */
  private lastSync: CitySyncPayload | null = null;

  constructor(callbacks?: MultiSourceRouterCallbacks) {
    if (callbacks) this.callbacks = callbacks;
  }

  get mode(): DataSourceMode { return this._mode; }
  get citySync(): CitySyncPayload | null { return this.lastSync; }
  get isSocketConnected(): boolean { return this.socketProvider?.isConnected ?? false; }

  /**
   * Connect socket eagerly (before switching to real mode).
   * When city:sync arrives, onCitySync callback fires so renderer can auto-switch.
   */
  connectEagerly(): void {
    if (this.socketProvider) return; // already connected
    console.log('[MultiSource] Connecting eagerly (waiting for city:sync)...');
    this.initSocketProvider();
  }

  setMode(mode: DataSourceMode): void {
    if (mode === this._mode) return;
    const prev = this._mode;
    this._mode = mode;
    console.log(`[MultiSource] Mode: ${prev} → ${mode}`);

    // Tear down socket when entering non-real mode (covers eager socket too)
    if (mode !== 'real' && this.socketProvider) {
      this.socketProvider.disconnect();
      this.socketProvider = null;
    }

    // Set up socket when entering real mode (skip if already connected eagerly)
    if (mode === 'real' && !this.socketProvider) {
      this.initSocketProvider();
    }

    this.callbacks.onModeChanged?.(mode);

    // When switching to stub, load data for already-subscribed chunks
    if (mode === 'stub') {
      for (const key of this.activeChunks) {
        const [cx, cz] = key.split(',').map(Number);
        this.loadStubChunk(cx, cz);
      }
    }
  }

  private initSocketProvider(): void {
    this.socketProvider = new SocketProvider({
      onCitySync: (data) => {
        this.lastSync = data;
        this.callbacks.onCitySync?.(data);
      },
      onChunkPayload: (data, buildings) => {
        const key = `${data.chunkX},${data.chunkZ}`;
        if (this.activeChunks.has(key)) {
          // Determine if this is initial load or update
          this.callbacks.onChunkUpdated?.(data.chunkX, data.chunkZ, buildings);
        }
      },
      onConnected: (count) => {
        console.log(`[MultiSource] Spectators: ${count}`);
      },
      onDisconnect: () => {
        this.callbacks.onDisconnect?.();
      },
      onReconnect: () => {
        this.callbacks.onReconnect?.();
      },
    });
    this.socketProvider.connect();
  }

  /**
   * Subscribe to chunks (AOI).
   * In stub mode, immediately generates and delivers data.
   * In real mode, sends viewport:subscribe to server.
   * In offline mode, just tracks which chunks are "active".
   */
  subscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>): BuildingInfo[] {
    const allBuildings: BuildingInfo[] = [];
    const newChunks: Array<{ chunkX: number; chunkZ: number }> = [];

    for (const { chunkX, chunkZ } of chunks) {
      const key = `${chunkX},${chunkZ}`;
      if (this.activeChunks.has(key)) continue;
      this.activeChunks.add(key);
      newChunks.push({ chunkX, chunkZ });

      if (this._mode === 'stub') {
        const buildings = this.loadStubChunk(chunkX, chunkZ);
        allBuildings.push(...buildings);
      }
    }

    // In real mode, send subscribe to server
    if (this._mode === 'real' && newChunks.length > 0 && this.socketProvider) {
      this.socketProvider.subscribeChunks(newChunks);
      // Buildings will arrive asynchronously via onChunkPayload callback
    }

    return allBuildings;
  }

  /**
   * Unsubscribe from chunks.
   */
  unsubscribeChunks(chunks: Array<{ chunkX: number; chunkZ: number }>): void {
    const removedChunks: Array<{ chunkX: number; chunkZ: number }> = [];

    for (const { chunkX, chunkZ } of chunks) {
      const key = `${chunkX},${chunkZ}`;
      if (this.activeChunks.has(key)) {
        this.activeChunks.delete(key);
        removedChunks.push({ chunkX, chunkZ });
      }
    }

    // In real mode, send unsubscribe to server
    if (this._mode === 'real' && removedChunks.length > 0 && this.socketProvider) {
      this.socketProvider.unsubscribeChunks(removedChunks);
    }
  }

  /** Get all currently active chunk keys */
  getActiveChunks(): Array<{ chunkX: number; chunkZ: number }> {
    return Array.from(this.activeChunks).map(k => {
      const [cx, cz] = k.split(',').map(Number);
      return { chunkX: cx, chunkZ: cz };
    });
  }

  /** Get buildings for a specific chunk from stub provider */
  getBuildingsForChunk(chunkX: number, chunkZ: number): BuildingInfo[] {
    if (this._mode !== 'stub') return [];
    const key = `${chunkX},${chunkZ}`;
    if (!this.activeChunks.has(key)) return [];

    const cached = this.stubCache.get(key);
    if (cached) return payloadToBuildingInfos(cached);

    const payload = generateStubChunk(chunkX, chunkZ);
    this.stubCache.set(key, payload);
    return payloadToBuildingInfos(payload);
  }

  /** Get the raw chunk payload (backend shape) for inspection */
  getRawPayload(chunkX: number, chunkZ: number): ChunkPayload | null {
    const key = `${chunkX},${chunkZ}`;
    const cached = this.stubCache.get(key);
    if (cached) return cached;
    if (this._mode === 'stub') {
      const payload = generateStubChunk(chunkX, chunkZ);
      this.stubCache.set(key, payload);
      return payload;
    }
    return null;
  }

  /** Get the socket provider for advanced operations */
  getSocketProvider(): SocketProvider | null {
    return this.socketProvider;
  }

  /** Force reconnect in real mode */
  reconnect(): void {
    if (this._mode === 'real' && this.socketProvider) {
      this.socketProvider.reconnect();
    }
  }

  /** Clear all subscriptions and cache */
  reset(): void {
    // Unsubscribe from server if in real mode
    if (this._mode === 'real' && this.socketProvider) {
      const chunks = this.getActiveChunks();
      if (chunks.length > 0) {
        this.socketProvider.unsubscribeChunks(chunks);
      }
      this.socketProvider.disconnect();
      this.socketProvider = null;
    }
    this.activeChunks.clear();
    this.stubCache.clear();
    this.lastSync = null;
  }

  private loadStubChunk(chunkX: number, chunkZ: number): BuildingInfo[] {
    const key = `${chunkX},${chunkZ}`;
    let payload = this.stubCache.get(key);
    if (!payload) {
      payload = generateStubChunk(chunkX, chunkZ);
      this.stubCache.set(key, payload);
    }

    const buildings = payloadToBuildingInfos(payload);
    this.callbacks.onChunkLoaded?.(chunkX, chunkZ, buildings);
    return buildings;
  }
}
