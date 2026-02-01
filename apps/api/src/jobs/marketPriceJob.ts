/**
 * Market Price Job
 *
 * Computes resource price changes based on supply/demand simulation
 * using scientifically-grounded economic formulas.
 *
 * Each world has DIFFERENT prices based on:
 * - Local supply (world affinity/production)
 * - Local demand (population, prosperity)
 * - Trade balance effects
 * - Random volatility
 *
 * Arbitrage opportunities are flagged when price gaps exceed threshold.
 *
 * Redis Keys:
 * - price:{resourceId}:{worldId} = { price, change24h, updatedAt } (TTL: 10s)
 */

import { ResourceModel, WorldModel, TradeModel } from '@agentropolis/db';
import type { WorldId, ResourceId, PriceUpdate, PriceUpdateBatch } from '@agentropolis/shared';
import { WORLD_IDS } from '@agentropolis/shared';
import { broadcastMarketPrices } from '../socket';
import { cachePrices } from '../redis/cache';
import {
  updatePrice,
  calculateLocalPrice,
  calculateDemandBias,
  calculateSupplyBias,
  calculateInflation,
  applyInflation,
  findBestArbitrage,
  ECONOMY_CONSTANTS,
} from '../services/economyEngine';

const JOB_NAME = '[MarketPriceJob]';

// Store previous prices and money supply for calculations
const previousPrices: Map<string, number> = new Map();
const previousMoneySupply: Map<WorldId, number> = new Map();

// Simulated supply and demand per world/resource
// In a real system, these would be tracked from actual trades
const worldSupply: Map<string, number> = new Map();
const worldDemand: Map<string, number> = new Map();

/**
 * Initialize or get simulated supply/demand values
 */
function getSupplyDemand(worldId: WorldId, resourceId: ResourceId, affinity: number): { supply: number; demand: number } {
  const key = `${worldId}:${resourceId}`;

  // Initialize if not exists
  if (!worldSupply.has(key)) {
    // Higher affinity = more supply
    const baseSupply = 100 * affinity;
    // Base demand affected by resource tier (higher tier = more valuable = more demand)
    const baseDemand = 80 + Math.random() * 40;

    worldSupply.set(key, baseSupply);
    worldDemand.set(key, baseDemand);
  }

  // Add small random fluctuation each tick
  const currentSupply = worldSupply.get(key)!;
  const currentDemand = worldDemand.get(key)!;

  // Random walk for supply/demand (mean reverting)
  const supplyChange = (Math.random() - 0.5) * 10 - (currentSupply - 100 * affinity) * 0.01;
  const demandChange = (Math.random() - 0.5) * 10 - (currentDemand - 100) * 0.01;

  const newSupply = Math.max(1, currentSupply + supplyChange);
  const newDemand = Math.max(1, currentDemand + demandChange);

  worldSupply.set(key, newSupply);
  worldDemand.set(key, newDemand);

  return { supply: newSupply, demand: newDemand };
}

/**
 * Get recent trade volume for a world to estimate money supply
 */
async function getWorldTradeVolume(worldId: WorldId): Promise<number> {
  try {
    // Get trades in the last 24 hours (simulated as last 100 trades)
    const recentTrades = await TradeModel.find({
      $or: [{ sellerWorldId: worldId }, { buyerWorldId: worldId }],
    })
      .sort({ createdAt: -1 })
      .limit(100);

    let volume = 0;
    for (const trade of recentTrades) {
      if (trade.sellerWorldId === worldId) {
        // Exports bring money in
        volume += trade.totalPrice;
      } else {
        // Imports send money out
        volume -= trade.buyerPaid;
      }
    }

    // Return absolute volume for money supply calculation
    return Math.abs(volume) + 10000; // Base money supply of 10000
  } catch {
    return 10000; // Fallback
  }
}

/**
 * Calculate price for a resource in a world using economic formulas
 */
