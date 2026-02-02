/**
 * Economy Engine
 *
 * Scientifically-grounded economic formulas based on:
 * - Supply-Demand Price Theory
 * - Fisher Equation (Inflation)
 * - Purchasing Power Parity (Exchange Rates)
 * - Arbitrage Theory
 *
 * These formulas drive the live economy simulation.
 */

import type { WorldId } from '../types/world';

// ============================================================================
// Price Update (Supply-Demand Theory)
// ============================================================================

/**
 * Update price based on supply-demand imbalance
 *
 * Formula: P_t+1 = P_t * (1 + alpha * (D - S) / max(S, 1))
 *
 * Economic basis: When demand exceeds supply, prices rise.
 * When supply exceeds demand, prices fall.
 * The alpha parameter controls price sensitivity.
 *
 * @param currentPrice - Current market price
 * @param demand - Current demand (quantity wanted)
 * @param supply - Current supply (quantity available)
 * @param alpha - Price sensitivity factor (default 0.05 = 5% max adjustment)
 * @returns New price after supply-demand adjustment
 */
export function updatePrice(
  currentPrice: number,
  demand: number,
  supply: number,
  alpha = 0.05
): number {
  const effectiveSupply = Math.max(supply, 1); // Prevent division by zero
  const imbalance = (demand - supply) / effectiveSupply;

  // Clamp imbalance to prevent exponential overflow
  // Max 2x or 0.5x price change per tick
  const clampedImbalance = Math.max(-10, Math.min(10, imbalance));
  const newPrice = currentPrice * (1 + alpha * clampedImbalance);

  // Clamp to prevent negative prices and extreme values
  return Math.max(0.01, Math.round(newPrice * 100) / 100);
}

// ============================================================================
// Inflation (Fisher Equation / Money Supply Effect)
// ============================================================================

/**
 * Calculate inflation rate based on money supply changes
 *
 * Formula: pi_t = beta * (M_t - M_t-1) / max(M_t-1, 1)
 *
 * Economic basis: Based on the Quantity Theory of Money.
 * Rapid growth in money supply leads to inflation.
 * Beta controls how responsive prices are to money supply changes.
 *
 * @param currentMoneySupply - Current total money in circulation
 * @param previousMoneySupply - Previous period's money supply
 * @param beta - Inflation sensitivity (default 0.2 = 20% of money growth becomes inflation)
 * @returns Inflation rate as a decimal (e.g., 0.05 = 5% inflation)
 */
export function calculateInflation(
  currentMoneySupply: number,
  previousMoneySupply: number,
  beta = 0.2
): number {
  const effectivePrevious = Math.max(previousMoneySupply, 1);
  const moneyGrowth = (currentMoneySupply - previousMoneySupply) / effectivePrevious;
  return beta * moneyGrowth;
}

/**
 * Apply inflation to a price
 *
 * @param price - Current price
 * @param inflationRate - Inflation rate as decimal
 * @returns Inflation-adjusted price
 */
export function applyInflation(price: number, inflationRate: number): number {
  return Math.max(0.01, Math.round(price * (1 + inflationRate) * 100) / 100);
}

// ============================================================================
// Exchange Rate (Purchasing Power Parity)
// ============================================================================

/**
 * Calculate exchange rate based on Purchasing Power Parity (PPP)
 *
 * Formula: FX_AB = (CPI_A / CPI_B) * demandFactor * (1 + noise * volatility)
 *
 * Economic basis: According to PPP, exchange rates should adjust
 * so that identical goods cost the same in different currencies.
 * We add demand factors and volatility for realism.
 *
 * @param cpiFrom - Consumer Price Index of source currency
 * @param cpiTo - Consumer Price Index of target currency
 * @param demandFactor - Trade balance adjustment (>1 if source has trade surplus)
 * @param volatility - Currency volatility (0-1)
 * @returns Exchange rate (units of target per unit of source)
 */
export function calculateExchangeRate(
  cpiFrom: number,
  cpiTo: number,
  demandFactor: number,
  volatility: number
): number {
  const basePPP = cpiFrom / Math.max(cpiTo, 0.001);
  const noise = 1 + (Math.random() - 0.5) * volatility * 0.1;
  const rate = basePPP * demandFactor * noise;

  // Round to 4 decimal places
  return Math.max(0.0001, Math.round(rate * 10000) / 10000);
}

/**
 * Calculate demand factor based on trade balance
 *
 * Countries with trade surpluses have stronger currencies.
 *
 * @param exports - Total export value
 * @param imports - Total import value
 * @returns Demand factor multiplier
 */
