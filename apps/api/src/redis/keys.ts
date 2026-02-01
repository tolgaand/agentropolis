/**
 * Redis Key Schema
 *
 * Centralized key definitions for Redis cache.
 * All keys should use these helpers to ensure consistency.
 */

// Key prefixes
export const KEY_PREFIX = {
  PRICE: 'price:',
  FX: 'fx:',
  WORLD: 'world:',
  LOCK: 'lock:',
  CACHE: 'cache:',
} as const;

// TTL values in seconds
export const TTL = {
  EXCHANGE_RATE: 5,      // 1-5s for high frequency updates
  RESOURCE_PRICE: 10,    // 3-10s, jobs run every 3-5s
  WORLD_STATS: 30,       // 10-30s for less volatile data
  LEADERBOARD: 120,      // 30-120s for expensive aggregations
  LISTING_CACHE: 15,     // 5-15s for market listings
  TRADE_LOCK: 2,         // Short lock for trade operations
  AGENT_LOCK: 5,         // Lock for agent operations
} as const;

// Key generators for prices
export const priceKey = {
  /** price:{resourceId}:{worldId} */
  resource: (resourceId: string, worldId: string): string =>
    `${KEY_PREFIX.PRICE}${resourceId}:${worldId}`,

  /** price:index - tracks last version and update time */
  index: (): string => `${KEY_PREFIX.PRICE}index`,

  /** price:v{version} - versioned bulk key */
  versioned: (version: number): string => `${KEY_PREFIX.PRICE}v${version}`,
};

// Key generators for exchange rates
export const fxKey = {
  /** fx:{currencyCode} */
  currency: (currencyCode: string): string =>
    `${KEY_PREFIX.FX}${currencyCode}`,

  /** fx:matrix - full exchange rate matrix */
  matrix: (): string => `${KEY_PREFIX.FX}matrix`,
};

// Key generators for world data
export const worldKey = {
  /** world:{worldId}:stats */
  stats: (worldId: string): string =>
    `${KEY_PREFIX.WORLD}${worldId}:stats`,

  /** world:leaderboard */
  leaderboard: (): string => `${KEY_PREFIX.WORLD}leaderboard`,

  /** world:{worldId}:resources */
  resources: (worldId: string): string =>
    `${KEY_PREFIX.WORLD}${worldId}:resources`,
};

// Key generators for locks
export const lockKey = {
  /** lock:trade:{listingId} */
  trade: (listingId: string): string =>
    `${KEY_PREFIX.LOCK}trade:${listingId}`,

  /** lock:agent:{agentId} */
  agent: (agentId: string): string =>
    `${KEY_PREFIX.LOCK}agent:${agentId}`,

  /** lock:world:{worldId} */
  world: (worldId: string): string =>
    `${KEY_PREFIX.LOCK}world:${worldId}`,
};

// Pub/Sub channel names
export const CHANNELS = {
  PRICES_UPDATE: 'channel:prices:update',
  FX_UPDATE: 'channel:fx:update',
  TRADE_EXECUTED: 'channel:trade:executed',
  CACHE_INVALIDATE: 'channel:cache:invalidate',
} as const;
