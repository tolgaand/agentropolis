/**
 * Socket Context - Unified Real-time State Management
 *
 * ARCHITECTURE:
 * - Single socket connection via socket.client.ts singleton
 * - Centralized state for all real-time data
 * - V2 contracts only — no V1 types
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
import type {
  CitySyncPayload,
  TickCompletePayload,
  NewsPublishedPayload,
  NewsItem,
  SpectatorSyncPayload,
  FeedEvent,
  AgentSnapshotPayload,
  AgentJoinedPayload,
  AgentUpdatedPayload,
  ActionResultPayload,
  AgentsUpdatePayload,
  EventsBatchPayload,
  CityMetricsPayload,
} from '@agentropolis/shared/contracts/v2';

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

interface RealtimeState {
  // Connection
  connectionStatus: ConnectionStatus;
  connected: boolean;  // Convenience: status === 'synced'
  retryCount: number;
  retryIn: number | null;

  // City sync
  citySync: CitySyncPayload | null;

  // Tick
  currentTick: number;

  // News
  recentNews: NewsItem[];

  // Spectators
  spectatorCount: number;

  // Agents (keyed by agent id)
  agents: Map<string, AgentSnapshotPayload>;

  // Unified feed events
  feedEvents: FeedEvent[];

  // Economy snapshot from last tick
  economySnapshot: TickCompletePayload['economy'] | null;

  // Full city metrics from city:metrics event
  cityMetrics: CityMetricsPayload | null;

  // Tick pulse flag (briefly true on each tick:complete)
  tickPulse: boolean;
}

interface SocketContextValue extends RealtimeState {
  socket: TypedSocket | null;
  reconnect: () => void;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: RealtimeState = {
  connectionStatus: 'idle',
  connected: false,
  retryCount: 0,
  retryIn: null,
  citySync: null,
  currentTick: 0,
  recentNews: [],
  spectatorCount: 0,
  agents: new Map(),
  feedEvents: [],
  economySnapshot: null,
  cityMetrics: null,
  tickPulse: false,
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

// ============================================================================
// Provider
// ============================================================================

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const [state, setState] = useState<RealtimeState>(initialState);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  }, []);

  // Initialize socket connection
  useEffect(() => {
    setState((s) => ({ ...s, connectionStatus: 'connecting' }));

    const socketInstance = getSocket();

    // === CONNECTION EVENTS ===
    socketInstance.on('connect', () => {
      console.log(`[Socket] CONNECT: id=${socketInstance.id}`);
      clearTimers();
      setState((s) => ({
        ...s,
        connectionStatus: 'connected',
        retryCount: 0,
        retryIn: null,
      }));
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

    // === V2 EVENTS ===

    socketInstance.on('city:sync', (data: CitySyncPayload) => {
      console.log(`[Socket] city:sync: mode=${data.mode}, seed=${data.seed}, tick=${data.tickNo}`);
      setState((s) => ({
        ...s,
        connectionStatus: 'synced',
        connected: true,
        citySync: data,
        currentTick: data.tickNo,
        retryCount: 0,
        retryIn: null,
      }));
    });

    socketInstance.on('tick:complete', (data: TickCompletePayload) => {
      setState((s) => ({
        ...s,
        currentTick: data.tick,
        economySnapshot: data.economy ?? s.economySnapshot,
        tickPulse: true,
      }));
      // Reset tick pulse after 600ms
      setTimeout(() => {
        setState((s) => ({ ...s, tickPulse: false }));
      }, 600);
    });

    // city:metrics — full metrics payload from tick engine
    socketInstance.on('city:metrics', (data: CityMetricsPayload) => {
      setState((s) => ({
        ...s,
        cityMetrics: data,
      }));
    });

    socketInstance.on('news:published', (data: NewsPublishedPayload) => {
      setState((s) => ({
        ...s,
        recentNews: [...data.items, ...s.recentNews].slice(0, 50),
      }));
    });

    socketInstance.on('connected', (data: { spectatorCount: number }) => {
      setState((s) => ({ ...s, spectatorCount: data.spectatorCount }));
    });

    // Spectator sync — hydrate agents + feedEvents + economy on connect
    socketInstance.on('spectator:sync', (data: SpectatorSyncPayload) => {
      console.log(
        `[Socket] spectator:sync: ${data.agents.length} agents, ${data.recentEvents.length} events`,
      );
      const agentMap = new Map<string, AgentSnapshotPayload>();
      for (const agent of data.agents) {
        agentMap.set(agent.id, agent);
      }
      setState((s) => ({
        ...s,
        agents: agentMap,
        feedEvents: data.recentEvents.slice(0, 200),
        economySnapshot: data.economy ?? null,
        cityMetrics: data.metrics ?? null,
      }));
    });

    // Feed event — prepend to feedEvents
    socketInstance.on('feed:event', (data: FeedEvent) => {
      setState((s) => ({
        ...s,
        feedEvents: [data, ...s.feedEvents].slice(0, 200),
      }));
    });

    // Agent joined — upsert into agents map
    socketInstance.on('agent:joined', (data: AgentJoinedPayload) => {
      setState((s) => {
        const newMap = new Map(s.agents);
        newMap.set(data.agent.id, data.agent);
        return { ...s, agents: newMap };
      });
    });

    // Agent updated — upsert into agents map
    socketInstance.on('agent:updated', (data: AgentUpdatedPayload) => {
      setState((s) => {
        const newMap = new Map(s.agents);
        newMap.set(data.agent.id, data.agent);
        return { ...s, agents: newMap };
      });
    });

    // Action result — update agent snapshot if provided
    socketInstance.on('action:result', (data: ActionResultPayload) => {
      console.log(
        `[Socket] action:result: ${data.actionType} → ${data.ok ? 'ok' : data.reason} (tick=${data.tick})`,
      );
      if (data.agent) {
        setState((s) => {
          const newMap = new Map(s.agents);
          newMap.set(data.agentId, data.agent!);
          return { ...s, agents: newMap };
        });
      }
    });

    // Agents update — batch top N agents per tick
    socketInstance.on('agents:update', (data: AgentsUpdatePayload) => {
      setState((s) => {
        const newMap = new Map(s.agents);
        for (const agent of data.agents) {
          newMap.set(agent.id, agent);
        }
        return { ...s, agents: newMap };
      });
    });

    // Events batch — batch of events from this tick
    socketInstance.on('events:batch', (data: EventsBatchPayload) => {
      setState((s) => ({
        ...s,
        feedEvents: [...data.events, ...s.feedEvents].slice(0, 200),
      }));
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
  }, [state.connectionStatus, state.retryCount, socket, clearTimers]);

  // Cleanup timers on unmount only
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  // === ACTION CALLBACKS ===

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

  const value: SocketContextValue = {
    ...state,
    socket,
    reconnect,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
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
 * Get current tick number
 */
