/**
 * Socket payload interfaces — all data shapes sent over the wire.
 */

import type { PlacementSource, CityMode, NewsSeverity, AgentActionType } from './enums';
import type { Profession, CareerPath, AgentNeeds, AgentStats } from '../../types/agent';

// ============ PLACEMENT (core data unit) ============

/** A single building/prop placement in world space */
export interface Placement {
  worldX: number;
  worldZ: number;
  type: string;         // building type / category
  assetKey: string;     // rendering asset key
  rotY?: number;        // rotation in degrees: 0, 90, 180, 270
  level?: number;       // building level (1 = default)
  source: PlacementSource;
  buildingId?: string;  // DB id for real-source buildings
  ownerId?: string;     // owner agent/player id
}

// ============ SERVER -> CLIENT PAYLOADS ============

/** Sent on connect: minimal city state for client bootstrap */
export interface CitySyncPayload {
  cityId: string;
  seed: number;
  tickNo: number;
  mode: CityMode;
  activeRadiusChunks: number;
  serverTime: string;   // ISO 8601
}

/** Sent in response to viewport:subscribe for each subscribed chunk */
export interface ChunkPayloadData {
  chunkX: number;
  chunkZ: number;
  placements: Placement[];
  meta?: {
    seed?: number;
    generatedAt?: string;
  };
}

/** Periodic tick completion with optional economy snapshot */
export interface TickCompletePayload {
  tick: number;
  serverTime: string;
  economy?: {
    treasury: number;
    moneySupply: number;
    unemployment: number;
    crimeRate: number;
    season: string;
    totalAgents: number;
    avgNeeds: { hunger: number; rest: number; fun: number };
  };
  eventsCount?: number;
}

/** Stub news broadcast */
export interface NewsPublishedPayload {
  items: NewsItem[];
}

export interface NewsItem {
  id: string;
  headline: string;
  body: string;
  severity: NewsSeverity;
  tick: number;
  tags: string[];
}

// ============ CLIENT -> SERVER PAYLOADS ============

/** Subscribe to chunk AOI — server responds with chunk:payload per chunk */
export interface ViewportSubscribePayload {
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}

/** Unsubscribe from chunks */
export interface ViewportUnsubscribePayload {
  chunks: Array<{ chunkX: number; chunkZ: number }>;
}

/** Place a building (client -> server, with ack response) */
export interface WorldPlaceBuildingPayload {
  cityId: string;
  worldX: number;
  worldZ: number;
  type: string;
  assetKey: string;
  rotY?: number;
  tileW?: number;
  tileD?: number;
  level?: number;
  ownerId?: string;
}

/** Response to world:placeBuilding */
export interface WorldPlaceBuildingResponse {
  ok: boolean;
  buildingId?: string;
  reason?: string;
  collidedWith?: string[];
}

/** Remove a building (client -> server, with ack response) */
export interface WorldRemoveBuildingPayload {
  cityId: string;
  buildingId: string;
  ownerId?: string;
}

/** Response to world:removeBuilding */
export interface WorldRemoveBuildingResponse {
  ok: boolean;
  reason?: string;
}

// ============ PARCEL BUY ============

/** Buy a parcel (client -> server, with ack response) */
export interface ParcelBuyPayload {
  cityId: string;
  worldX: number;
  worldZ: number;
  ownerId: string;
}

/** Response to parcel:buy */
export interface ParcelBuyResponse {
  ok: boolean;
  reason?: string;
}

// ============ AGENT ACTION PAYLOADS ============

/** Client -> Server: Register a new agent */
export interface AgentRegisterPayload {
  name: string;
  aiModel: string;
  career?: CareerPath;
}

/** Response to agent:register */
export interface AgentRegisterResponse {
  ok: boolean;
  agentId?: string;
  apiKey?: string;
  reason?: string;
}

