/**
 * Socket Module - Unified Real-time Communication
 *
 * This module provides a centralized socket management system for the app.
 * ALL socket connections MUST go through this module - no direct socket.io usage elsewhere.
 *
 * ARCHITECTURE:
 * - Single socket connection via singleton (socket.client.ts)
 * - Centralized state via context (socket.context.tsx)
 * - Room lifecycle via hook (useRoom.ts)
 * - Event subscription via hook (useEvent.ts)
 * - Raw socket access via hook (useSocket.ts)
 *
 * USAGE:
 * 1. Wrap app with SocketProvider (already done in App.tsx)
 * 2. Use hooks in components:
 *    - useSocketContext() for full state access
 *    - useSocket() for raw socket access
 *    - useRoom('multiverse') for room subscription
 *    - useEvent('time.tick', handler) for event subscription
 *    - useWorld(worldId), useWorlds(), etc. for specific data
 *
 * MIGRATION NOTE (Jan 31, 2026):
 * - Removed duplicate SocketContext.tsx from context/ folder
 * - Refactored useCityState.ts and useTimeState.ts to use centralized socket
 * - All pages now use this unified socket module
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
  useGameTime,
  useWorlds,
  useWorld,
  useExchangeRates,
  useRecentTrades,
  useMapState,
  usePrices,
  useActiveOffers,
  useActiveBattles,
  useRecentBattles,
  useActiveSieges,
} from './socket.context';
export type { ConnectionStatus, WorldState, PriceData } from './socket.context';

// Room management
export { useRoom, useRoomSubscription } from './useRoom';
export { ROOMS, parseRoom, isMapRoom } from './socket.rooms';

// Event subscription
export { useEvent, useEvents } from './useEvent';

// Type re-exports for convenience
export type {
  SocketRoom,
  TimeTick,
  WorldUpdate,
  TradeCompleted,
  MapStatePayload,
} from './socket.events';
