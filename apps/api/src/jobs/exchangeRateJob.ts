/**
 * Exchange Rate Job
 *
 * Applies Purchasing Power Parity (PPP) based exchange rate calculations.
 * Updates WorldModel.currentExchangeRate, writes to Redis cache,
 * and broadcasts via fx.rate.batch.
 *
 * PPP-based formula: FX = (CPI_A / CPI_B) * demandFactor * volatilityNoise
 *
 * Factors in:
 * - Relative price levels (CPI proxy from prosperity)
 * - Trade balance (surplus = stronger currency)
 * - Money supply changes
 * - Currency volatility
 *
 * Redis Keys:
 * - fx:{currencyCode} = rate value (TTL: 5s)
 * - fx:matrix = full rates object (TTL: 5s)
 */

import { WorldModel } from '@agentropolis/db';
import type { ExchangeRateBatch, WorldId } from '@agentropolis/shared';
import { broadcastExchangeRates } from '../socket';
import { cacheExchangeRates } from '../redis/cache';
import {
  calculateExchangeRate,
  calculateDemandFactor,
  calculateInflation,
  ECONOMY_CONSTANTS,
} from '../services/economyEngine';

const JOB_NAME = '[ExchangeRateJob]';

// Base currency for exchange rate calculations (Open Frontier)
const BASE_CURRENCY = 'OPN';
const BASE_WORLD_ID: WorldId = 'open_frontier';

// Track previous money supply for inflation calculations
const previousMoneySupply: Map<WorldId, number> = new Map();

// Track CPI proxy values (based on trade activity and prosperity)
const worldCPI: Map<WorldId, number> = new Map();

/**
 * Calculate CPI proxy for a world
 *
 * CPI is approximated from:
 * - Prosperity index (economic health)
 * - Trade balance (surplus = stronger economy = potentially higher prices)
 * - Inflation from money supply changes
 */
function calculateWorldCPI(
  worldId: WorldId,
  prosperity: number,
  exportRevenue: number,
  importCost: number
): number {
  // Base CPI from prosperity (higher prosperity = higher prices/living standards)
  const baseCPI = 80 + prosperity * 0.4; // Range: 80-120

  // Trade balance effect
  const totalTrade = Math.max(exportRevenue + importCost, 1);
  const tradeBalance = (exportRevenue - importCost) / totalTrade;

  // Strong exports can lead to currency appreciation → lower relative CPI
  // But we want CPI to reflect internal prices, so trade surplus = slight CPI increase
  const tradeCPI = baseCPI * (1 + tradeBalance * 0.05);

  // Store and return
  const prevCPI = worldCPI.get(worldId) || tradeCPI;

  // Smooth transition (don't jump too fast)
  const newCPI = prevCPI * 0.9 + tradeCPI * 0.1;
  worldCPI.set(worldId, newCPI);

  return newCPI;
}

/**
 * Calculate money supply from trade activity
 * Exports bring money in, imports send money out
 */
function calculateMoneySupply(
  exportRevenue: number,
  importCost: number,
  gdp: number
): number {
  // Base money supply proportional to GDP
  const baseSupply = Math.max(gdp, 1000);

  // Trade balance affects money supply
  const tradeBalance = exportRevenue - importCost;

  return baseSupply + tradeBalance;
}

/**
 * Apply mean reversion to exchange rates
 * Prevents rates from drifting too far from fundamentals
 */
function applyMeanReversion(
  currentRate: number,
  baseRate: number,
  strength = 0.005
): number {
  const deviation = currentRate - baseRate;
  return currentRate - deviation * strength;
}

/**
 * Run the exchange rate job with PPP-based calculations
 */
export async function runExchangeRateJob(): Promise<void> {
  try {
    const worlds = await WorldModel.find();
    const rates: Record<string, number> = {};
    let anyChanged = false;

    // Find base world (Open Frontier)
    const baseWorld = worlds.find((w) => w.id === BASE_WORLD_ID);
    if (!baseWorld) {
      console.error(`${JOB_NAME} Base world not found`);
      return;
    }

    // Calculate base world CPI
    const baseCPI = calculateWorldCPI(
      BASE_WORLD_ID,
      baseWorld.prosperityIndex,
      baseWorld.exportRevenue,
      baseWorld.importCost
    );

    // Base currency always 1.0
    rates[BASE_CURRENCY] = 1.0;

    // Process each world
    for (const world of worlds) {
      const worldId = world.id as WorldId;

      // Skip base currency
      if (world.currency.code === BASE_CURRENCY) {
        continue;
      }

      // Calculate world CPI
      const worldCPIValue = calculateWorldCPI(
        worldId,
        world.prosperityIndex,
        world.exportRevenue,
        world.importCost
      );

      // Calculate demand factor from trade balance
      const demandFactor = calculateDemandFactor(world.exportRevenue, world.importCost);

      // Calculate inflation effect
      const currentMoney = calculateMoneySupply(
        world.exportRevenue,
        world.importCost,
        world.gdp
      );
      const prevMoney = previousMoneySupply.get(worldId) || currentMoney;
      const inflation = calculateInflation(currentMoney, prevMoney, ECONOMY_CONSTANTS.INFLATION_BETA);
      previousMoneySupply.set(worldId, currentMoney);

      // Inflation affects purchasing power → affects exchange rate
      // Higher inflation = weaker currency = lower exchange rate
      const inflationAdjustment = 1 - inflation * 0.5; // Dampen effect

      // Calculate PPP-based exchange rate
      // Higher CPI ratio = currency buys less → lower exchange rate
      const pppRate = calculateExchangeRate(
        worldCPIValue * inflationAdjustment,
        baseCPI,
        demandFactor,
        world.currencyVolatility
      );

      // Scale to base exchange rate
      // This maintains the intended relative values while allowing PPP drift
      const scaledRate = pppRate * (world.baseExchangeRate / (worldCPIValue / baseCPI));

      // Apply mean reversion to prevent extreme drift
      const revertedRate = applyMeanReversion(scaledRate, world.baseExchangeRate, 0.005);

      // Clamp rate to reasonable bounds
      const minRate = world.baseExchangeRate * ECONOMY_CONSTANTS.FX_MIN_MULTIPLIER;
      const maxRate = world.baseExchangeRate * ECONOMY_CONSTANTS.FX_MAX_MULTIPLIER;
      const clampedRate = Math.max(minRate, Math.min(maxRate, revertedRate));

      // Round to 4 decimal places
      const finalRate = Math.round(clampedRate * 10000) / 10000;

      // Check if rate changed
      if (Math.abs(finalRate - world.currentExchangeRate) > 0.0001) {
        world.currentExchangeRate = finalRate;
        await world.save();
        anyChanged = true;
      }

      rates[world.currency.code] = finalRate;
    }

    // Build batch payload
    const batch: ExchangeRateBatch = {
      baseCurrency: BASE_CURRENCY,
      rates,
    };

    // Write to Redis cache (with TTL: 5 seconds)
    const cached = await cacheExchangeRates(batch);
    if (cached) {
      console.log(`${JOB_NAME} Cached exchange rates to Redis`);
    }

    // Broadcast to connected clients (even if no changes)
    broadcastExchangeRates(batch);

    if (anyChanged) {
      console.log(
        `${JOB_NAME} Updated exchange rates:`,
        Object.entries(rates)
          .map(([k, v]) => `${k}=${v.toFixed(4)}`)
          .join(', ')
      );
    }
  } catch (error) {
    console.error(`${JOB_NAME} Error:`, error);
  }
}
