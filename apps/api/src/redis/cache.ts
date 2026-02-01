/**
 * Redis Cache Layer
 *
 * High-level cache functions for hot data:
 * - Exchange rates
 * - Resource prices
 *
 * Read path: Redis first, fallback to MongoDB
 * Write path: Jobs write to Redis with TTL
 */

import { WorldModel, ResourceModel } from '@agentropolis/db';
import type { WorldId, ResourceId, ExchangeRateBatch, PriceUpdate } from '@agentropolis/shared';
import { WORLD_IDS } from '@agentropolis/shared';
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
// Exchange Rate Cache
// ============================================================================

export interface CachedExchangeRates {
  baseCurrency: string;
  rates: Record<string, number>;
  updatedAt: string;
}

/**
 * Write exchange rates to Redis cache
 * Called by exchangeRateJob after computing rates
 */
export async function cacheExchangeRates(batch: ExchangeRateBatch): Promise<boolean> {
  if (!isRedisConnected()) return false;

  try {
    // Cache the full matrix
    const matrixData: CachedExchangeRates = {
      baseCurrency: batch.baseCurrency,
      rates: batch.rates,
      updatedAt: new Date().toISOString(),
    };
    await safeSet(REDIS_KEYS.fxMatrix(), JSON.stringify(matrixData), TTL.FX_RATE);

    // Cache individual rates for quick lookups
    const promises = Object.entries(batch.rates).map(([currency, rate]) =>
      safeSet(REDIS_KEYS.fxRate(currency), rate.toString(), TTL.FX_RATE)
    );
    await Promise.all(promises);

    return true;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to cache exchange rates:`, (error as Error).message);
    return false;
  }
}

/**
 * Get a single exchange rate (Redis first, fallback to MongoDB)
 */
export async function getExchangeRate(currencyCode: string): Promise<number | null> {
  const key = REDIS_KEYS.fxRate(currencyCode);

  // Try Redis first
  const cached = await safeGet(key);
  if (cached !== null) {
    logHit(key);
    return parseFloat(cached);
  }

  logMiss(key);

  // Fallback to MongoDB
  try {
    const world = await WorldModel.findOne({ 'currency.code': currencyCode });
    if (world) {
      // Cache for next time
      await safeSet(key, world.currentExchangeRate.toString(), TTL.FX_RATE);
      return world.currentExchangeRate;
    }
    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} MongoDB fallback failed for ${currencyCode}:`, (error as Error).message);
    return null;
  }
}

/**
 * Get all exchange rates (Redis first, fallback to MongoDB)
 */
export async function getExchangeRates(): Promise<Record<string, number>> {
  const key = REDIS_KEYS.fxMatrix();

  // Try Redis first
  const cached = await safeGet(key);
  if (cached !== null) {
    logHit(key);
    try {
      const data: CachedExchangeRates = JSON.parse(cached);
      return data.rates;
    } catch {
      // Invalid JSON, fall through to MongoDB
    }
  }

  logMiss(key);

  // Fallback to MongoDB
  try {
    const worlds = await WorldModel.find();
    const rates: Record<string, number> = {};

    for (const world of worlds) {
      rates[world.currency.code] = world.currentExchangeRate;
    }

    // Cache for next time
    const matrixData: CachedExchangeRates = {
      baseCurrency: 'OPN',
      rates,
      updatedAt: new Date().toISOString(),
    };
    await safeSet(key, JSON.stringify(matrixData), TTL.FX_RATE);

    return rates;
  } catch (error) {
    console.error(`${LOG_PREFIX} MongoDB fallback failed for rates:`, (error as Error).message);
    return {};
  }
}

// ============================================================================
// Price Cache
// ============================================================================

export interface CachedPrice {
  resourceId: ResourceId;
  worldId: WorldId;
  price: number;
  change24h: number;
  updatedAt: string;
}

/**
 * Write resource prices to Redis cache
 * Called by marketPriceJob after computing prices
 */
