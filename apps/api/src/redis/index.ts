/**
 * Redis Client Infrastructure
 *
 * Provides a singleton Redis client for caching hot data:
 * - Exchange rates (fx:*)
 * - Resource prices (price:*)
 * - World stats (world:*)
 *
 * Fallback behavior: If Redis is unavailable, operations silently fail
 * and the system falls back to MongoDB.
 */

import Redis from 'ioredis';
import { env } from '../config/env';

// Redis client singleton
let redis: Redis | null = null;
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

/**
 * Get Redis connection URL from environment config
 */
function getRedisUrl(): string {
  return env.redisUrl;
}

/**
 * Initialize Redis connection
 * Returns the client if successful, null otherwise
 */
export async function initRedis(): Promise<Redis | null> {
  if (redis && isConnected) {
    return redis;
  }

  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
    console.log('[Redis] Max connection attempts reached, running without cache');
    return null;
  }

  connectionAttempts++;

  try {
    const url = getRedisUrl();
    console.log(`[Redis] Connecting to ${url.replace(/\/\/.*@/, '//***@')}...`);

    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true,
      connectTimeout: 5000,
    });

    // Set up event handlers
    redis.on('connect', () => {
      isConnected = true;
      console.log('[Redis] Connected successfully');
    });

    redis.on('error', (err) => {
      if (isConnected) {
        console.error('[Redis] Connection error:', err.message);
      }
      isConnected = false;
    });

    redis.on('close', () => {
      isConnected = false;
      console.log('[Redis] Connection closed');
    });

    // Attempt connection
    await redis.connect();
    isConnected = true;
    return redis;
  } catch (error) {
    console.log('[Redis] Connection failed, running without cache:', (error as Error).message);
    isConnected = false;
    redis = null;
    return null;
  }
}

/**
 * Get the Redis client (may be null if not connected)
 */
export function getRedis(): Redis | null {
  return isConnected ? redis : null;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    isConnected = false;
    console.log('[Redis] Connection closed gracefully');
  }
}

// ============================================================================
// Key Helpers
// ============================================================================

/**
 * Redis key prefixes following the schema in REDIS_ARCHITECTURE.md
 */
export const REDIS_KEYS = {
  // Exchange rates
  fxRate: (currencyCode: string) => `fx:${currencyCode}`,
  fxMatrix: () => 'fx:matrix',

  // Prices
  price: (resourceId: string, worldId: string) => `price:${resourceId}:${worldId}`,
  priceIndex: () => 'price:index',

  // World stats
  worldStats: (worldId: string) => `world:${worldId}:stats`,
  worldLeaderboard: () => 'world:leaderboard',

  // Locks
  tradeLock: (listingId: string) => `lock:trade:${listingId}`,
  agentLock: (agentId: string) => `lock:agent:${agentId}`,
} as const;

// ============================================================================
// TTL Constants (in seconds)
// ============================================================================

export const TTL = {
  FX_RATE: 5,         // Exchange rates: 5 seconds
  PRICE: 10,          // Resource prices: 10 seconds
  WORLD_STATS: 30,    // World stats: 30 seconds
  LEADERBOARD: 120,   // Leaderboards: 2 minutes
} as const;

// ============================================================================
// Safe Redis Operations (with fallback)
// ============================================================================

/**
 * Safe GET - returns null if Redis unavailable or key doesn't exist
 */
export async function safeGet(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    return await client.get(key);
  } catch (error) {
    console.error(`[Redis] GET ${key} failed:`, (error as Error).message);
    return null;
  }
}

/**
 * Safe SET with TTL - silently fails if Redis unavailable
 */
export async function safeSet(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.setex(key, ttlSeconds, value);
    return true;
  } catch (error) {
    console.error(`[Redis] SET ${key} failed:`, (error as Error).message);
    return false;
  }
}

/**
 * Safe MGET - returns array with nulls for missing/failed keys
 */
export async function safeMGet(keys: string[]): Promise<(string | null)[]> {
  const client = getRedis();
  if (!client) return keys.map(() => null);

  try {
    return await client.mget(keys);
  } catch (error) {
    console.error(`[Redis] MGET failed:`, (error as Error).message);
    return keys.map(() => null);
  }
}

/**
 * Safe DEL - silently fails if Redis unavailable
 */
export async function safeDel(key: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error(`[Redis] DEL ${key} failed:`, (error as Error).message);
    return false;
  }
}

// ============================================================================
// JSON Cache Helpers (typed wrappers)
// ============================================================================

/**
 * Get a cached JSON value, parsed to type T
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const raw = await safeGet(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    console.error(`[Redis] Failed to parse cached value for key "${key}"`);
    return null;
  }
}

/**
 * Set a JSON value in cache with TTL
 */
export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
  try {
    const serialized = JSON.stringify(value);
    return await safeSet(key, serialized, ttlSeconds);
  } catch {
    console.error(`[Redis] Failed to serialize value for key "${key}"`);
    return false;
  }
}

/**
 * Delete a cached value
 */
export async function deleteCache(key: string): Promise<boolean> {
  return safeDel(key);
}

// ============================================================================
// Health Check
// ============================================================================

export interface RedisHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  connected: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Check Redis health and measure latency
 */
export async function healthCheck(): Promise<RedisHealthStatus> {
  const client = getRedis();

  if (!client || !isConnected) {
    return {
      status: 'unhealthy',
      connected: false,
      error: 'Not connected to Redis',
    };
  }

  try {
    const start = Date.now();
    await client.ping();
    const latencyMs = Date.now() - start;

    // Degraded if latency > 100ms
    const status = latencyMs > 100 ? 'degraded' : 'healthy';

    return {
      status,
      connected: true,
      latencyMs,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: (error as Error).message,
    };
  }
}

// Re-export key helpers from keys.ts
export * from './keys';

// Export default for convenience
export default {
  init: initRedis,
  get: getRedis,
  isConnected: isRedisConnected,
  close: closeRedis,
  keys: REDIS_KEYS,
  ttl: TTL,
  getCache,
  setCache,
  deleteCache,
  healthCheck,
};
