/**
 * Redis Cache Layer
 *
 * High-level cache functions for hot data:
 * - Resource prices (global)
 *
 * Read path: Redis first, fallback to MongoDB
 * Write path: Jobs write to Redis with TTL
 */

import { ResourceModel } from '@agentropolis/db';
import type { ResourceId, PriceUpdate } from '@agentropolis/shared';
import { safeGet, safeSet, safeMGet, REDIS_KEYS, TTL, isRedisConnected } from './index';

// ============================================================================
// Cache Logging
// ============================================================================

const LOG_PREFIX = '[Cache]';

function logHit(key: string): void {
  console.log(`${LOG_PREFIX} HIT ${key}`);
}

function logMiss(key: string): void {
  console.log(`${LOG_PREFIX} MISS ${key}`);
}

// ============================================================================
// Price Cache (Global Prices - Single World V2)
// ============================================================================

export interface CachedPrice {
  resourceId: ResourceId;
  price: number;
  change24h: number;
  updatedAt: string;
}

/**
 * Write global resource prices to Redis cache
 * Called by marketPriceJob after computing prices
 */
export async function cachePrices(updates: PriceUpdate[]): Promise<boolean> {
  if (!isRedisConnected()) return false;

  try {
    const promises = updates.map((update) => {
      const key = REDIS_KEYS.price(update.resourceId);
      const data: CachedPrice = {
        resourceId: update.resourceId,
        price: update.price,
        change24h: update.change24h,
        updatedAt: new Date().toISOString(),
      };
      return safeSet(key, JSON.stringify(data), TTL.PRICE);
    });

    await Promise.all(promises);
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to cache prices:`, (error as Error).message);
    return false;
  }
}

/**
 * Get a single global resource price (Redis first, fallback to base value)
 */
export async function getResourcePrice(resourceId: ResourceId): Promise<CachedPrice | null> {
  const key = REDIS_KEYS.price(resourceId);

  // Try Redis first
  const cached = await safeGet(key);
  if (cached !== null) {
    logHit(key);
    try {
      return JSON.parse(cached) as CachedPrice;
    } catch {
      // Invalid JSON, fall through
    }
  }

  logMiss(key);

  // Fallback: use resource base value
  // This is a simplified fallback - real prices are computed by marketPriceJob
  try {
    const resource = await ResourceModel.findById(resourceId);

    if (resource) {
      const priceData: CachedPrice = {
        resourceId,
        price: resource.baseValue,
        change24h: 0,
        updatedAt: new Date().toISOString(),
      };

      // Cache for next time
      await safeSet(key, JSON.stringify(priceData), TTL.PRICE);
      return priceData;
    }

    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Price fallback failed for ${resourceId}:`, (error as Error).message);
    return null;
  }
}

/**
 * Get all global prices (Redis first, fallback to base values)
 */
export async function getAllPrices(): Promise<CachedPrice[]> {
  // Try to get all resource prices from Redis
  const resources = await ResourceModel.find();
  const keys = resources.map((r) => REDIS_KEYS.price(r.id));

  const cachedValues = await safeMGet(keys);
  const prices: CachedPrice[] = [];
  const missedResources: string[] = [];

  // Process cached values
  cachedValues.forEach((cached, index) => {
    const resourceId = resources[index].id;
    if (cached !== null) {
      logHit(keys[index]);
      try {
        prices.push(JSON.parse(cached) as CachedPrice);
        return;
      } catch {
        // Invalid JSON, add to missed
      }
    }
    logMiss(keys[index]);
    missedResources.push(resourceId);
  });

  // If all cached, return immediately
  if (missedResources.length === 0) {
    return prices;
  }

  // Fetch missed prices from MongoDB (use base values)
  try {
    const missedResourceDocs = resources.filter((r) => missedResources.includes(r.id));

    for (const resource of missedResourceDocs) {
      const priceData: CachedPrice = {
        resourceId: resource.id as ResourceId,
        price: resource.baseValue,
        change24h: 0,
        updatedAt: new Date().toISOString(),
      };

      prices.push(priceData);

      // Cache for next time
      const key = REDIS_KEYS.price(resource.id);
      await safeSet(key, JSON.stringify(priceData), TTL.PRICE);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Global prices fallback failed:`, (error as Error).message);
  }

  return prices;
}

// ============================================================================
// Cache Statistics (for debugging)
// ============================================================================

export interface CacheStats {
  redisConnected: boolean;
  timestamp: string;
}

export function getCacheStats(): CacheStats {
  return {
    redisConnected: isRedisConnected(),
    timestamp: new Date().toISOString(),
  };
}
