/**
 * Socket Context - Unified Real-time State Management
 *
 * ARCHITECTURE:
 * - Single socket connection via socket.client.ts singleton
 * - Centralized state for all real-time data (worlds, trades, prices, etc.)
 * - Room subscription managed via hooks (useRoom)
 * - Event subscription via hooks (useEvent)
 *
 * MIGRATION FROM SocketContext.tsx:
 * - All existing hooks are preserved for backwards compatibility
 * - useCityState.ts functionality is merged into this context
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { getSocket, disconnectSocket, type TypedSocket } from './socket.client';
import { ROOMS, isMapRoom } from './socket.rooms';
import type {
  TimeTick,
  WorldUpdate,
  TradeCompleted,
  PriceUpdateBatch,
  MultiverseSyncState,
  MapStatePayload,
  SocketRoom,
  WorldId,
  RealtimeEvent,
  TimeState,
  MapData,
  BattleEvent,
  BattleTickEvent,
  BattleResolvedEvent,
  TerritoryCapturedEvent,
  SiegeEvent,
  TradeOfferCreated,
  ArmyMarchEvent,
  ArmyMarchProgressEvent,
  ArmyMarchArrivedEvent,
  ArmyMarchRecalledEvent,
} from '@agentropolis/shared';

// ============================================================================
// Types
// ============================================================================

/**
 * Connection status state machine
 * idle -> connecting -> connected -> synced
 *                   \-> disconnected -> retrying -> connecting
 */
export type ConnectionStatus =
  | 'idle'           // Initial state, not yet started
  | 'connecting'     // Socket.io attempting to connect
  | 'connected'      // Socket connected, waiting for sync
  | 'synced'         // Connected and received initial sync state
  | 'disconnected'   // Connection lost
  | 'retrying'       // Attempting to reconnect
  | 'failed';        // Failed after max retries

export interface WorldState {
  id: WorldId;
  name: string;
  tagline: string;
  gdp: number;
  population: number;
  prosperityIndex: number;
  tradeBalance: number;
  currency: { code: string; symbol: string; name: string };
}

export interface PriceData {
  resourceId: string;
  worldId: string;
  price: number;
  change24h: number;
}

export interface MarchingArmyVisual {
  armyId: string;
  factionId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number;
  speed: number;
  unitCount: number;
}

export interface ContestedParcel {
  parcelId: string;
  blockX: number;
  blockY: number;
  attackerFaction: string;
  defenderFaction: string;
  startTime: number;
  duration: number; // 90000ms
}

interface RealtimeState {
  // Connection
  connectionStatus: ConnectionStatus;
  connected: boolean;  // Convenience: status === 'synced'
  currentRoom: SocketRoom | null;
  retryCount: number;
  retryIn: number | null;

  // Multiverse data
  time: TimeTick | null;
  worlds: Record<string, WorldState>;
  exchangeRates: Record<string, number>;
  recentTrades: TradeCompleted[];
  prices: Record<string, PriceData>;
  lastPriceUpdateAt: number | null;
  lastSyncAt: number | null;

  // Trade offers
  activeOffers: TradeOfferCreated[];

  // Battle data
  activeBattles: BattleEvent[];
  recentBattles: BattleResolvedEvent[];
  activeSieges: SiegeEvent[];

  // Army marches
  marchingArmies: Map<string, MarchingArmyVisual>;

  // Contested parcels
  contestedParcels: Map<string, ContestedParcel>;

  // Map data (only when in world:*:map room)
  mapState: MapStatePayload | null;
  mapData: MapData | null;
  mapTimeState: TimeState | null;
  spectatorCount: number;
}