export async function cachePrices(updates: PriceUpdate[]): Promise<boolean> {
  if (!isRedisConnected()) return false;

  try {
    const promises = updates.map((update) => {
      const key = REDIS_KEYS.price(update.resourceId, update.worldId);
      const data: CachedPrice = {
        resourceId: update.resourceId,
        worldId: update.worldId,
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
 * Get a single resource price (Redis first, fallback to calculated value)
 */
export async function getResourcePrice(
  resourceId: ResourceId,
  worldId: WorldId
): Promise<CachedPrice | null> {
  const key = REDIS_KEYS.price(resourceId, worldId);

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

  // Fallback: calculate from resource base value and world prosperity
  // This is a simplified fallback - real prices are computed by marketPriceJob
  try {
    const resource = await ResourceModel.findById(resourceId);
    const world = await WorldModel.findById(worldId);

    if (resource && world) {
      const affinityMap = resource.worldAffinity instanceof Map
        ? Object.fromEntries(resource.worldAffinity)
        : (resource.worldAffinity || {});

      const affinity = (affinityMap as Record<string, number>)[worldId] || 1.0;
      const affinityFactor = affinity > 0 ? 1 / Math.sqrt(affinity) : 1.5;
      const prosperityFactor = 0.8 + (world.prosperityIndex / 100) * 0.4;
      const price = Math.round(resource.baseValue * affinityFactor * prosperityFactor * 100) / 100;

      const priceData: CachedPrice = {
        resourceId,
        worldId,
        price,
        change24h: 0,
        updatedAt: new Date().toISOString(),
      };

      // Cache for next time
      await safeSet(key, JSON.stringify(priceData), TTL.PRICE);
      return priceData;
    }

    return null;
  } catch (error) {
    console.error(`${LOG_PREFIX} Price fallback failed for ${resourceId}:${worldId}:`, (error as Error).message);
    return null;
  }
}

/**
 * Get all prices for a specific world (Redis first, fallback to calculated)
 */
export async function getWorldPrices(worldId: WorldId): Promise<CachedPrice[]> {
  // Try to get all resource prices from Redis
  const resources = await ResourceModel.find();
  const keys = resources.map((r) => REDIS_KEYS.price(r.id, worldId));

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

  // Fetch missed prices from MongoDB/calculate
  try {
    const world = await WorldModel.findById(worldId);
    if (!world) return prices;

    const missedResourceDocs = resources.filter((r) => missedResources.includes(r.id));

    for (const resource of missedResourceDocs) {
      const affinityMap = resource.worldAffinity instanceof Map
        ? Object.fromEntries(resource.worldAffinity)
        : (resource.worldAffinity || {});

      const affinity = (affinityMap as Record<string, number>)[worldId] || 1.0;
      const affinityFactor = affinity > 0 ? 1 / Math.sqrt(affinity) : 1.5;
      const prosperityFactor = 0.8 + (world.prosperityIndex / 100) * 0.4;
      const price = Math.round(resource.baseValue * affinityFactor * prosperityFactor * 100) / 100;

      const priceData: CachedPrice = {
        resourceId: resource.id as ResourceId,
        worldId,
        price,
        change24h: 0,
        updatedAt: new Date().toISOString(),
      };

      prices.push(priceData);

      // Cache for next time
      const key = REDIS_KEYS.price(resource.id, worldId);
      await safeSet(key, JSON.stringify(priceData), TTL.PRICE);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} World prices fallback failed for ${worldId}:`, (error as Error).message);
  }

  return prices;
}

/**
 * Get all prices across all worlds (for sync state)
 */
export async function getAllPrices(): Promise<CachedPrice[]> {
  const allPrices: CachedPrice[] = [];

  for (const worldId of WORLD_IDS) {
    const worldPrices = await getWorldPrices(worldId);
    allPrices.push(...worldPrices);
  }

  return allPrices;
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