export function useCurrentTick(): number {
  const { currentTick } = useSocketContext();
  return currentTick;
}

/**
 * Get city sync data
 */
export function useCitySync(): CitySyncPayload | null {
  const { citySync } = useSocketContext();
  return citySync;
}

/**
 * Get recent news items
 */
export function useRecentNews(): NewsItem[] {
  const { recentNews } = useSocketContext();
  return recentNews;
}

/**
 * Get spectator count
 */
export function useSpectatorCount(): number {
  const { spectatorCount } = useSocketContext();
  return spectatorCount;
}

/**
 * Get all active agents as an array
 */
export function useAgents(): AgentSnapshotPayload[] {
  const { agents } = useSocketContext();
  return Array.from(agents.values());
}

/**
 * Get unified feed events
 */
export function useFeedEvents(): FeedEvent[] {
  const { feedEvents } = useSocketContext();
  return feedEvents;
}

/**
 * Get last economy snapshot
 */
export function useEconomy(): TickCompletePayload['economy'] | null {
  const { economySnapshot } = useSocketContext();
  return economySnapshot;
}

/**
 * Get full city metrics
 */
export function useCityMetrics(): CityMetricsPayload | null {
  const { cityMetrics } = useSocketContext();
  return cityMetrics;
}

/**
 * Get tick pulse flag (briefly true on each tick:complete)
 */
export function useTickPulse(): boolean {
  const { tickPulse } = useSocketContext();
  return tickPulse;
}

// Export for backwards compatibility with old SocketContext
export { SocketProvider as default };
