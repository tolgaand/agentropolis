/**
 * Socket Module - Unified Real-time Communication
 *
 * V2 architecture:
 * - Single socket connection via singleton (socket.client.ts)
 * - Centralized state via context (socket.context.tsx)
 * - Chunk-based viewport subscriptions via V2MultiDataSource
 * - Event subscription via hook (useEvent.ts)
 */

// Core singleton
export { getSocket, disconnectSocket, isSocketConnected, reconnectSocket } from './socket.client';
export type { TypedSocket } from './socket.client';

// Context and Provider
export {
  SocketProvider,
  useSocketContext,
  useSocket,
  useConnectionStatus,
  useIsReady,
  useCurrentTick,
  useCitySync,
  useRecentNews,
  useSpectatorCount,
  useAgents,
  useFeedEvents,
  useEconomy,
  useCityMetrics,
  useTickPulse,
} from './socket.context';
export type { ConnectionStatus } from './socket.context';

// Room management (V1 stub — V2 uses chunk subscriptions)
export { useRoom, useRoomSubscription } from './useRoom';
export { ROOMS, parseRoom, isMapRoom } from './socket.rooms';

// Event subscription
export { useEvent, useEvents } from './useEvent';

// V2 contract re-exports for convenience
export { SOCKET_EVENTS } from './socket.events';
export type { ServerToClientEvents, ClientToServerEvents } from './socket.events';
