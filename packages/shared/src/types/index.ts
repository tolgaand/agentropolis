export * from './common';
export * from './city';
export * from './agent';
export * from './building';
export * from './event';
export * from './economy';

// Re-export contracts/v2, but exclude NewsSeverity which conflicts with event.ts definition
export {
  // enums (Season/ZoneType already re-exported via city.ts)
  type PlacementSource,
  type CityMode,
  type AgentActionType,
  type SocketRole,
  // coords
  type ChunkCoord,
  type WorldCoord,
  CHUNK_SIZE,
  worldToChunk,
  chunkToWorld,
  worldToLocal,
  // payloads
  type Placement,
  type CitySyncPayload,
  type ChunkPayloadData,
  type TickCompletePayload,
  type NewsPublishedPayload,
  type NewsItem,
  type ViewportSubscribePayload,
  type ViewportUnsubscribePayload,
  type WorldPlaceBuildingPayload,
  type WorldPlaceBuildingResponse,
  type WorldRemoveBuildingPayload,
  type WorldRemoveBuildingResponse,
  // agent payloads
  type AgentRegisterPayload,
  type AgentRegisterResponse,
  type AgentActionPayload,
  type AgentActionResponse,
  type AgentSnapshotPayload,
  type AgentJoinedPayload,
  type AgentUpdatedPayload,
  type AgentPromotedPayload,
  type CrimeCommittedPayload,
  type CrimeArrestedPayload,
  // events
  SOCKET_EVENTS,
  type ServerToClientEvents,
  type ClientToServerEvents,
} from '../contracts/v2/index';
