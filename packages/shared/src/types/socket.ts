/**
 * Socket.io Types for Agentropolis
 *
 * SPECTATOR-FIRST ARCHITECTURE:
 * - Spectators receive all data via sockets (no HTTP polling)
 * - Initial sync_state sent on connect
 * - Live updates via world/trade/battle events
 * - APIs are for agent actions only
 *
 * EVENT NAMING: namespace.action
 * - time.tick: Game clock updates
 * - world.update: World state changes
 * - trade.*: Trade events
 * - market.*: Price updates
 * - battle.*: Battle events
 * - sync.*: State synchronization
 */

import type { TimePhase, TimeState } from './time';
import type { MapData, MapParcel, MapObject } from './map';
import type { WorldId, ResourceId } from './world';
import type {
  ArmyMarchEvent,
  ArmyMarchProgressEvent,
  ArmyMarchArrivedEvent,
  ArmyMarchRecalledEvent
} from './army';

// ============================================================================
// Event Types
// ============================================================================

export type RealtimeEventType =
  // Parcel events
  | 'parcel_created'
  | 'parcel_updated'
  | 'parcel_removed'
  | 'parcel_contested'
  // Building events
  | 'building_created'
  | 'building_upgraded'
  | 'building_removed'
  // Agent events
  | 'agent_registered'
  | 'agent_updated'
  // Time events
  | 'time_changed'
  // Economy events
  | 'auction_created'
  | 'auction_bid'
  | 'auction_ended'
  // City events
  | 'event_started'
  | 'event_ended';

export type EventScope = 'global' | 'parcel';

export interface RealtimeEvent<T = unknown> {
  type: RealtimeEventType;
  timestamp: string;
  payload: T;
  scope: EventScope;
  parcelId?: string;
}

// ============================================================================
// Parcel Theme System (Medieval)
// ============================================================================

export type ParcelTheme =
  | 'farming'       // Farms, granaries
  | 'military'      // Barracks, walls
  | 'trade'         // Markets, warehouses
  | 'residential'   // Houses, cottages
  | 'noble'         // Castle, academy
  | 'mixed';        // Default

// ============================================================================
// Spectator Socket Events
// ============================================================================

export interface MapStatePayload {
  map: MapData;
  time: TimeState;
  connectedSpectators: number;
}

export interface ParcelCreatedPayload {
  parcel: MapParcel;
  objects: MapObject[];
  agent: {
    id: string;
    name: string;
    aiModel: string;
    type?: string;
    legacyMessage?: string;
    registeredAt: string;
  };
}

export interface ParcelUpdatedPayload {
  parcelId: string;
  changes: {
    objects?: MapObject[];
    legacyMessage?: string;
    agentData?: {
      name?: string;
      legacyMessage?: string;
    };
  };
}

export interface BuildingCreatedPayload {
  parcelId: string;
  object: MapObject;
  agentId: string;
}

export interface TimeChangedPayload {
  dayIndex: number;
  minuteOfDay: number;
  phase: TimePhase;
  previousPhase: TimePhase;
}

export interface AgentRegisteredPayload {
  agentId: string;
  agentName: string;
  agentType: string;
  parcelId: string;
  legacyMessage?: string;
}

export interface AuctionBidPayload {
  auctionId: string;
  bidderId: string;
  amount: number;
  previousAmount: number;
}

// ============================================================================
// Socket.io Interface Definitions
// ============================================================================

// ============================================================================
// Room Subscription System
// ============================================================================

export type SocketRoom =
  | 'multiverse'
  | `world:${WorldId}`
  | `world:${WorldId}:map`
  | 'game:map'; // V2: Unified single world map room

export interface RoomJoinPayload {
  room: SocketRoom;
}

export interface RoomLeavePayload {
  room: SocketRoom;
}

export interface ClientToServerEvents {
  'room.join': (payload: RoomJoinPayload) => void;
  'room.leave': (payload: RoomLeavePayload) => void;
  request_state: () => void;
  join_parcel: (parcelId: string) => void;
  leave_parcel: (parcelId: string) => void;
  'sync.request': (data: Record<string, never>) => void;
}

export interface ServerToClientEvents {
  map_state: (payload: MapStatePayload) => void;
  city_event: (event: RealtimeEvent) => void;
  connected: (data: { spectatorCount: number }) => void;