/** Client -> Server: Agent performs an action */
export interface AgentActionPayload {
  agentId: string;
  type: AgentActionType;
  /** Client-generated request ID, echoed back in action:result */
  requestId?: string;
  /** For 'apply': target building ID to apply for employment */
  targetBuildingId?: string;
  /** For 'crime': target agent ID to steal from */
  targetAgentId?: string;
  /** For 'buy_parcel' / 'build': target world coordinates */
  worldX?: number;
  worldZ?: number;
  /** For 'build': building type from catalog */
  buildingType?: string;
  /** For 'build': specific GLB asset key */
  assetKey?: string;
  /** For 'build': rotation in degrees (0, 90, 180, 270) */
  rotY?: number;
}

/** Response to agent:action (immediate ack) */
export interface AgentActionResponse {
  ok: boolean;
  reason?: string;
  /** Updated agent snapshot after action */
  agent?: AgentSnapshotPayload;
  /** Side effects description */
  outcome?: string;
  /** True when action was accepted into the queue for next tick processing */
  queued?: boolean;
}

/** Server -> Client: result of a queued agent action (delivered after tick processes it) */
export interface ActionResultPayload {
  requestId: string;
  agentId: string;
  actionType: AgentActionType;
  tick: number;
  ok: boolean;
  reason?: string;
  outcome?: string;
  agent?: AgentSnapshotPayload;
  /** Optional diff / extra data from the action (e.g. buildingId for build) */
  diff?: Record<string, unknown>;
}

// ============ SERVER -> CLIENT: AGENT EVENT PAYLOADS ============

/** Compact agent snapshot broadcast to spectators */
export interface AgentSnapshotPayload {
  id: string;
  name: string;
  profession: Profession;
  status: string;
  reputation: number;
  needs: AgentNeeds;
  stats: AgentStats;
  balance: number;
  employedAt?: string;
  homeId?: string;
}

/** Broadcast when a new agent joins the city */
export interface AgentJoinedPayload {
  agent: AgentSnapshotPayload;
  tick: number;
}

/** Broadcast when an agent's state changes (action result) */
export interface AgentUpdatedPayload {
  agent: AgentSnapshotPayload;
  action: AgentActionType | 'tick_decay' | 'salary' | 'release';
  outcome: string;
  tick: number;
}

/** Broadcast when an agent gets promoted */
export interface AgentPromotedPayload {
  agentId: string;
  agentName: string;
  oldProfession: Profession;
  newProfession: Profession;
  tick: number;
}

/** Broadcast when a crime occurs */
export interface CrimeCommittedPayload {
  perpetratorId: string;
  perpetratorName: string;
  victimId: string;
  victimName: string;
  amount: number;
  caught: boolean;
  tick: number;
}

/** Broadcast when an agent is arrested */
export interface CrimeArrestedPayload {
  agentId: string;
  agentName: string;
  fineAmount: number;
  jailTicks: number;
  tick: number;
}

// ============ HUD METRICS V1 (S4.1) ============

/** Compact 5-metric HUD for spectators — derived from CityMetricsPayload */
export interface HudMetricsV1 {
  tick: number;
  treasury: number;
  unemploymentRate: number;
  avgNeeds: { hunger: number; rest: number; fun: number };
  crimeRateLast10: number;
  activeBuildingsPct: number; // openBusinesses / (openBusinesses + closedBusinesses)
  treasuryBand: 'crisis' | 'normal' | 'boom';
  season: string;
}

/** Extract HudMetricsV1 from a full CityMetricsPayload */
export function toHudMetrics(m: CityMetricsPayload): HudMetricsV1 {
  const total = m.openBusinesses + m.closedBusinesses;
  return {
    tick: m.tick,
    treasury: m.treasury,
    unemploymentRate: m.unemploymentRate,
    avgNeeds: m.avgNeeds,
    crimeRateLast10: m.crimeRateLast10,
    activeBuildingsPct: total > 0 ? Math.round((m.openBusinesses / total) * 100) : 100,
    treasuryBand: m.treasuryBand,
    season: m.season,
  };
}

// ============ SEASON GOALS (S5.1) ============

