/**
 * Socket event names and typed event maps for Socket.io generic typing.
 */

import type {
  CitySyncPayload,
  ChunkPayloadData,
  TickCompletePayload,
  NewsPublishedPayload,
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
  ActionResultPayload,
  AgentJoinedPayload,
  AgentUpdatedPayload,
  AgentPromotedPayload,
  CrimeCommittedPayload,
  CrimeArrestedPayload,
  SpectatorSyncPayload,
  FeedEvent,
  AgentsUpdatePayload,
  EventsBatchPayload,
  CityMetricsPayload,
} from './payloads';

// ============ EVENT NAMES ============

export const SOCKET_EVENTS = {
  // Server -> Client
  CITY_SYNC: 'city:sync',
  CHUNK_PAYLOAD: 'chunk:payload',
  TICK_COMPLETE: 'tick:complete',
  NEWS_PUBLISHED: 'news:published',
  CONNECTED: 'connected',
  AGENT_JOINED: 'agent:joined',
  AGENT_UPDATED: 'agent:updated',
  AGENT_PROMOTED: 'agent:promoted',
  CRIME_COMMITTED: 'crime:committed',
  CRIME_ARRESTED: 'crime:arrested',
  SPECTATOR_SYNC: 'spectator:sync',
  FEED_EVENT: 'feed:event',
  CITY_METRICS: 'city:metrics',
  ACTION_RESULT: 'action:result',
  AGENTS_UPDATE: 'agents:update',
  EVENTS_BATCH: 'events:batch',

  // Client -> Server
  CITY_RESYNC: 'city:resync',
  VIEWPORT_SUBSCRIBE: 'viewport:subscribe',
  VIEWPORT_UNSUBSCRIBE: 'viewport:unsubscribe',
  WORLD_PLACE_BUILDING: 'world:placeBuilding',
  WORLD_REMOVE_BUILDING: 'world:removeBuilding',
  PARCEL_BUY: 'parcel:buy',
  AGENT_REGISTER: 'agent:register',
  AGENT_ACTION: 'agent:action',
} as const;

// ============ TYPED SOCKET INTERFACES ============

/** Server -> Client event map (for Socket.io generic typing) */
export interface ServerToClientEvents {
  'city:sync': (data: CitySyncPayload) => void;
  'chunk:payload': (data: ChunkPayloadData) => void;
  'tick:complete': (data: TickCompletePayload) => void;
  'news:published': (data: NewsPublishedPayload) => void;
  'connected': (data: { spectatorCount: number }) => void;
  'agent:joined': (data: AgentJoinedPayload) => void;
  'agent:updated': (data: AgentUpdatedPayload) => void;
  'agent:promoted': (data: AgentPromotedPayload) => void;
  'crime:committed': (data: CrimeCommittedPayload) => void;
  'crime:arrested': (data: CrimeArrestedPayload) => void;
  'spectator:sync': (data: SpectatorSyncPayload) => void;
  'feed:event': (data: FeedEvent) => void;
  'city:metrics': (data: CityMetricsPayload) => void;
  'action:result': (data: ActionResultPayload) => void;
  'agents:update': (data: AgentsUpdatePayload) => void;
  'events:batch': (data: EventsBatchPayload) => void;
}

/** Client -> Server event map */
export interface ClientToServerEvents {
  'city:resync': () => void;
  'viewport:subscribe': (payload: ViewportSubscribePayload) => void;
  'viewport:unsubscribe': (payload: ViewportUnsubscribePayload) => void;
  'world:placeBuilding': (
    payload: WorldPlaceBuildingPayload,
    ack: (response: WorldPlaceBuildingResponse) => void,
  ) => void;
  'world:removeBuilding': (
    payload: WorldRemoveBuildingPayload,
    ack: (response: WorldRemoveBuildingResponse) => void,
  ) => void;
  'parcel:buy': (
    payload: ParcelBuyPayload,
    ack: (response: ParcelBuyResponse) => void,
  ) => void;
  'agent:register': (
    payload: AgentRegisterPayload,
    ack: (response: AgentRegisterResponse) => void,
  ) => void;
  'agent:action': (
    payload: AgentActionPayload,
    ack: (response: AgentActionResponse) => void,
  ) => void;
}
