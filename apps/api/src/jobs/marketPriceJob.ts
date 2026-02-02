/**
 * Market Price Job
 *
 * Computes global resource price changes based on supply/demand simulation
 * using scientifically-grounded economic formulas.
 *
 * V2: Single world with Crown (CRN) currency
 * - Global prices (not per-world)
 * - Supply/demand based on total production and consumption
 * - Random volatility
 *
 * Redis Keys:
 * - price:{resourceId} = { price, change24h, updatedAt } (TTL: 10s)
 */

import { ResourceModel } from '@agentropolis/db';
import type { ResourceId, PriceUpdate, PriceUpdateBatch } from '@agentropolis/shared';
import { broadcastMarketPrices } from '../socket';
import { cachePrices } from '../redis/cache';
import { safeGet } from '../redis';

const JOB_NAME = '[MarketPriceJob]';

// Store previous prices for calculations
const previousPrices: Map<ResourceId, number> = new Map();

// Demand constant calibrates price sensitivity to supply
// Higher value = less price movement per unit of supply
const DEMAND_CONSTANT = 100;

// Price floor/ceiling as multipliers of base price
const PRICE_FLOOR_MULTIPLIER = 0.1;  // 10% of base
const PRICE_CEILING_MULTIPLIER = 3.0; // 300% of base

// Random noise range for market feel
const RANDOM_NOISE_RANGE = 0.03; // ±3%


/**
 * Get actual production supply from Redis
 * Returns total amount produced in the last production cycle
 */
async function getProductionSupply(resourceId: ResourceId): Promise<number | null> {
  const key = `resource:supply:${resourceId}`;
  const value = await safeGet(key);

  if (value === null) return null;

  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Calculate global price for a resource based on actual production supply
 * Formula: price = basePrice * (demandConstant / (demandConstant + totalSupply))
 *
 * - More production = lower price
 * - Less production = higher price
 * - No production data = drift slowly toward base price
 */
async function calculateResourcePrice(
  resourceId: ResourceId,
  baseValue: number
): Promise<number> {
  const prevPrice = previousPrices.get(resourceId) || baseValue;

  // Get actual production supply from Redis
  const totalSupply = await getProductionSupply(resourceId);

  let price: number;

  if (totalSupply !== null && totalSupply > 0) {
    // Calculate price based on actual supply
    // More supply = lower price (inverse relationship)
    price = baseValue * (DEMAND_CONSTANT / (DEMAND_CONSTANT + totalSupply));
  } else {
    // No production data - drift slowly toward base price
    // This handles new resources or periods of no production
    const drift = 0.05; // 5% drift per tick toward base
    price = prevPrice + (baseValue - prevPrice) * drift;
  }

  // Add small random noise for market feel
  const noise = 1 + (Math.random() - 0.5) * 2 * RANDOM_NOISE_RANGE;
  price = price * noise;

  // Apply floor and ceiling
  const floor = baseValue * PRICE_FLOOR_MULTIPLIER;
  const ceiling = baseValue * PRICE_CEILING_MULTIPLIER;
  price = Math.max(floor, Math.min(ceiling, price));

  // Round to 2 decimal places
  price = Math.round(price * 100) / 100;

  return price;
}

/**
 * Run the market price update job
 * Prices are now based on actual production supply from resourceProductionJob
 */
export async function runMarketPriceJob(): Promise<void> {
  try {
    const resources = await ResourceModel.find();
    const updates: PriceUpdate[] = [];

    // Process each resource (single global price)
    for (const resource of resources) {
      const resourceId = resource.id as ResourceId;
      const baseValue = resource.baseValue;

      // Calculate new price based on actual production supply
      const newPrice = await calculateResourcePrice(resourceId, baseValue);

      // Get previous price for change calculation
      const prevPrice = previousPrices.get(resourceId) || newPrice;

      // Calculate 24h change (simulated as change since last tick)
      const change24h =
        prevPrice > 0 ? Math.round(((newPrice - prevPrice) / prevPrice) * 10000) / 100 : 0;

      // Store new price for next iteration
      previousPrices.set(resourceId, newPrice);

      updates.push({
        resourceId,
        price: newPrice,
        change24h,
      });
    }

    if (updates.length > 0) {
      // Write to Redis cache (with TTL: 10 seconds)
      const cached = await cachePrices(updates);
      if (cached) {
        console.log(`${JOB_NAME} Cached ${updates.length} global prices to Redis (supply-driven)`);
      }

      // Broadcast to connected clients
      const batch: PriceUpdateBatch = { updates };
      broadcastMarketPrices(batch);
      console.log(`${JOB_NAME} Broadcast ${updates.length} supply-driven price updates`);
    }
  } catch (error) {
    console.error(`${JOB_NAME} Error:`, error);
  }
}
