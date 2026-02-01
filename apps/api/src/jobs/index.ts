/**
 * Background Jobs Runner
 *
 * Runs periodic economy simulation jobs:
 * - World stats updates (GDP, population, prosperity)
 * - Exchange rate volatility
 * - Market price fluctuations
 *
 * Jobs run every 3-5 seconds for visible live updates.
 */

import { runWorldStatsJob } from './worldStatsJob';
import { runExchangeRateJob } from './exchangeRateJob';
import { runMarketPriceJob } from './marketPriceJob';
import { runSeedJobs } from './seedData';

// Job intervals in milliseconds
const WORLD_STATS_INTERVAL = 5000;      // 5 seconds
const EXCHANGE_RATE_INTERVAL = 4000;    // 4 seconds
const MARKET_PRICE_INTERVAL = 3000;     // 3 seconds

// Store interval IDs for cleanup
const intervals: NodeJS.Timeout[] = [];

/**
 * Start all background jobs
 * Should be called after socket initialization
 */
export async function startJobs(): Promise<void> {
  console.log('[Jobs] Starting background economy jobs...');

  // Run seed jobs first to ensure data is up-to-date
  try {
    await runSeedJobs();
    console.log('[Jobs] Seed jobs completed');
  } catch (error) {
    console.error('[Jobs] Seed jobs error:', error);
  }

  // World Stats Job - updates GDP, population, prosperity
  const worldStatsInterval = setInterval(async () => {
    try {
      await runWorldStatsJob();
    } catch (error) {
      console.error('[Jobs] WorldStats job error:', error);
    }
  }, WORLD_STATS_INTERVAL);
  intervals.push(worldStatsInterval);
  console.log(`[Jobs] WorldStatsJob started (interval: ${WORLD_STATS_INTERVAL}ms)`);

  // Exchange Rate Job - applies volatility to currency rates
  const exchangeRateInterval = setInterval(async () => {
    try {
      await runExchangeRateJob();
    } catch (error) {
      console.error('[Jobs] ExchangeRate job error:', error);
    }
  }, EXCHANGE_RATE_INTERVAL);
  intervals.push(exchangeRateInterval);
  console.log(`[Jobs] ExchangeRateJob started (interval: ${EXCHANGE_RATE_INTERVAL}ms)`);

  // Market Price Job - updates resource prices
  const marketPriceInterval = setInterval(async () => {
    try {
      await runMarketPriceJob();
    } catch (error) {
      console.error('[Jobs] MarketPrice job error:', error);
    }
  }, MARKET_PRICE_INTERVAL);
  intervals.push(marketPriceInterval);
  console.log(`[Jobs] MarketPriceJob started (interval: ${MARKET_PRICE_INTERVAL}ms)`);

  // Run initial jobs immediately (with staggered timing to avoid DB contention)
  setTimeout(() => runWorldStatsJob().catch(console.error), 100);
  setTimeout(() => runExchangeRateJob().catch(console.error), 200);
  setTimeout(() => runMarketPriceJob().catch(console.error), 300);

  console.log('[Jobs] All background jobs started successfully');
}

/**
 * Stop all background jobs
 * Call this during graceful shutdown
 */
export function stopJobs(): void {
  console.log('[Jobs] Stopping background jobs...');
  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals.length = 0;
  console.log('[Jobs] All background jobs stopped');
}

// Export individual job functions for testing
export { runWorldStatsJob } from './worldStatsJob';
export { runExchangeRateJob } from './exchangeRateJob';
export { runMarketPriceJob } from './marketPriceJob';
