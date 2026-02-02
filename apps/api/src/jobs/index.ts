/**
 * Background Jobs Runner
 *
 * Runs periodic economy simulation jobs:
 * - World stats updates (GDP, population, prosperity)
 * - Market price fluctuations
 * - Resource production
 * - Battle processing
 * - Army march progress
 * - Honor recovery (Metin2-style PK system)
 *
 * Jobs run every 3-60 seconds for visible live updates.
 */

import { runWorldStatsJob } from './worldStatsJob';
import { runMarketPriceJob } from './marketPriceJob';
import { runProductionTick } from './resourceProductionJob';
import { runSeedJobs } from './seedData';
import { runBattleTick } from './battleJob';
import { runArmyMarchTick } from './armyMarchJob';
import { runHonorRecoveryTick } from './honorJob';

// Job intervals in milliseconds
const WORLD_STATS_INTERVAL = 5000;      // 5 seconds
const MARKET_PRICE_INTERVAL = 3000;     // 3 seconds
const PRODUCTION_TICK_INTERVAL = 10000; // 10 seconds
const BATTLE_TICK_INTERVAL = 3000;      // 3 seconds
const ARMY_MARCH_INTERVAL = 3000;       // 3 seconds
const HONOR_RECOVERY_INTERVAL = 60000;  // 60 seconds

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

  // Resource Production Job - calculates building yields and updates inventories
  const productionInterval = setInterval(async () => {
    try {
      await runProductionTick();
    } catch (error) {
      console.error('[Jobs] ResourceProduction job error:', error);
    }
  }, PRODUCTION_TICK_INTERVAL);
  intervals.push(productionInterval);
  console.log(`[Jobs] ResourceProductionJob started (interval: ${PRODUCTION_TICK_INTERVAL}ms)`);

  // Battle Job - processes army movement and active battles
  const battleInterval = setInterval(async () => {
    try {
      await runBattleTick();
    } catch (error) {
      console.error('[Jobs] Battle job error:', error);
    }
  }, BATTLE_TICK_INTERVAL);
  intervals.push(battleInterval);
  console.log(`[Jobs] BattleJob started (interval: ${BATTLE_TICK_INTERVAL}ms)`);

  // Army March Job - updates march progress and handles arrivals
  const armyMarchInterval = setInterval(async () => {
    try {
      await runArmyMarchTick();
    } catch (error) {
      console.error('[Jobs] ArmyMarch job error:', error);
    }
  }, ARMY_MARCH_INTERVAL);
  intervals.push(armyMarchInterval);
  console.log(`[Jobs] ArmyMarchJob started (interval: ${ARMY_MARCH_INTERVAL}ms)`);

  // Honor Recovery Job - passive honor regeneration
  const honorRecoveryInterval = setInterval(async () => {
    try {
      await runHonorRecoveryTick();
    } catch (error) {
      console.error('[Jobs] HonorRecovery job error:', error);
    }
  }, HONOR_RECOVERY_INTERVAL);
  intervals.push(honorRecoveryInterval);
  console.log(`[Jobs] HonorRecoveryJob started (interval: ${HONOR_RECOVERY_INTERVAL}ms)`);

  // Run initial jobs immediately (with staggered timing to avoid DB contention)
  setTimeout(() => runWorldStatsJob().catch(console.error), 100);
  setTimeout(() => runMarketPriceJob().catch(console.error), 200);
  setTimeout(() => runProductionTick().catch(console.error), 300);
  setTimeout(() => runBattleTick().catch(console.error), 400);
  setTimeout(() => runArmyMarchTick().catch(console.error), 500);
  setTimeout(() => runHonorRecoveryTick().catch(console.error), 600);

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
export { runMarketPriceJob } from './marketPriceJob';
export { runProductionTick } from './resourceProductionJob';
export { runBattleTick } from './battleJob';
export { runArmyMarchTick } from './armyMarchJob';
export { runHonorRecoveryTick, applyHonorChange } from './honorJob';