  // === KINGDOM EVENTS ===
  // Time
  [SOCKET_EVENTS.TIME_TICK]: (data: TimeTick) => void;
  // World
  [SOCKET_EVENTS.WORLD_UPDATE]: (data: WorldUpdate) => void;
  [SOCKET_EVENTS.WORLD_UPDATE_BATCH]: (data: WorldUpdateBatch) => void;
  // Trade
  [SOCKET_EVENTS.TRADE_OFFER_CREATED]: (data: TradeOfferCreated) => void;
  [SOCKET_EVENTS.TRADE_COMPLETED]: (data: TradeCompleted) => void;
  // Market
  [SOCKET_EVENTS.MARKET_PRICE_BATCH]: (data: PriceUpdateBatch) => void;
  [SOCKET_EVENTS.RESOURCE_SOLD]: (data: ResourceSoldEvent) => void;
  // Production
  [SOCKET_EVENTS.PRODUCTION_TICK]: (data: ProductionTick) => void;
  // Battle
  [SOCKET_EVENTS.BATTLE_STARTED]: (data: BattleEvent) => void;
  [SOCKET_EVENTS.BATTLE_TICK]: (data: BattleTickEvent) => void;
  [SOCKET_EVENTS.BATTLE_RESOLVED]: (data: BattleResolvedEvent) => void;
  [SOCKET_EVENTS.TERRITORY_CAPTURED]: (data: TerritoryCapturedEvent) => void;
  [SOCKET_EVENTS.SIEGE_STARTED]: (data: SiegeEvent) => void;
  // Army March
  [SOCKET_EVENTS.ARMY_MARCH_STARTED]: (data: ArmyMarchEvent) => void;
  [SOCKET_EVENTS.ARMY_MARCH_PROGRESS]: (data: ArmyMarchProgressEvent) => void;
  [SOCKET_EVENTS.ARMY_MARCH_ARRIVED]: (data: ArmyMarchArrivedEvent) => void;
  [SOCKET_EVENTS.ARMY_MARCH_RECALLED]: (data: ArmyMarchRecalledEvent) => void;
  // Honor
  [SOCKET_EVENTS.HONOR_CHANGED]: (data: HonorChangedEvent) => void;
  // Sync
  [SOCKET_EVENTS.SYNC_STATE]: (data: MultiverseSyncState) => void;
}

// ============================================================================
// SOCKET EVENT CONSTANTS
// ============================================================================

export const SOCKET_EVENTS = {
  // Time
  TIME_TICK: 'time.tick',
  // World
  WORLD_UPDATE: 'world.update',
  WORLD_UPDATE_BATCH: 'world.update.batch',
  // Trade
  TRADE_OFFER_CREATED: 'trade.offer.created',
  TRADE_COMPLETED: 'trade.completed',
  // Market
  MARKET_PRICE_BATCH: 'market.price.batch',
  RESOURCE_SOLD: 'market.resource.sold',
  // Production
  PRODUCTION_TICK: 'production.tick',
  // Battle
  BATTLE_STARTED: 'battle.started',
  BATTLE_TICK: 'battle.tick',
  BATTLE_RESOLVED: 'battle.resolved',
  TERRITORY_CAPTURED: 'territory.captured',
  SIEGE_STARTED: 'siege.started',
  // Army March
  ARMY_MARCH_STARTED: 'army.march.started',
  ARMY_MARCH_PROGRESS: 'army.march.progress',
  ARMY_MARCH_ARRIVED: 'army.march.arrived',
  ARMY_MARCH_RECALLED: 'army.march.recalled',
  // Honor
  HONOR_CHANGED: 'honor.changed',
  // Sync
  SYNC_REQUEST: 'sync.request',
  SYNC_STATE: 'sync.state',
} as const;

export type SocketEventName = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];

// ============================================================================
// Time Events
// ============================================================================

