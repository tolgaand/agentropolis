/** Economy constants */
export const WORKER_SALARY = 20;
export const EMPLOYEE_SALARY = 35;

export const TAX_RATE_DEFAULT = 0.1;

export const STARTING_MONEY = 100;
export const TILE_PRICE = 200;

export const THEFT_REWARD = 50;
export const THEFT_FINE_RATE = 0.2;
export const JAIL_TICKS = 2;
export const BASE_CATCH_CHANCE = 0.3;
export const CATCH_CHANCE_PER_POLICE = 0.1;

export const TICK_INTERVAL_MS = 20_000; // 20 seconds
export const DECISION_WINDOW_MS = 7_000; // 7 second decision window per tick
export const WEEK_TICKS = 7; // 1 week = 7 ticks (used for weekly settlement)
export const SEASON_TICKS = 100; // Season changes every 100 ticks
export const SEASON_RAMP_TICKS = 10; // Season transition ramps over 10 ticks

// Needs decay per tick
export const NEED_DECAY_HUNGER = 5;
export const NEED_DECAY_REST = 4;
export const NEED_DECAY_FUN = 3;

// NPC revenue budget per tick (legacy — replaced by demand budget in S2)
export const NPC_BUDGET_PER_TICK = 200;

// Import fee rate (sink on NPC spending)
export const IMPORT_FEE_RATE = 0.15;

// Demand Budget — allocated from treasury each season
// Base allocation: fraction of treasury balance, scaled by band
export const DEMAND_BUDGET_BASE_RATE = 0.25; // 25% of treasury at season start
export const DEMAND_BUDGET_MIN = 500; // minimum allocation per season
export const DEMAND_BUDGET_MAX = 5_000; // maximum allocation per season

// Living expenses — periodic sink for agents (every N ticks)
export const LIVING_EXPENSE_INTERVAL = 7; // every 7 ticks
export const LIVING_EXPENSE_AMOUNT = 10; // CRD per period
export const LIVING_EXPENSE_REP_PENALTY = 2; // rep lost if can't pay

// Treasury health bands
export const TREASURY_BAND_LOW = 500; // below this = crisis
export const TREASURY_BAND_HIGH = 8_000; // above this = boom
// Band multipliers for demand budget allocation
export const DEMAND_BAND_CRISIS_MULT = 0.5;
export const DEMAND_BAND_NORMAL_MULT = 1.0;
export const DEMAND_BAND_BOOM_MULT = 1.5;

// Unemployment reputation decay (evaluated weekly)
export const UNEMPLOYED_REP_DECAY_TICKS = 5; // inactive threshold within a week
export const UNEMPLOYED_REP_DECAY_AMOUNT = 1;

// Treasury band hysteresis (S3.4)
export const TREASURY_MA_WINDOW = 20; // moving average window (ticks)
export const TREASURY_HYSTERESIS_LOW_EXIT = 650; // must exceed this to leave crisis
export const TREASURY_HYSTERESIS_HIGH_EXIT = 7_500; // must drop below this to leave boom

// Event rate-limiting (S3.5)
export const STORY_EVENT_MAX_PER_TICK = 3; // max story events broadcast per tick
export const STORY_EVENT_CATEGORY_COOLDOWN = 10; // same category cooldown (ticks)
export const PRIORITY_EVENT_TYPES: string[] = [
  'agent_released', 'building_closed', 'economic_crisis',
  'crime_arc', 'career_arc', 'season_outcome', 'highlight_reel', 'policy_result',
]; // these bypass category cooldown (but still count toward per-tick cap)

// Fallback decision variance (S3.7)
export const FALLBACK_IDLE_CHANCE_NORMAL = 0.15; // 15% chance to relax/idle in normal state
export const FALLBACK_IDLE_CHANCE_CRISIS = 0.05; // 5% when unemployed + crisis band
export const FALLBACK_WEEKLY_GOAL_CHECK = true; // parcel/build goals checked weekly only

// SimTime mapping
export const SIM_MINUTES_PER_TICK = 60; // 1 tick = 1 sim hour

// City treasury starting balance
export const CITY_TREASURY_STARTING_BALANCE = 10_000;

// Default city identifier (single-world V2)
export const CITY_ID = 'city-001';
