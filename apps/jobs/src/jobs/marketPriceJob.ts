/**
 * Market Price Job
 *
 * Updates resource prices for each world based on:
 * - Local supply and demand
 * - Trade activity
 * - World-specific affinity (production capability)
 * - Arbitrage pressure
 *
 * Economic Theory:
 * - Supply-Demand: P_t+1 = P_t * (1 + alpha * (D - S) / max(S, 1))
 * - Local pricing: P_local = P_global * (1 + demand_bias - supply_bias + tariff)
 */

import { WorldModel, ResourceModel, TradeModel, type WorldDocument } from '@agentropolis/db';
import {
  type WorldId,
  type ResourceId,
  updatePrice,
  calculateLocalPrice,
  calculateDemandBias,
  calculateSupplyBias,
  findBestArbitrage,
  ECONOMY_CONSTANTS,
} from '@agentropolis/shared';

// How much trades affect supply/demand (decay factor)
const TRADE_IMPACT_WEIGHT = 0.1;

// Price bounds to prevent extreme values
const MIN_PRICE_MULTIPLIER = 0.1;
const MAX_PRICE_MULTIPLIER = 10.0;

interface WorldPriceState {
  worldId: WorldId;
  prices: Map<ResourceId, number>;
  supply: Map<ResourceId, number>;
  demand: Map<ResourceId, number>;
}

/**
 * Calculate aggregate demand from recent trades
 */
async function calculateTradeDemand(worldId: WorldId, resourceId: ResourceId): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Count imports as demand (world is buying)
  const importTrades = await TradeModel.aggregate([
    {
      $match: {
        buyerWorldId: worldId,
        resourceId,
        settledAt: { $gte: oneDayAgo },
      },
    },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: '$quantity' },
      },
    },
  ]);

  return importTrades[0]?.totalQuantity ?? 0;
}

/**
 * Calculate aggregate supply from recent trades
 */
async function calculateTradeSupply(worldId: WorldId, resourceId: ResourceId): Promise<number> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Count exports as supply (world is selling)
  const exportTrades = await TradeModel.aggregate([
    {
      $match: {
        sellerWorldId: worldId,
        resourceId,
        settledAt: { $gte: oneDayAgo },
      },
    },
    {
      $group: {
        _id: null,
        totalQuantity: { $sum: '$quantity' },
      },
    },
  ]);

  return exportTrades[0]?.totalQuantity ?? 0;
}

/**
 * Get the current local price for a resource in a world
 * Falls back to base value if not set
 */
function getLocalPrice(world: WorldDocument, resourceId: ResourceId, baseValue: number): number {
  // World inventory price could be stored, for now use demand/production to estimate
  const inventory = world.inventory?.get(resourceId) ?? 0;
  const demand = world.demand?.get(resourceId) ?? baseValue;

  // If we have stored price, use it; otherwise calculate from base
  if (inventory > 0) {
    // Price inversely related to inventory
    const inventoryFactor = Math.max(0.5, Math.min(2.0, baseValue / Math.max(inventory, 1)));
    return baseValue * inventoryFactor;
  }

  return demand > 0 ? demand : baseValue;
}

/**
 * Update prices for all resources in all worlds
 */
