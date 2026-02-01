/**
 * Socket Event Constants and Type Helpers
 *
 * Re-exports typed event names from shared package
 * and provides helper functions for event handling.
 */

export { SOCKET_EVENTS } from '@agentropolis/shared';
export type {
  ServerToClientEvents,
  ClientToServerEvents,
  TimeTick,
  WorldUpdate,
  WorldUpdateBatch,
  TradeCompleted,
  TradeOfferCreated,
  PriceUpdateBatch,
  ExchangeRateBatch,
  MultiverseSyncState,
  MapStatePayload,
  RealtimeEvent,
  SocketRoom,
  RoomJoinPayload,
  RoomLeavePayload,
} from '@agentropolis/shared';