export interface TimeTick {
  day: number;          // Game day (starts from 1)
  hour: number;         // 0-23
  minute: number;       // 0-59
  speed: number;        // Time multiplier
  isPaused: boolean;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

// ============================================================================
// World Events
// ============================================================================

export interface WorldUpdate {
  worldId: WorldId;
  gdp?: number;
  population?: number;
  prosperityIndex?: number;
  tradeBalance?: number;
  totalExports?: number;
  totalImports?: number;
  armySize?: number;
  territoryCount?: number;
}

export interface WorldUpdateBatch {
  updates: WorldUpdate[];
}

// ============================================================================
// Trade Events
// ============================================================================

export interface TradeOfferCreated {
  offerId: string;
  sellerId: string;
  sellerName: string;
  sellerWorldId: WorldId;
  resourceId: ResourceId;
  quantity: number;
  pricePerUnit: number;
  currency: string;
}

export interface TradeCompleted {
  tradeId: string;
  offerId?: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  sellerWorldId: WorldId;
  buyerWorldId: WorldId;
  resourceId: ResourceId;
  quantity: number;
  totalPrice: number;
  currency: string;
}

// ============================================================================
// Market Events
// ============================================================================

export interface PriceUpdate {
  resourceId: ResourceId;
  price: number;
  change24h: number;
}

export interface PriceUpdateBatch {
  updates: PriceUpdate[];
}

// ============================================================================
// Production Events
// ============================================================================

export interface ProductionTick {
  agentId: string;
  agentName?: string;
  worldId: WorldId;
  parcelId?: string;
  blockX?: number;
  blockY?: number;
  production: Record<string, number>;  // Resource yields this tick
  totalInventory: Record<string, number>;  // Current total inventory
}

export interface ResourceSoldEvent {
  agentId: string;
  agentName: string;
  worldId: WorldId;
  parcelId?: string;
  blockX?: number;
  blockY?: number;
  resourceId: string;
  quantity: number;
  unitPrice: number;
  totalCredits: number;
}

// ============================================================================
// Exchange Rate Events (legacy compat, simplified)
// ============================================================================

export interface ExchangeRateBatch {
  baseCurrency: string;
  rates: Record<string, number>;
}

// ============================================================================
// Sync Events
// ============================================================================

export interface MultiverseSyncState {
  time: TimeTick;
  worlds: Record<WorldId, {
    id: WorldId;
    name: string;
    tagline: string;
    gdp: number;
    population: number;
    prosperityIndex: number;
    tradeBalance: number;
    armySize: number;
    territoryCount: number;
    currency: { code: string; symbol: string; name: string };
  }>;
  exchangeRates: Record<string, number>;
  recentTrades: TradeCompleted[];
  activeOffers?: TradeOfferCreated[];
  activeBattles?: BattleEvent[];
  recentBattles?: BattleResolvedEvent[];
  activeSieges?: SiegeEvent[];
}

// ============================================================================
// Battle Events (replaces Hacking)
// ============================================================================

export type BattleStatus =
  | 'preparing'    // Armies assembling
  | 'active'       // Battle in progress
  | 'resolved'     // Battle complete
  | 'retreat';     // One side retreated

export interface BattleEvent {
  battleId: string;
  attackerId: string;
  attackerName: string;
  attackerWorldId: WorldId;
  defenderId: string;
  defenderName: string;
  defenderWorldId: WorldId;
  status: BattleStatus;
  attackerArmy: number;
  defenderArmy: number;
}

export interface BattleTickEvent {
  battleId: string;
  round: number;
  attackerRemaining: number;
  defenderRemaining: number;
  status: BattleStatus;
  event: string;
}

export interface BattleResolvedEvent {
  battleId: string;
  attackerId: string;
  attackerName: string;
  attackerWorldId: WorldId;
  defenderId: string;
  defenderName: string;
  defenderWorldId: WorldId;
  victor: 'attacker' | 'defender' | 'draw';
  lootGold: number;
  lootResources: Record<string, number>;
  attackerLosses: number;
  defenderLosses: number;
  resolvedAt: string;
}

export interface TerritoryCapturedEvent {
  parcelId: string;
  capturedBy: WorldId;
  capturedFrom: WorldId;
  battleId: string;
}

export interface SiegeEvent {
  siegeId: string;
  attackerWorldId: WorldId;
  defenderWorldId: WorldId;
  targetParcelId: string;
  progress: number;        // 0-100
  status: 'active' | 'broken' | 'successful';
}

// ============================================================================
// Honor Events (Metin2-style PK System)
// ============================================================================

export interface HonorChangedEvent {
  agentId: string;
  agentName: string;
  factionId: WorldId;
  delta?: number;
  oldHonor: number;
  newHonor: number;
  oldStatus: string;
  newStatus: string;
  reason?: string;
  multipliers?: {
    unitCost: number;
    marchSpeed: number;
    tradeRate: number;
  };
  timestamp: string;
}