/** A single season goal with progress tracking */
export interface SeasonGoal {
  id: string;
  label: string;              // e.g. "Reduce unemployment below 20%"
  metric: 'unemploymentRate' | 'openBusinesses' | 'crimeRateLast10' | 'treasury';
  direction: 'below' | 'above' | 'increase' | 'decrease';
  target: number;             // target value
  startValue: number;         // value at season start
  currentValue: number;       // latest value
  progress: number;           // 0.0 → 1.0
  completed: boolean;
}

/** Season goals state broadcast to spectators */
export interface SeasonGoalsPayload {
  season: string;
  seasonTick: number;         // tick when season started
  goals: SeasonGoal[];
}

/** Season outcome event data */
export interface SeasonOutcomeData {
  season: string;
  goals: Array<SeasonGoal & { outcome: 'success' | 'failure' }>;
  successCount: number;
  totalCount: number;
}

// ============ ARC STORY CARDS (S5.2, S5.3) ============

/** A completed story arc rendered as a single feed card */
export interface ArcCard {
  arcId: string;
  arcType: 'crime' | 'career';
  agentId: string;
  agentName: string;
  headline: string;
  steps: string[];            // ordered event descriptions
  outcome: string;            // final result summary
  startTick: number;
  endTick: number;
  severity: NewsSeverity;
}

/** Character card — agent profile snapshot for story context */
export interface CharacterCard {
  agentId: string;
  agentName: string;
  profession: string;
  reputation: number;
  balance: number;
  weekBehavior: {
    workCount: number;
    eatCount: number;
    sleepCount: number;
    relaxCount: number;
    crimeCount: number;
  };
  careerHighlight?: string;   // e.g. "Promoted to employee"
}

// ============ HIGHLIGHT REEL (S5.4) ============

/** A single highlight moment */
export interface HighlightMoment {
  id: string;
  category: 'money' | 'crime' | 'building' | 'band_change' | 'agent';
  headline: string;
  detail?: string;
  tick: number;
  severity: NewsSeverity;
}

/** Weekly or season highlight reel */
export interface HighlightReelPayload {
  period: 'weekly' | 'season';
  weekNumber?: number;
  season?: string;
  moments: HighlightMoment[];
}

// ============ POLICY VOTE (S5.5) ============

/** Policy option for spectator voting */
export type PolicyCategory = 'tax_rate' | 'police_budget' | 'park_investment';

export interface PolicyOption {
  id: string;
  category: PolicyCategory;
  label: string;              // e.g. "Increase tax rate"
  description: string;
  modifier: number;           // e.g. +0.05 = +5%
}

/** Active policy vote state */
export interface PolicyVotePayload {
  weekNumber: number;
  options: PolicyOption[];
  voteCounts: Record<string, number>;  // optionId → count
  totalVotes: number;
  deadline: string;           // ISO timestamp
  resolved: boolean;
  winner?: PolicyOption;
}

/** Current active policy modifiers */
export interface ActivePolicyModifiers {
  taxRateModifier: number;    // ±0.05 max
  policeBudgetModifier: number;
  parkInvestmentModifier: number;
}

// ============ SEASON REPORT (S5.7) ============

/** End-of-season report data */
export interface SeasonReportPayload {
  season: string;
  tickRange: { start: number; end: number };
  metricsStart: {
    treasury: number;
    unemploymentRate: number;
    crimeRateLast10: number;
    openBusinesses: number;
    agentCount: number;
  };
  metricsEnd: {
    treasury: number;
    unemploymentRate: number;
    crimeRateLast10: number;
    openBusinesses: number;
    agentCount: number;
  };
  goals: SeasonOutcomeData;
  topStories: Array<{ headline: string; type: string; severity: string; tick: number }>;
  highlightReel: HighlightMoment[];
  policyHistory: Array<{ weekNumber: number; winner: PolicyOption; effect: string }>;
}

// ============ SPECTATOR FEED ============