interface SocketContextValue extends RealtimeState {
  socket: TypedSocket | null;
  joinRoom: (room: SocketRoom) => void;
  leaveRoom: (room: SocketRoom) => void;
  requestSync: () => void;
  reconnect: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const DEFAULT_TIME_STATE: TimeState = {
  dayIndex: 1,
  minuteOfDay: 540,
  phase: 'day',
  hourDisplay: '09:00',
  isNewPhase: false,
};

const initialState: RealtimeState = {
  connectionStatus: 'idle',
  connected: false,
  currentRoom: null,
  time: null,
  worlds: {},
  exchangeRates: {},
  recentTrades: [],
  prices: {},
  lastPriceUpdateAt: null,
  lastSyncAt: null,
  retryCount: 0,
  retryIn: null,

  // Trade offers
  activeOffers: [],

  // Battle state
  activeBattles: [],
  recentBattles: [],
  activeSieges: [],

  // Army marches
  marchingArmies: new Map(),

  // Contested parcels
  contestedParcels: new Map(),

  // Map state
  mapState: null,
  mapData: null,
  mapTimeState: DEFAULT_TIME_STATE,
  spectatorCount: 0,
};

// ============================================================================
// Reconnection Config (Exponential Backoff with Jitter)
// ============================================================================

const RETRY_CONFIG = {
  baseDelay: 1000,      // 1 second
  maxDelay: 30000,      // 30 seconds max
  maxRetries: 10,       // Give up after 10 retries
  jitterFactor: 0.3,    // 30% jitter
};

function getRetryDelay(retryCount: number): number {
  const exponentialDelay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, retryCount),
    RETRY_CONFIG.maxDelay
  );
  const jitter = exponentialDelay * RETRY_CONFIG.jitterFactor * Math.random();
  return Math.floor(exponentialDelay + jitter);
}

// ============================================================================
// Context
// ============================================================================

const SocketContext = createContext<SocketContextValue | null>(null);

// Sync watchdog timeout (ms) - if sync.state not received within this time, request sync
const SYNC_WATCHDOG_TIMEOUT = 5000;

