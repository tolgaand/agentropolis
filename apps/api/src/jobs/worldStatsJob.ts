/**
 * World Stats Job
 *
 * Calculates world stats from REAL data:
 * - Population = actual agent count in database
 * - GDP = cumulative trade volume
 * - Prosperity = based on trade balance ratio
 *
 * NO FAKE GROWTH - only real activity changes values.
 */

import { WorldModel, AgentModel } from '@agentropolis/db';
import type { WorldId, WorldUpdate, WorldUpdateBatch } from '@agentropolis/shared';
import { broadcastWorldUpdateBatch } from '../socket';

const JOB_NAME = '[WorldStatsJob]';

/**
 * Calculate world stats from real database activity
 */
export async function runWorldStatsJob(): Promise<void> {
  try {
    const worlds = await WorldModel.find();
    const updates: WorldUpdate[] = [];

    for (const world of worlds) {
      const worldId = world.id as WorldId;
      let changed = false;

      // Population = actual agent count in this world
      const agentCount = await AgentModel.countDocuments({ worldId });
      if (agentCount !== world.population) {
        world.population = agentCount;
        changed = true;
      }

      // GDP = sum of all trade values (exports + imports)
      // This is cumulative trade volume
      const newGdp = world.totalExports + world.totalImports;
      if (newGdp !== world.gdp) {
        world.gdp = newGdp;
        changed = true;
      }

      // GDP per capita
      if (world.population > 0) {
        const newGdpPerCapita = Math.round(world.gdp / world.population);
        if (newGdpPerCapita !== world.gdpPerCapita) {
          world.gdpPerCapita = newGdpPerCapita;
          changed = true;
        }
      }

      // Trade balance = exports - imports
      const newTradeBalance = world.totalExports - world.totalImports;
      if (newTradeBalance !== world.tradeBalance) {
        world.tradeBalance = newTradeBalance;
        changed = true;
      }

      // Prosperity index based on:
      // - Trade balance ratio (positive = good)
      // - Agent activity (more agents = more stable)
      // Base 50, range 0-100
      let newProsperity = 50;
      if (world.gdp > 0) {
        const tradeRatio = world.tradeBalance / Math.max(1, world.gdp);
        newProsperity = Math.min(100, Math.max(0, 50 + (tradeRatio * 50) + (world.population * 0.5)));
      }
      newProsperity = Math.round(newProsperity * 100) / 100;
      if (Math.abs(newProsperity - world.prosperityIndex) > 0.01) {
        world.prosperityIndex = newProsperity;
        changed = true;
      }

      if (changed) {
        world.lastTickAt = new Date();
        await world.save();

        updates.push({
          worldId,
          gdp: world.gdp,
          population: world.population,
          prosperityIndex: world.prosperityIndex,
          tradeBalance: world.tradeBalance,
          totalExports: world.totalExports,
          totalImports: world.totalImports,
        });
      }
    }

    if (updates.length > 0) {
      const batch: WorldUpdateBatch = { updates };
      broadcastWorldUpdateBatch(batch);
      console.log(`${JOB_NAME} Synced ${updates.length} worlds from real data`);
    }
  } catch (error) {
    console.error(`${JOB_NAME} Error:`, error);
  }
}