/** Feed channel: story (spectator-facing) or telemetry (developer/debug) */
export type FeedChannel = 'story' | 'telemetry';

/** Feed event type for CityPulse unified feed */
export type FeedEventType =
  | 'news'
  | 'agent_joined'
  | 'agent_updated'
  | 'crime'
  | 'arrest'
  | 'promotion'
  | 'tick'
  | 'daily_snapshot'
  | 'weekly_summary'
  | 'crime_arc'
  | 'career_arc'
  | 'season_goals'
  | 'season_outcome'
  | 'highlight_reel'
  | 'policy_vote'
  | 'policy_result';

/** Unified feed event (all event types normalized for CityPulse) */
export interface FeedEvent {
  id: string;
  type: FeedEventType;
  headline: string;
  detail?: string;
  severity: NewsSeverity;
  tick: number;
  ts: string;              // ISO timestamp
  tags: string[];          // filter tags: 'economy','crime','agents','buildings'
  /** Feed channel — 'story' for spectator-facing, 'telemetry' for debug. Defaults to 'telemetry' if absent. */
  channel?: FeedChannel;
  /** News category for template rendering (S4.3) */
  category?: string;
}

/** Sent on connect: full spectator bootstrap */
export interface SpectatorSyncPayload {
  city: CitySyncPayload;
  recentEvents: FeedEvent[];
  agents: AgentSnapshotPayload[];
  economy?: TickCompletePayload['economy'];
  metrics?: CityMetricsPayload;
}

// ============ TICK BATCH BROADCASTS ============

/** Top N agents broadcast after each tick (for HUD agent leaderboard) */
export interface AgentsUpdatePayload {
  tick: number;
  agents: AgentSnapshotPayload[];
}

/** Batch of events produced during a tick */
export interface EventsBatchPayload {
  tick: number;
  events: FeedEvent[];
}

// ============ CITY METRICS ============

/** Full city metrics broadcast after each tick */
export interface CityMetricsPayload {
  tick: number;
  serverTime: string;
  agentCount: number;
  activeCount: number;
  jailedCount: number;
  treasury: number;
  moneySupply: number;
  unemploymentRate: number;
  crimeRateLast10: number;
  avgRep: number;
  avgNeeds: { hunger: number; rest: number; fun: number };
  season: string;
  tickDurationMs: number;
  eventsCount: number;
  // Economy v1 detail
  npcBudget: number;
  npcDistributed: number;
  taxCollected: number;
  importFees: number;
  openBusinesses: number;
  closedBusinesses: number;
  outsideWorldCRD: number;
  policeCountActive: number;
  // Economy v2: closed-loop metrics
  demandBudgetBalance: number;
  treasuryBand: 'crisis' | 'normal' | 'boom';
  flow: {
    mintedThisTick: number;
    sunkThisTick: number;
    wagesPaid: number;
    taxCollected: number;
    npcSpendingPaid: number;
    importFees: number;
    livingExpensesCollected: number;
    operatingCostsSunk: number;
    demandBudgetAllocated: number;
  };
}

// ============ PACING: DAILY + WEEKLY SUMMARIES (S3.6) ============

/** Daily snapshot — compact metrics for quick glance (published every tick) */
export interface DailySnapshotData {
  tick: number;
  treasury: number;
  unemploymentRate: number;
  avgNeeds: { hunger: number; rest: number; fun: number };
  crimeRateLast10: number;
  openBusinesses: number;
}

/** Weekly summary — deltas + top events for trend visibility (published every WEEK_TICKS) */
export interface WeeklySummaryData {
  weekNumber: number;
  tickRange: { start: number; end: number };
  deltas: {
    treasury: number;
    moneySupply: number;
    unemploymentRate: number;
    crimeRateLast10: number;
    openBusinesses: number;
    agentCount: number;
  };
  topEvents: Array<{
    headline: string;
    type: string;
    severity: string;
  }>;
  season: string;
  treasuryBand: 'crisis' | 'normal' | 'boom';
}
