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
export const SEASON_TICKS = 100; // Season changes every 100 ticks

// Needs decay per tick
export const NEED_DECAY_HUNGER = 5;
export const NEED_DECAY_REST = 4;
export const NEED_DECAY_FUN = 3;

// NPC revenue budget per tick (controlled mint)
export const NPC_BUDGET_PER_TICK = 200;

// Import fee rate (sink)
export const IMPORT_FEE_RATE = 0.15;

// Unemployment reputation decay
export const UNEMPLOYED_REP_DECAY_TICKS = 5;
export const UNEMPLOYED_REP_DECAY_AMOUNT = 1;

// SimTime mapping
export const SIM_MINUTES_PER_TICK = 60; // 1 tick = 1 sim hour

// City treasury starting balance
export const CITY_TREASURY_STARTING_BALANCE = 10_000;

// Default city identifier (single-world V2)
export const CITY_ID = 'city-001';