export function calculateDemandFactor(exports: number, imports: number): number {
  const tradeBalance = exports - imports;
  const totalTrade = Math.max(exports + imports, 1);
  const balanceRatio = tradeBalance / totalTrade;

  // Convert to multiplier: surplus = stronger currency (higher rate)
  // Range: 0.9 (deficit) to 1.1 (surplus)
  return 1 + balanceRatio * 0.1;
}

// ============================================================================
// Country-specific Pricing (Local Market Conditions)
// ============================================================================

/**
 * Calculate local price for a resource in a specific world
 *
 * Formula: P_local = P_global * (1 + demand_bias - supply_bias + tariff)
 *
 * Economic basis: Local prices deviate from global prices due to:
 * - Local demand (scarcity premium)
 * - Local supply (production discount)
 * - Trade barriers (tariffs)
 *
 * @param globalPrice - Global/base price of the resource
 * @param demandBias - Local demand factor (0-1, higher = more demand = higher price)
 * @param supplyBias - Local supply factor (0-1, higher = more supply = lower price)
 * @param tariff - Import tariff as decimal (default 0.03 = 3%)
 * @returns Local market price
 */
export function calculateLocalPrice(
  globalPrice: number,
  demandBias: number,
  supplyBias: number,
  tariff = 0.03
): number {
  const adjustmentFactor = 1 + demandBias - supplyBias + tariff;
  const localPrice = globalPrice * adjustmentFactor;

  return Math.max(0.01, Math.round(localPrice * 100) / 100);
}

/**
 * Calculate demand bias for a world based on population and prosperity
 *
 * @param population - World population (active agents)
 * @param prosperity - Prosperity index (0-100)
 * @param maxPopulation - Maximum expected population for normalization
 * @returns Demand bias (0-1)
 */
export function calculateDemandBias(
  population: number,
  prosperity: number,
  maxPopulation = 1000
): number {
  const populationFactor = Math.min(population / maxPopulation, 1) * 0.3;
  const prosperityFactor = (prosperity / 100) * 0.2;
  return populationFactor + prosperityFactor;
}

/**
 * Calculate supply bias based on world affinity for a resource
 *
 * @param worldAffinity - Production multiplier for this world (0-3)
 * @returns Supply bias (0-1)
 */
export function calculateSupplyBias(worldAffinity: number): number {
  // Higher affinity = more production = more supply = lower prices
  // Affinity 0 = 0 supply bias
  // Affinity 3 = 0.5 supply bias (significant discount)
  return Math.min(worldAffinity / 6, 0.5);
}

// ============================================================================
// Arbitrage Detection
// ============================================================================

/**
 * Calculate potential arbitrage profit
 *
 * Formula: profit = P_high - P_low - transport_fee - tax
 *
 * Economic basis: Arbitrage occurs when the same good has different
 * prices in different markets. Traders can profit by buying low
 * and selling high, minus transaction costs.
 *
 * @param priceHigh - Higher price (sell market)
 * @param priceLow - Lower price (buy market)
 * @param transportFee - Cost to move goods between markets
 * @param tax - Transaction tax/fee
 * @returns Profit per unit (negative = not profitable)
 */
export function calculateArbitrageProfit(
  priceHigh: number,
  priceLow: number,
  transportFee: number,
  tax: number
): number {
  return priceHigh - priceLow - transportFee - tax;
}

/**
 * Check if arbitrage opportunity exists
 *
 * @param priceHigh - Higher price
 * @param priceLow - Lower price
 * @param transportFee - Transport cost
 * @param tax - Transaction tax
 * @param minProfitMargin - Minimum profit margin required (default 5%)
 * @returns True if profitable arbitrage exists
 */
export function hasArbitrageOpportunity(
  priceHigh: number,
  priceLow: number,
  transportFee: number,
  tax: number,
  minProfitMargin = 0.05
): boolean {
  const profit = calculateArbitrageProfit(priceHigh, priceLow, transportFee, tax);
  const profitMargin = profit / priceLow;
  return profitMargin > minProfitMargin;
}

/**
 * Find best arbitrage opportunities across worlds
 *
 * @param prices - Map of worldId to price
 * @param transportFee - Base transport cost
 * @param taxRate - Tax rate as decimal
 * @returns Best opportunity or null
 */
export function findBestArbitrage(
  prices: Map<WorldId, number>,
  transportFee: number,
  taxRate: number
): ArbitrageOpportunity | null {
  let bestOpportunity: ArbitrageOpportunity | null = null;
  let bestProfit = 0;

  const worldIds = Array.from(prices.keys());

  for (const buyWorld of worldIds) {
    for (const sellWorld of worldIds) {
      if (buyWorld === sellWorld) continue;

      const buyPrice = prices.get(buyWorld)!;
      const sellPrice = prices.get(sellWorld)!;
      const tax = sellPrice * taxRate;

      const profit = calculateArbitrageProfit(sellPrice, buyPrice, transportFee, tax);

      if (profit > bestProfit) {
        bestProfit = profit;
        bestOpportunity = {
          buyWorldId: buyWorld,
          sellWorldId: sellWorld,
          buyPrice,
          sellPrice,
          profit,
          profitMargin: profit / buyPrice,
          transportFee,
          tax,
        };
      }
    }
  }

  return bestOpportunity;
}