// ============================================================================
// Provider
// ============================================================================

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [state, setState] = useState<RealtimeState>(initialState);
  // Isolate time state to prevent re-renders of non-time-consuming components
  const [timeState, setTimeState] = useState<TimeTick | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Throttle price updates to 250ms (max 4 updates/second)
  const priceUpdateThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPricesRef = useRef<PriceUpdateBatch | null>(null);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (syncWatchdogRef.current) {
      clearTimeout(syncWatchdogRef.current);
      syncWatchdogRef.current = null;
    }
    if (priceUpdateThrottleRef.current) {
      clearTimeout(priceUpdateThrottleRef.current);
      priceUpdateThrottleRef.current = null;
    }
  }, []);

  // Initialize socket connection
  useEffect(() => {
    setState((s) => ({ ...s, connectionStatus: 'connecting' }));

    const socketInstance = getSocket();

    // === CONNECTION EVENTS ===
    socketInstance.on('connect', () => {
      const connectTime = Date.now();
      console.log(`[Socket ${connectTime}] CONNECT: id=${socketInstance.id}`);
      clearTimers();
      setState((s) => ({
        ...s,
        connectionStatus: 'connected',
        retryCount: 0,
        retryIn: null,
      }));

      // Auto-join multiverse room for basic functionality
      console.log(`[Socket ${Date.now()}] ROOM_JOIN_EMIT: multiverse`);
      socketInstance.emit('room.join', { room: ROOMS.MULTIVERSE });

      // Sync watchdog: if sync.state not received within timeout, request sync as fallback
      syncWatchdogRef.current = setTimeout(() => {
        console.log(`[Socket ${Date.now()}] SYNC_WATCHDOG: sync.state not received within ${SYNC_WATCHDOG_TIMEOUT}ms, requesting sync`);
        socketInstance.emit('sync.request', {});
      }, SYNC_WATCHDOG_TIMEOUT);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setState((s) => ({
        ...s,
        connectionStatus: 'disconnected',
        connected: false,
      }));
    });

    socketInstance.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setState((s) => ({
        ...s,
        connectionStatus: 'disconnected',
        connected: false,
      }));
    });

    // === SYNC EVENTS ===
    socketInstance.on('sync.state', (data: MultiverseSyncState) => {
      const receiveTime = Date.now();
      console.log(`[Socket ${receiveTime}] SYNC_RECEIVED: ${Object.keys(data.worlds || {}).length} worlds`);

      // Clear sync watchdog - sync received successfully
      if (syncWatchdogRef.current) {
        clearTimeout(syncWatchdogRef.current);
        syncWatchdogRef.current = null;
      }

      // Set time state separately
      setTimeState(data.time);
      setState((s) => ({
        ...s,
        connectionStatus: 'synced',
        connected: true,
        worlds: data.worlds,
        exchangeRates: data.exchangeRates,
        recentTrades: data.recentTrades,
        activeOffers: data.activeOffers || [],
        activeBattles: data.activeBattles || [],
        recentBattles: data.recentBattles || [],
        activeSieges: data.activeSieges || [],
        lastSyncAt: receiveTime,
        retryCount: 0,
        retryIn: null,
      }));
    });

    // === TIME EVENTS ===
    socketInstance.on('time.tick', (data: TimeTick) => {
      // Use separate state to isolate time updates
      setTimeState(data);
    });

    // === WORLD EVENTS ===
    socketInstance.on('world.update', (data: WorldUpdate) => {
      setState((s) => ({
        ...s,
        worlds: {
          ...s.worlds,
          [data.worldId]: {
            ...s.worlds[data.worldId],
            ...data,
          },
        },
      }));
    });

    socketInstance.on('world.update.batch', (data: { updates: WorldUpdate[] }) => {
      setState((s) => {
        const newWorlds = { ...s.worlds };
        for (const update of data.updates) {
          newWorlds[update.worldId] = {
            ...newWorlds[update.worldId],
            ...update,
          };
        }
        return { ...s, worlds: newWorlds };
      });
    });

    // === TRADE EVENTS ===
    socketInstance.on('trade.offer.created', (data: TradeOfferCreated) => {
      console.log('[Socket] Trade offer created:', data.offerId);
      setState((s) => ({
        ...s,
        activeOffers: [data, ...s.activeOffers],
      }));
    });

    socketInstance.on('trade.completed', (data: TradeCompleted) => {
      setState((s) => ({
        ...s,
        recentTrades: [data, ...s.recentTrades.slice(0, 19)],
        // Remove/update the offer that was fulfilled
        activeOffers: data.offerId
          ? s.activeOffers.filter((o) => o.offerId !== data.offerId)
          : s.activeOffers,
      }));
    });

    // === MARKET EVENTS ===
    socketInstance.on('market.price.batch', (data: PriceUpdateBatch) => {
      console.log('[Socket] Price update', data);

      // Throttle price updates to 250ms
      pendingPricesRef.current = data;

      if (!priceUpdateThrottleRef.current) {
        priceUpdateThrottleRef.current = setTimeout(() => {
          const batchData = pendingPricesRef.current;
          if (batchData) {
            setState((s) => {
              const newPrices = { ...s.prices };
              for (const update of batchData.updates) {
                const key = update.resourceId;
                newPrices[key] = {
                  resourceId: update.resourceId,
                  worldId: '', // worldId not available in PriceUpdate type
                  price: update.price,
                  change24h: update.change24h,
                };
              }
              return { ...s, prices: newPrices, lastPriceUpdateAt: Date.now() };
            });
            pendingPricesRef.current = null;
          }
          priceUpdateThrottleRef.current = null;
        }, 250);
      }
    });

    // === BATTLE EVENTS ===
    socketInstance.on('battle.started', (data: BattleEvent) => {
      console.log('[Socket] Battle started:', data.battleId);
      setState((s) => ({
        ...s,
        activeBattles: [...s.activeBattles, data],
      }));
    });

    socketInstance.on('battle.tick', (data: BattleTickEvent) => {
      setState((s) => ({
        ...s,
        activeBattles: s.activeBattles.map((battle) =>
          battle.battleId === data.battleId
            ? { ...battle, attackerArmy: data.attackerRemaining, defenderArmy: data.defenderRemaining, status: data.status }
            : battle
        ),
      }));
    });

    socketInstance.on('battle.resolved', (data: BattleResolvedEvent) => {
      console.log('[Socket] Battle resolved:', data.battleId, data.victor);
      setState((s) => ({
        ...s,
        activeBattles: s.activeBattles.filter((battle) => battle.battleId !== data.battleId),
        recentBattles: [data, ...s.recentBattles.slice(0, 19)], // Keep last 20
      }));
    });

    socketInstance.on('territory.captured', (data: TerritoryCapturedEvent) => {
      console.log('[Socket] Territory captured:', data.parcelId, 'by', data.capturedBy);
      setState((s) => {
        // Remove from contested parcels
        const newContested = new Map(s.contestedParcels);
        const captured = newContested.get(data.parcelId);
        newContested.delete(data.parcelId);

        // Emit capture complete event (for floating text notification in renderer)
        // This will be handled in CityCommand via a separate effect
        if (captured) {
          console.log(`[Socket] Parcel ${data.parcelId} captured by ${data.capturedBy} after 90s contest`);
        }

        return { ...s, contestedParcels: newContested };
      });
    });

    socketInstance.on('siege.started', (data: SiegeEvent) => {
      console.log('[Socket] Siege started:', data.siegeId);
      setState((s) => ({
        ...s,
        activeSieges: [...s.activeSieges, data],
      }));
    });

    // === ARMY MARCH EVENTS ===
    socketInstance.on('army.march.started', (data: ArmyMarchEvent) => {
      console.log('[Socket] Army march started:', data.armyId);
      setState((s) => {
        const newMarchingArmies = new Map(s.marchingArmies);
        newMarchingArmies.set(data.armyId, {
          armyId: data.armyId,
          factionId: data.factionId,
          fromX: data.from.x,
          fromY: data.from.y,
          toX: data.to.x,
          toY: data.to.y,
          progress: data.progress,
          speed: data.speed,
          unitCount: 0, // Will be updated from backend if needed
        });
        return { ...s, marchingArmies: newMarchingArmies };
      });
    });

    socketInstance.on('army.march.progress', (data: ArmyMarchProgressEvent) => {
      setState((s) => {
        const newMarchingArmies = new Map(s.marchingArmies);
        const army = newMarchingArmies.get(data.armyId);
        if (army) {
          newMarchingArmies.set(data.armyId, {
            ...army,
            progress: data.progress,
          });
        }
        return { ...s, marchingArmies: newMarchingArmies };
      });
    });

    socketInstance.on('army.march.arrived', (data: ArmyMarchArrivedEvent) => {
      console.log('[Socket] Army march arrived:', data.armyId);
      setState((s) => {
        const newMarchingArmies = new Map(s.marchingArmies);
        newMarchingArmies.delete(data.armyId);
        return { ...s, marchingArmies: newMarchingArmies };
      });
    });

    socketInstance.on('army.march.recalled', (data: ArmyMarchRecalledEvent) => {
      console.log('[Socket] Army march recalled:', data.armyId);
      setState((s) => {
        const newMarchingArmies = new Map(s.marchingArmies);
        newMarchingArmies.delete(data.armyId);
        return { ...s, marchingArmies: newMarchingArmies };
      });
    });

    // === MAP STATE EVENTS (from useCityState) ===
    socketInstance.on('map_state', (data: MapStatePayload) => {
      console.log('[Socket] Received map_state');
      setState((s) => ({
        ...s,
        mapState: data,
        mapData: data.map,
        mapTimeState: data.time,
        spectatorCount: data.connectedSpectators,
      }));
    });

    // === CITY EVENTS (from useCityState) ===
    socketInstance.on('city_event', (event: RealtimeEvent) => {
      console.log('[Socket] Received city_event', event.type);
      handleCityEvent(event, setState);
    });

    // === CONNECTION INFO ===
    socketInstance.on('connected', (data: { spectatorCount: number }) => {
      setState((s) => ({ ...s, spectatorCount: data.spectatorCount }));
    });

    setSocket(socketInstance);

    return () => {
      clearTimers();
      disconnectSocket();
    };
  }, [clearTimers]);

  // Auto-retry on disconnect
  useEffect(() => {
    if (state.connectionStatus !== 'disconnected' || !socket) return;

    const { retryCount } = state;

    if (retryCount >= RETRY_CONFIG.maxRetries) {
      console.log('[Socket] Max retries reached, giving up');
      setState((s) => ({ ...s, connectionStatus: 'failed' }));
      return;
    }

    // Clear any existing timers before starting new ones
    clearTimers();

    const delay = getRetryDelay(retryCount);
    console.log(`[Socket] Will retry in ${delay}ms (attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries})`);

    setState((s) => ({
      ...s,
      connectionStatus: 'retrying',
      retryIn: Math.ceil(delay / 1000),
    }));

    // Countdown timer
    countdownRef.current = setInterval(() => {
      setState((s) => ({
        ...s,
        retryIn: s.retryIn !== null ? Math.max(0, s.retryIn - 1) : null,
      }));
    }, 1000);

    // Retry timer
    retryTimerRef.current = setTimeout(() => {
      clearTimers();
      setState((s) => ({
        ...s,
        connectionStatus: 'connecting',
        retryCount: s.retryCount + 1,
        retryIn: null,
      }));
      socket.connect();
    }, delay);

    // NO cleanup return here - timers are cleared elsewhere
  }, [state.connectionStatus, state.retryCount, socket, clearTimers]);

  // Cleanup timers on unmount only
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // === ACTION CALLBACKS ===

  const requestSync = useCallback(() => {
    if (socket?.connected) {
      socket.emit('sync.request', {});
    }
  }, [socket]);

  const reconnect = useCallback(() => {
    if (!socket) return;
    clearTimers();
    setState((s) => ({
      ...s,
      connectionStatus: 'connecting',
      retryCount: 0,
      retryIn: null,
    }));
    socket.connect();
  }, [socket, clearTimers]);

  const joinRoom = useCallback(
    (room: SocketRoom) => {
      if (!socket?.connected) {
        console.log('[Socket] Cannot join room - not connected');
        return;
      }
      console.log(`[Socket] Joining room: ${room}`);
      socket.emit('room.join', { room });
      setState((s) => ({ ...s, currentRoom: room }));
    },
    [socket]
  );

  const leaveRoom = useCallback(
    (room: SocketRoom) => {
      if (!socket?.connected) return;
      console.log(`[Socket] Leaving room: ${room}`);
      socket.emit('room.leave', { room });
      setState((s) => ({
        ...s,
        currentRoom: s.currentRoom === room ? null : s.currentRoom,
        // Clear map state if leaving a map room
        mapState: isMapRoom(room) ? null : s.mapState,
        mapData: isMapRoom(room) ? null : s.mapData,
      }));
    },
    [socket]
  );

  const value: SocketContextValue = {
    ...state,
    time: timeState,
    socket,
    joinRoom,
    leaveRoom,
    requestSync,
    reconnect,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

// ============================================================================
// City Event Handler (from useCityState)
// ============================================================================

function formatTime(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function handleCityEvent(
  event: RealtimeEvent,
  setState: React.Dispatch<React.SetStateAction<RealtimeState>>
) {
  switch (event.type) {
    case 'time_changed': {
      const payload = event.payload as {
        dayIndex: number;
        minuteOfDay: number;
        phase: 'morning' | 'day' | 'evening' | 'night';
        previousPhase: 'morning' | 'day' | 'evening' | 'night';
      };
      setState((s) => ({
        ...s,
        mapTimeState: {
          dayIndex: payload.dayIndex,
          minuteOfDay: payload.minuteOfDay,
          phase: payload.phase,
          hourDisplay: formatTime(payload.minuteOfDay),
          isNewPhase: payload.phase !== payload.previousPhase,
        },
      }));
      break;
    }

    case 'parcel_created': {
      const payload = event.payload as {
        parcel: MapStatePayload['map']['parcels'][0];
        objects: MapStatePayload['map']['objects'];
      };
      setState((s) => {
        if (!s.mapData) return s;
        return {
          ...s,
          mapData: {
            ...s.mapData,
            parcels: [...s.mapData.parcels, payload.parcel],
            objects: [...s.mapData.objects, ...payload.objects],
          },
        };
      });
      break;
    }

    case 'building_created': {
      const payload = event.payload as {
        object: MapStatePayload['map']['objects'][0];
      };
      setState((s) => {
        if (!s.mapData) return s;
        return {
          ...s,
          mapData: {
            ...s.mapData,
            objects: [...s.mapData.objects, payload.object],
          },
        };
      });
      break;
    }

    case 'building_upgraded': {
      const payload = event.payload as {
        buildingId: string;
        parcelId: string;
        level: number;
      };
      setState((s) => {
        if (!s.mapData) return s;
        return {
          ...s,
          mapData: {
            ...s.mapData,
            objects: s.mapData.objects.map((o) =>
              o.id === payload.buildingId
                ? { ...o, level: payload.level }
                : o
            ),
          },
        };
      });
      break;
    }

    case 'building_removed': {
      const payload = event.payload as {
        objectId: string;
        parcelId: string;
      };
      setState((s) => {
        if (!s.mapData) return s;
        return {
          ...s,
          mapData: {
            ...s.mapData,
            objects: s.mapData.objects.filter((o) => o.id !== payload.objectId),
          },
        };
      });
      break;
    }

    case 'parcel_contested': {
      const payload = event.payload as {
        blockX: number;
        blockY: number;
        claimingWorldId: string;
        originalWorldId: string;
        captureProgress: number;
      };
      const parcelId = event.parcelId || `${payload.blockX},${payload.blockY}`;
      console.log(`[Socket] Parcel contested: ${parcelId}, attacker=${payload.claimingWorldId}, defender=${payload.originalWorldId}`);
      setState((s) => {
        const newContested = new Map(s.contestedParcels);
        newContested.set(parcelId, {
          parcelId,
          blockX: payload.blockX,
          blockY: payload.blockY,
          attackerFaction: payload.claimingWorldId,
          defenderFaction: payload.originalWorldId,
          startTime: Date.now(),
          duration: 90000, // 90 seconds
        });
        return { ...s, contestedParcels: newContested };
      });
      break;
    }

    default:
      // Log unknown events for debugging
      console.log('[Socket] Unhandled city_event:', event.type);
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Get the full socket context including socket instance and all state
 */
export function useSocketContext(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}

/**
 * Get the raw socket instance for direct event subscription
 * Returns null if socket is not yet initialized
 */
export function useSocket(): TypedSocket | null {
  const { socket } = useSocketContext();
  return socket;
}

/**
 * Get connection status
 */
export function useConnectionStatus(): ConnectionStatus {
  const { connectionStatus } = useSocketContext();
  return connectionStatus;
}

/**
 * Check if socket is synced and ready
 */
export function useIsReady(): boolean {
  const { connectionStatus } = useSocketContext();
  return connectionStatus === 'synced';
}

/**
 * Get current game time (isolated state to prevent unnecessary re-renders)
 */
export function useGameTime(): TimeTick | null {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useGameTime must be used within a SocketProvider');
  }
  return context.time;
}

/**
 * Get all worlds
 */
export function useWorlds(): Record<string, WorldState> {
  const { worlds } = useSocketContext();
  return worlds;
}

/**
 * Get a specific world by ID
 */
export function useWorld(worldId: WorldId): WorldState | null {
  const { worlds } = useSocketContext();
  return worlds[worldId] || null;
}

/**
 * Get exchange rates
 */
export function useExchangeRates(): Record<string, number> {
  const { exchangeRates } = useSocketContext();
  return exchangeRates;
}

/**
 * Get recent trades
 */
export function useRecentTrades(): TradeCompleted[] {
  const { recentTrades } = useSocketContext();
  return recentTrades;
}

/**
 * Get map state (only available when in world:*:map room)
 */
export function useMapState(): MapStatePayload | null {
  const { mapState } = useSocketContext();
  return mapState;
}

/**
 * Get prices with last update time
 */
export function usePrices(): {
  prices: Record<string, PriceData>;
  lastPriceUpdateAt: number | null;
} {
  const { prices, lastPriceUpdateAt } = useSocketContext();
  return { prices, lastPriceUpdateAt };
}

/**
 * Get active trade offers
 */
export function useActiveOffers(): TradeOfferCreated[] {
  const { activeOffers } = useSocketContext();
  return activeOffers;
}

/**
 * Get active battles
 */
export function useActiveBattles(): BattleEvent[] {
  const { activeBattles } = useSocketContext();
  return activeBattles;
}

/**
 * Get recent completed battles
 */
export function useRecentBattles(): BattleResolvedEvent[] {
  const { recentBattles } = useSocketContext();
  return recentBattles;
}

/**
 * Get active sieges
 */
export function useActiveSieges(): SiegeEvent[] {
  const { activeSieges } = useSocketContext();
  return activeSieges;
}

/**
 * Get marching armies
 */
export function useMarchingArmies(): Map<string, MarchingArmyVisual> {
  const { marchingArmies } = useSocketContext();
  return marchingArmies;
}

/**
 * Get contested parcels
 */
export function useContestedParcels(): Map<string, ContestedParcel> {
  const { contestedParcels } = useSocketContext();
  return contestedParcels;
}

// Export for backwards compatibility with old SocketContext
export { SocketProvider as default };