async function calculateResourcePrice(
  resourceId: ResourceId,
  baseValue: number,
  volatility: number,
  worldId: WorldId,
  worldAffinity: number,
  worldProsperity: number,
  worldPopulation: number
): Promise<number> {
  const priceKey = `${worldId}:${resourceId}`;
  const prevPrice = previousPrices.get(priceKey) || baseValue;

  // Get supply/demand for this world/resource
  const { supply, demand } = getSupplyDemand(worldId, resourceId, worldAffinity);

  // Step 1: Apply supply-demand price update
  let price = updatePrice(prevPrice, demand, supply, ECONOMY_CONSTANTS.PRICE_ALPHA);

  // Step 2: Calculate local price adjustments
  const demandBias = calculateDemandBias(worldPopulation, worldProsperity);
  const supplyBias = calculateSupplyBias(worldAffinity);
  price = calculateLocalPrice(price, demandBias, supplyBias, ECONOMY_CONSTANTS.BASE_TARIFF);

  // Step 3: Apply inflation if money supply changed
  const currentMoney = await getWorldTradeVolume(worldId);
  const prevMoney = previousMoneySupply.get(worldId) || currentMoney;
  const inflation = calculateInflation(currentMoney, prevMoney, ECONOMY_CONSTANTS.INFLATION_BETA);
  price = applyInflation(price, inflation);
  previousMoneySupply.set(worldId, currentMoney);

  // Step 4: Add random volatility
  const randomDrift = 1 + (Math.random() - 0.5) * volatility * 0.1;
  price = price * randomDrift;

  // Round and clamp
  price = Math.max(0.01, Math.round(price * 100) / 100);

  return price;
}

/**
 * Run the market price update job
 */
export async function runMarketPriceJob(): Promise<void> {
  try {
    const resources = await ResourceModel.find();
    const worlds = await WorldModel.find();
    const updates: PriceUpdate[] = [];

    // Build world data maps
    const worldData: Map<WorldId, { prosperity: number; population: number }> = new Map();
    for (const world of worlds) {
      worldData.set(world.id as WorldId, {
        prosperity: world.prosperityIndex,
        population: world.population,
      });
    }

    // Process each resource
    for (const resource of resources) {
      const resourceId = resource.id as ResourceId;
      const baseValue = resource.baseValue;
      const volatility = resource.volatility || 0.15;

      // Get world affinity map
      const affinityMap =
        resource.worldAffinity instanceof Map
          ? Object.fromEntries(resource.worldAffinity)
          : resource.worldAffinity || {};

      // Track prices for arbitrage detection
      const resourcePrices: Map<WorldId, number> = new Map();

      // Calculate price for each world
      for (const worldId of WORLD_IDS) {
        const data = worldData.get(worldId) || { prosperity: 50, population: 0 };
        const affinity = (affinityMap as Record<string, number>)[worldId] || 1.0;

        // Calculate new price using economic formulas
        const newPrice = await calculateResourcePrice(
          resourceId,
          baseValue,
          volatility,
          worldId,
          affinity,
          data.prosperity,
          data.population
        );

        // Get previous price for change calculation
        const priceKey = `${worldId}:${resourceId}`;
        const prevPrice = previousPrices.get(priceKey) || newPrice;

        // Calculate 24h change (simulated as change since last tick)
        const change24h =
          prevPrice > 0 ? Math.round(((newPrice - prevPrice) / prevPrice) * 10000) / 100 : 0;

        // Store new price for next iteration
        previousPrices.set(priceKey, newPrice);
        resourcePrices.set(worldId, newPrice);

        updates.push({
          resourceId,
          worldId,
          price: newPrice,
          change24h,
        });
      }

      // Check for arbitrage opportunities
      const arbitrage = findBestArbitrage(
        resourcePrices,
        ECONOMY_CONSTANTS.TRANSPORT_FEE * baseValue,
        ECONOMY_CONSTANTS.TRADE_FEE
      );

      if (arbitrage && arbitrage.profitMargin > ECONOMY_CONSTANTS.MIN_ARBITRAGE_MARGIN) {
        console.log(
          `${JOB_NAME} Arbitrage opportunity: ${resourceId} - ` +
            `Buy at ${arbitrage.buyWorldId} (${arbitrage.buyPrice.toFixed(2)}) → ` +
            `Sell at ${arbitrage.sellWorldId} (${arbitrage.sellPrice.toFixed(2)}) = ` +
            `${(arbitrage.profitMargin * 100).toFixed(1)}% profit`
        );
      }
    }

    if (updates.length > 0) {
      // Write to Redis cache (with TTL: 10 seconds)
      const cached = await cachePrices(updates);
      if (cached) {
        console.log(`${JOB_NAME} Cached ${updates.length} prices to Redis`);
      }

      // Broadcast to connected clients
      const batch: PriceUpdateBatch = { updates };
      broadcastMarketPrices(batch);
      console.log(`${JOB_NAME} Broadcast ${updates.length} price updates`);
    }
  } catch (error) {
    console.error(`${JOB_NAME} Error:`, error);
  }
}
