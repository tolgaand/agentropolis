/**
 * Economy Engine
 *
 * Re-exports all economy functions from the shared package.
 * This allows the API to use these functions while the core logic
 * lives in the shared package (accessible by both API and Jobs).
 */

export {
  // Price functions
  updatePrice,
  calculateLocalPrice,
  calculateDemandBias,
  calculateSupplyBias,
  applyInflation,

  // Inflation functions
  calculateInflation,

  // Exchange rate functions
  calculateExchangeRate,
  calculateDemandFactor,

  // Arbitrage functions
  calculateArbitrageProfit,
  hasArbitrageOpportunity,
  findBestArbitrage,

  // Economy state functions
  calculateCPI,
  calculateGDPGrowth,
  calculateProsperity,

  // Trade impact functions
  calculateTradeImpact,
  calculateMoneySupplyChange,

  // Anti-monopoly functions
  calculateAntiMonopolyTax,
  calculateMarketShare,

  // Trade settlement functions
  calculateTradeCost,
  updateTradeBalance,
  calculateGDPImpact,

  // Constants
  ECONOMY_CONSTANTS,

  // Types
  type ArbitrageOpportunity,
  type TradeCostBreakdown,
} from '@agentropolis/shared';