export async function updateMarketPrices(): Promise<void> {
  console.log('[MarketPrice] Starting price update cycle');

  const [worlds, resources] = await Promise.all([
    WorldModel.find(),
    ResourceModel.find(),
  ]);

  if (worlds.length === 0 || resources.length === 0) {
    console.log('[MarketPrice] No worlds or resources found, skipping');
    return;
  }

  const worldPriceStates: WorldPriceState[] = [];

  // Phase 1: Calculate new prices for each world
  for (const world of worlds) {
    const worldId = String(world._id) as WorldId;
    const prices = new Map<ResourceId, number>();
    const supply = new Map<ResourceId, number>();
    const demand = new Map<ResourceId, number>();

    for (const resource of resources) {
      const resourceId = String(resource._id) as ResourceId;
      const baseValue = resource.baseValue;

      // Get world affinity (production multiplier)
      const affinity = resource.worldAffinity?.get(worldId) ?? 0;

      // Calculate supply and demand from trades
      const [tradeDemand, tradeSupply] = await Promise.all([
        calculateTradeDemand(worldId, resourceId),
        calculateTradeSupply(worldId, resourceId),
      ]);

      // Base supply from world's production rate
      const productionRate = world.productionRates?.get(resourceId) ?? 0;
      const baseSupply = productionRate * affinity;

      // Combine with trade activity
      const effectiveSupply = baseSupply + tradeSupply * TRADE_IMPACT_WEIGHT;
      const effectiveDemand = (world.demand?.get(resourceId) ?? baseValue * 0.1) + tradeDemand * TRADE_IMPACT_WEIGHT;

      supply.set(resourceId, effectiveSupply);
      demand.set(resourceId, effectiveDemand);

      // Get current local price
      const currentPrice = getLocalPrice(world, resourceId, baseValue);

      // Update price based on supply-demand imbalance
      let newPrice = updatePrice(currentPrice, effectiveDemand, effectiveSupply, ECONOMY_CONSTANTS.PRICE_ALPHA);

      // Apply local market conditions
      const demandBias = calculateDemandBias(world.population, world.prosperityIndex);
      const supplyBias = calculateSupplyBias(affinity);
      newPrice = calculateLocalPrice(newPrice, demandBias, supplyBias, ECONOMY_CONSTANTS.BASE_TARIFF);

      // Apply volatility noise
      const volatility = resource.volatility ?? 0.15;
      const noise = 1 + (Math.random() - 0.5) * volatility * 0.1;
      newPrice *= noise;

      // Clamp to bounds relative to base value
      const minPrice = baseValue * MIN_PRICE_MULTIPLIER;
      const maxPrice = baseValue * MAX_PRICE_MULTIPLIER;
      newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
      newPrice = Math.round(newPrice * 100) / 100;

      prices.set(resourceId, newPrice);
    }

    worldPriceStates.push({ worldId, prices, supply, demand });
  }

  // Phase 2: Apply arbitrage pressure
  // When price gaps are large, apply pressure to close them
  for (const resource of resources) {
    const resourceId = String(resource._id) as ResourceId;
    const pricesForResource = new Map<WorldId, number>();

    for (const state of worldPriceStates) {
      pricesForResource.set(state.worldId, state.prices.get(resourceId) ?? resource.baseValue);
    }

    const arbitrage = findBestArbitrage(
      pricesForResource,
      ECONOMY_CONSTANTS.TRANSPORT_FEE * resource.baseValue,
      ECONOMY_CONSTANTS.TRADE_FEE
    );

    if (arbitrage && arbitrage.profitMargin > ECONOMY_CONSTANTS.MIN_ARBITRAGE_MARGIN * 2) {
      // Apply price convergence pressure
      const convergenceRate = 0.02; // 2% per tick

      const highPriceState = worldPriceStates.find(s => s.worldId === arbitrage.sellWorldId);
      const lowPriceState = worldPriceStates.find(s => s.worldId === arbitrage.buyWorldId);

      if (highPriceState && lowPriceState) {
        const highPrice = highPriceState.prices.get(resourceId)!;
        const lowPrice = lowPriceState.prices.get(resourceId)!;

        // Push prices towards each other
        highPriceState.prices.set(resourceId, highPrice * (1 - convergenceRate));
        lowPriceState.prices.set(resourceId, lowPrice * (1 + convergenceRate));

        console.log(
          `[MarketPrice] Arbitrage pressure on ${resourceId}: ` +
          `${arbitrage.buyWorldId} (${lowPrice.toFixed(2)}) -> ${arbitrage.sellWorldId} (${highPrice.toFixed(2)}), ` +
          `profit margin: ${(arbitrage.profitMargin * 100).toFixed(1)}%`
        );
      }
    }
  }

  // Phase 3: Save updated prices to world documents
  for (const state of worldPriceStates) {
    await WorldModel.findByIdAndUpdate(state.worldId, {
      $set: {
        demand: Object.fromEntries(state.prices),
        lastTickAt: new Date(),
      },
    });
  }

  console.log(`[MarketPrice] Updated prices for ${worlds.length} worlds, ${resources.length} resources`);
}
