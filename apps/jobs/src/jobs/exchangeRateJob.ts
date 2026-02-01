/**
 * Exchange Rate Job
 *
 * Updates currency exchange rates between worlds based on:
 * - Purchasing Power Parity (CPI ratios)
 * - Trade balance (exports vs imports)
 * - Money supply changes
 * - Currency volatility
 *
 * Economic Theory:
 * - PPP: FX_AB = (CPI_A / CPI_B) * demandFactor * volatility
 * - Demand Factor: Based on trade surplus/deficit
 * - Inflation: Affects CPI over time
 */

import { WorldModel, type WorldDocument } from '@agentropolis/db';
import {
  type WorldId,
  calculateExchangeRate,
  calculateDemandFactor,
  calculateInflation,
  calculateCPI,
  calculateGDPGrowth,
  calculateProsperity,
  ECONOMY_CONSTANTS,
} from '@agentropolis/shared';

// Reference world for exchange rates (Open Frontier = OPN is the base currency)
const BASE_WORLD_ID: WorldId = 'open_frontier';

// Exchange rate bounds (prevent extreme values)
const FX_MIN = 0.1;
const FX_MAX = 10.0;

// Money supply tracking (in-memory for now, should be persisted)
const previousMoneySupply = new Map<WorldId, number>();

interface WorldEconomicState {
  worldId: WorldId;
  cpi: number;
  gdp: number;
  previousGdp: number;
  exports: number;
  imports: number;
  moneySupply: number;
  previousMoneySupply: number;
  volatility: number;
  currentRate: number;
}

/**
 * Calculate CPI for a world based on resource prices (demand map)
 */
function calculateWorldCPI(world: WorldDocument): number {
  const prices = world.demand ?? new Map();

  if (prices.size === 0) {
    return 100; // Base CPI
  }

  const priceMap = new Map<string, number>();
  for (const [resourceId, price] of prices.entries()) {
    priceMap.set(resourceId, price);
  }

  return calculateCPI(priceMap);
}

/**
 * Estimate money supply for a world
 * Based on GDP + trade flows
 */
function estimateMoneySupply(world: WorldDocument): number {
  const gdp = world.gdp || 0;
  const tradeFlow = (world.exportRevenue || 0) + (world.importCost || 0);

  // Simple velocity of money assumption
  return gdp + tradeFlow * 0.5;
}

/**
 * Update exchange rates for all worlds
 */
export async function updateExchangeRates(): Promise<void> {
  console.log('[ExchangeRate] Starting exchange rate update cycle');

  const worlds = await WorldModel.find();

  if (worlds.length === 0) {
    console.log('[ExchangeRate] No worlds found, skipping');
    return;
  }

  // Find the base world
  const baseWorld = worlds.find(w => String(w._id) === BASE_WORLD_ID);
  if (!baseWorld) {
    console.log('[ExchangeRate] Base world not found, skipping');
    return;
  }

  // Phase 1: Calculate economic state for each world
  const economicStates: WorldEconomicState[] = [];

  for (const world of worlds) {
    const worldId = String(world._id) as WorldId;

    const currentMoneySupply = estimateMoneySupply(world);
    const prevMoneySupply = previousMoneySupply.get(worldId) ?? currentMoneySupply;

    economicStates.push({
      worldId,
      cpi: calculateWorldCPI(world),
      gdp: world.gdp || 0,
      previousGdp: world.gdp || 0, // Would need historical tracking
      exports: world.exportRevenue || 0,
      imports: world.importCost || 0,
      moneySupply: currentMoneySupply,
      previousMoneySupply: prevMoneySupply,
      volatility: world.currencyVolatility || 0.15,
      currentRate: world.currentExchangeRate || world.baseExchangeRate,
    });

    // Store for next cycle
    previousMoneySupply.set(worldId, currentMoneySupply);
  }

  // Get base world state
  const baseState = economicStates.find(s => s.worldId === BASE_WORLD_ID)!;

  // Phase 2: Calculate new exchange rates using PPP
  const updates: { worldId: WorldId; rate: number; prosperity: number }[] = [];

  for (const state of economicStates) {
    if (state.worldId === BASE_WORLD_ID) {
      // Base world rate is always 1.0
      updates.push({
        worldId: state.worldId,
        rate: 1.0,
        prosperity: 50,
      });
      continue;
    }

    // Calculate demand factor from trade balance
    const demandFactor = calculateDemandFactor(state.exports, state.imports);

    // Calculate inflation effect
    const inflation = calculateInflation(
      state.moneySupply,
      state.previousMoneySupply,
      ECONOMY_CONSTANTS.INFLATION_BETA
    );

    // Adjust CPI for inflation
    const adjustedCPI = state.cpi * (1 + inflation);

    // Calculate exchange rate using PPP formula
    let newRate = calculateExchangeRate(
      adjustedCPI,
      baseState.cpi,
      demandFactor,
      state.volatility
    );

    // Scale by base exchange rate (world's inherent value)
    const world = worlds.find(w => String(w._id) === state.worldId)!;
    newRate *= world.baseExchangeRate / baseWorld.baseExchangeRate;

    // Apply smoothing (don't change too fast)
    const smoothingFactor = 0.3; // 30% towards new rate per tick
    newRate = state.currentRate * (1 - smoothingFactor) + newRate * smoothingFactor;

    // Clamp to bounds
    newRate = Math.max(FX_MIN, Math.min(FX_MAX, newRate));
    newRate = Math.round(newRate * 10000) / 10000;

    // Calculate prosperity index
    const gdpGrowth = calculateGDPGrowth(state.gdp, state.previousGdp);
    const tradeBalance = (state.exports - state.imports) / Math.max(state.exports + state.imports, 1);
    const employment = Math.min(1, (world.population || 1) / 100); // Normalized

    const prosperity = calculateProsperity(gdpGrowth, inflation, tradeBalance, employment);

    updates.push({
      worldId: state.worldId,
      rate: newRate,
      prosperity,
    });

    console.log(
      `[ExchangeRate] ${state.worldId}: ` +
      `CPI=${adjustedCPI.toFixed(2)}, ` +
      `DemandFactor=${demandFactor.toFixed(3)}, ` +
      `Inflation=${(inflation * 100).toFixed(2)}%, ` +
      `Rate=${state.currentRate.toFixed(4)} -> ${newRate.toFixed(4)}`
    );
  }

  // Phase 3: Save updated rates
  for (const update of updates) {
    await WorldModel.findByIdAndUpdate(update.worldId, {
      $set: {
        currentExchangeRate: update.rate,
        prosperityIndex: update.prosperity,
        lastTickAt: new Date(),
      },
    });
  }

  console.log(`[ExchangeRate] Updated exchange rates for ${worlds.length} worlds`);
}

/**
 * Calculate exchange rate between two specific currencies
 */
export async function getExchangeRateBetween(fromWorldId: WorldId, toWorldId: WorldId): Promise<number> {
  if (fromWorldId === toWorldId) return 1;

  const [fromWorld, toWorld] = await Promise.all([
    WorldModel.findById(fromWorldId),
    WorldModel.findById(toWorldId),
  ]);

  if (!fromWorld || !toWorld) {
    throw new Error('World not found');
  }

  // Rate is relative to each other via base currency
  return fromWorld.currentExchangeRate / toWorld.currentExchangeRate;
}
