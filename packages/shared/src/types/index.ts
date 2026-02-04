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
  // pacing summaries (S3.6)
  type DailySnapshotData,
  type WeeklySummaryData,
  // spectator HUD (S4.1)
  type HudMetricsV1,
  toHudMetrics,
  // feed channels (S4.2)
  type FeedChannel,
  // season goals (S5.1)
  type SeasonGoal,
  type SeasonGoalsPayload,
  type SeasonOutcomeData,
  // arc cards (S5.2, S5.3)
  type ArcCard,
  type CharacterCard,
  // highlight reel (S5.4)
  type HighlightMoment,
  type HighlightReelPayload,
  // policy vote (S5.5)
  type PolicyCategory,
  type PolicyOption,
  type PolicyVotePayload,
  type ActivePolicyModifiers,
  // season report (S5.7)
  type SeasonReportPayload,
} from '../contracts/v2/index';