export interface ArbitrageOpportunity {
  buyWorldId: WorldId;
  sellWorldId: WorldId;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  profitMargin: number;
  transportFee: number;
  tax: number;
}

// ============================================================================
// World Economy State Calculations
// ============================================================================

/**
 * Calculate CPI (Consumer Price Index) for a world
 *
 * CPI is a weighted average of resource prices.
 *
 * @param prices - Map of resourceId to price
 * @param weights - Map of resourceId to weight (defaults to equal weights)
 * @returns CPI value
 */
export function calculateCPI(
  prices: Map<string, number>,
  weights?: Map<string, number>
): number {
  if (prices.size === 0) return 100; // Base CPI

  let totalWeight = 0;
  let weightedSum = 0;

  for (const [resourceId, price] of prices) {
    const weight = weights?.get(resourceId) ?? 1;
    weightedSum += price * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 100;
}

/**
 * Calculate GDP growth rate
 *
 * @param currentGDP - Current GDP
 * @param previousGDP - Previous period GDP
 * @returns Growth rate as decimal
 */
export function calculateGDPGrowth(currentGDP: number, previousGDP: number): number {
  if (previousGDP <= 0) return 0;
  return (currentGDP - previousGDP) / previousGDP;
}

/**
 * Calculate prosperity index based on multiple factors
 *
 * @param gdpGrowth - GDP growth rate
 * @param inflation - Inflation rate
 * @param tradeBalance - Trade balance ratio
 * @param employment - Employment rate (0-1)
 * @returns Prosperity index (0-100)
 */
export function calculateProsperity(
  gdpGrowth: number,
  inflation: number,
  tradeBalance: number,
  employment: number
): number {
  // Weights for each factor
  const gdpWeight = 30;
  const inflationWeight = 25;
  const tradeWeight = 20;
  const employmentWeight = 25;

  // GDP growth contribution (positive growth = good)
  // Optimal growth around 3-5%
  const gdpScore = Math.max(0, Math.min(1, (gdpGrowth + 0.1) / 0.2)) * gdpWeight;

  // Inflation contribution (low inflation = good)
  // Optimal around 2%
  const inflationScore = Math.max(0, Math.min(1, 1 - Math.abs(inflation - 0.02) * 10)) * inflationWeight;

  // Trade balance contribution (surplus = good, but balanced is ok)
  const tradeScore = Math.max(0, Math.min(1, 0.5 + tradeBalance * 0.5)) * tradeWeight;

  // Employment contribution (higher = better)
  const employmentScore = employment * employmentWeight;

  return Math.round(gdpScore + inflationScore + tradeScore + employmentScore);
}

// ============================================================================
// Constants and Configuration
// ============================================================================

/**
 * Economic constants used throughout the simulation
 */
export const ECONOMY_CONSTANTS = {
  // Price sensitivity
  PRICE_ALPHA: 0.05, // 5% max price adjustment per tick

  // Inflation
  INFLATION_BETA: 0.2, // 20% of money growth becomes inflation

  // Tariffs and fees
  BASE_TARIFF: 0.03, // 3% base tariff
  TRADE_FEE: 0.03, // 3% trade fee
  TRANSPORT_FEE: 0.02, // 2% transport cost

  // Arbitrage
  MIN_ARBITRAGE_MARGIN: 0.05, // 5% minimum profit for arbitrage

  // Exchange rate bounds
  FX_MIN_MULTIPLIER: 0.5, // 50% of base rate minimum
  FX_MAX_MULTIPLIER: 2.0, // 200% of base rate maximum

  // Prosperity weights
  GDP_GROWTH_WEIGHT: 0.3,
  INFLATION_WEIGHT: 0.25,
  TRADE_BALANCE_WEIGHT: 0.2,
  EMPLOYMENT_WEIGHT: 0.25,
};

// ============================================================================
// Trade Impact Functions
// ============================================================================

/**
 * Calculate the impact of a trade on supply and demand
 *
 * @param quantity - Quantity traded
 * @param currentSupply - Current supply in seller's world
 * @param currentDemand - Current demand in buyer's world
 * @returns Updated supply and demand values
 */
export function calculateTradeImpact(
  quantity: number,
  currentSupply: number,
  currentDemand: number
): { newSupply: number; newDemand: number } {
  // Trade reduces seller's supply
  const newSupply = Math.max(0, currentSupply - quantity);

  // Trade satisfies some buyer's demand
  const newDemand = Math.max(0, currentDemand - quantity);

  return { newSupply, newDemand };
}

/**
 * Calculate money supply change from trade
 *
 * @param tradeValue - Value of the trade
 * @param isExport - True if this is an export (money flows in)
 * @returns Money supply change (positive = increase)
 */
export function calculateMoneySupplyChange(
  tradeValue: number,
  isExport: boolean
): number {
  // Exports bring money in, imports send money out
  return isExport ? tradeValue : -tradeValue;
}

// ============================================================================
// Anti-Monopoly Mechanics
// ============================================================================

/**
 * Calculate anti-monopoly tax for dominant market players
 *
 * When a world controls more than the threshold of global trade,
 * they pay an additional tax on trades.
 *
 * @param marketShare - World's share of global trade (0-1)
 * @param threshold - Threshold above which tax applies (default 0.4 = 40%)
 * @param maxTax - Maximum tax rate at 100% market share (default 0.1 = 10%)
 * @returns Additional tax rate to apply
 */
export function calculateAntiMonopolyTax(
  marketShare: number,
  threshold = 0.4,
  maxTax = 0.1
): number {
  if (marketShare <= threshold) return 0;

  // Linear increase from threshold to 100%
  const excessShare = marketShare - threshold;
  const maxExcess = 1 - threshold;
  const taxRate = (excessShare / maxExcess) * maxTax;

  return Math.min(maxTax, taxRate);
}

/**
 * Calculate market share for a world
 *
 * @param worldTrade - Total trade value for this world
 * @param globalTrade - Total trade value across all worlds
 * @returns Market share as decimal (0-1)
 */
export function calculateMarketShare(worldTrade: number, globalTrade: number): number {
  if (globalTrade <= 0) return 0;
  return Math.min(1, worldTrade / globalTrade);
}

// ============================================================================
// Trade Settlement Helpers
// ============================================================================

/**
 * Calculate the full cost of a trade including all fees
 *
 * @param basePrice - Base price per unit
 * @param quantity - Number of units
 * @param exchangeRate - Currency exchange rate
 * @param tradeFee - Trade fee rate
 * @param transportFee - Transport fee rate
 * @param antiMonopolyTax - Additional monopoly tax
 * @returns Total cost breakdown
 */
export function calculateTradeCost(
  basePrice: number,
  quantity: number,
  exchangeRate: number,
  tradeFee = ECONOMY_CONSTANTS.TRADE_FEE,
  transportFee = ECONOMY_CONSTANTS.TRANSPORT_FEE,
  antiMonopolyTax = 0
): TradeCostBreakdown {
  const subtotal = basePrice * quantity;
  const converted = subtotal * exchangeRate;
  const tradeFeeAmount = converted * tradeFee;
  const transportFeeAmount = converted * transportFee;
  const monopolyTaxAmount = converted * antiMonopolyTax;
  const totalFees = tradeFeeAmount + transportFeeAmount + monopolyTaxAmount;
  const total = converted + totalFees;

  return {
    subtotal,
    exchangeRate,
    converted,
    tradeFee: tradeFeeAmount,
    transportFee: transportFeeAmount,
    monopolyTax: monopolyTaxAmount,
    totalFees,
    total,
  };
}

export interface TradeCostBreakdown {
  subtotal: number;        // Base price * quantity
  exchangeRate: number;    // FX rate applied
  converted: number;       // After FX conversion
  tradeFee: number;        // Trade fee amount
  transportFee: number;    // Transport fee amount
  monopolyTax: number;     // Anti-monopoly tax amount
  totalFees: number;       // Sum of all fees
  total: number;           // Final amount to pay
}

/**
 * Update world trade balance after a trade
 *
 * @param currentBalance - Current trade balance
 * @param tradeValue - Value of this trade
 * @param isExport - True if world is exporting (selling)
 * @returns New trade balance
 */
export function updateTradeBalance(
  currentBalance: number,
  tradeValue: number,
  isExport: boolean
): number {
  return isExport ? currentBalance + tradeValue : currentBalance - tradeValue;
}

/**
 * Calculate world GDP contribution from a trade
 *
 * Exports add to GDP, imports subtract (simplified model)
 *
 * @param tradeValue - Value of the trade
 * @param isExport - True if world is exporting
 * @returns GDP change
 */
export function calculateGDPImpact(tradeValue: number, isExport: boolean): number {
  // Net exports (X - M) contribute to GDP
  // Simplified: exports add, imports subtract
  return isExport ? tradeValue : -tradeValue * 0.5;
}
