/**
 * Resource Production Job
 *
 * Runs every 10 seconds (1 production tick)
 * - Calculates production from all buildings
 * - Applies fertility multipliers
 * - Applies diminishing returns for same building types
 * - Updates agent inventories
 * - Updates world aggregate stats
 * - Broadcasts production events via Socket.io
 */

import { AgentModel, BuildingModel, WorldModel } from '@agentropolis/db';
import type { WorldId, ProductionTick } from '@agentropolis/shared';
import { BUILDING_YIELDS, FERTILITY_MULTIPLIER, diminishingReturn, SOCKET_EVENTS } from '@agentropolis/shared';
import { getIO } from '../socket';
import { safeSet } from '../redis';

const JOB_NAME = '[ResourceProductionJob]';

/**
 * Run a single production tick
 * Calculates and applies resource production for all agents
 */
export async function runProductionTick(): Promise<void> {
  const startTime = Date.now();

  try {
    // Get all agents with world assignments
    const agents = await AgentModel.find({ worldId: { $exists: true } }).lean();

    if (agents.length === 0) {
      // No agents yet, skip production
      return;
    }

    console.log(`${JOB_NAME} Processing production for ${agents.length} agents...`);

    let totalUpdated = 0;
    const worldAggregates: Map<WorldId, Map<string, number>> = new Map();
    const globalProduction: Map<string, number> = new Map();

    // Process each agent's production
    for (const agent of agents) {
      const agentId = agent._id.toString();
      const worldId = agent.worldId as WorldId;

      // Get all buildings for this agent
      const buildings = await BuildingModel.find({ ownerId: agent._id }).lean();

      if (buildings.length === 0) {
        // No buildings, no production
        continue;
      }

      // Get parcel DNA for fertility
      const fertilityStars = agent.parcelDNA?.fs ?? 3;
      const fertilityMult = FERTILITY_MULTIPLIER[fertilityStars] ?? 1.0;

      // Track building type counts for diminishing returns
      const typeCounts: Record<string, number> = {};
      const production: Record<string, number> = {};

      // Calculate production from each building
      for (const building of buildings) {
        const type = building.type;
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        const yields = BUILDING_YIELDS[type];
        if (!yields || Object.keys(yields).length === 0) {
          // This building type doesn't produce anything
          continue;
        }

        // Apply yields with diminishing returns and fertility multiplier
        for (const [resource, baseAmount] of Object.entries(yields)) {
          if (baseAmount === undefined) continue;

          const diminishedAmount = diminishingReturn(baseAmount, typeCounts[type]);
          const finalAmount = diminishedAmount * fertilityMult;

          production[resource] = (production[resource] || 0) + finalAmount;
        }
      }

      // Update agent inventory if there was any production
      if (Object.keys(production).length > 0) {
        const updateFields: Record<string, number> = {};
        for (const [resource, amount] of Object.entries(production)) {
          updateFields[`inventory.${resource}`] = amount;
        }

        await AgentModel.updateOne(
          { _id: agent._id },
          { $inc: updateFields }
        );

        totalUpdated++;

        // Aggregate for world totals
        if (!worldAggregates.has(worldId)) {
          worldAggregates.set(worldId, new Map());
        }
        const worldProd = worldAggregates.get(worldId)!;
        for (const [resource, amount] of Object.entries(production)) {
          worldProd.set(resource, (worldProd.get(resource) || 0) + amount);
          // Aggregate global production for price calculation
          globalProduction.set(resource, (globalProduction.get(resource) || 0) + amount);
        }

        // Broadcast production event to world room
        broadcastProductionTick(agentId, worldId, production);
      }
    }

    // Update world aggregate stats
    await updateWorldProduction(worldAggregates);

    // Store global production data in Redis for price calculation
    await storeProductionSupply(globalProduction);

    const elapsed = Date.now() - startTime;
    console.log(`${JOB_NAME} Completed in ${elapsed}ms - updated ${totalUpdated}/${agents.length} agents`);

  } catch (error) {
    console.error(`${JOB_NAME} Error:`, error);
  }
}

/**
 * Update world production rates and inventory from aggregated agent production
 */
async function updateWorldProduction(
  worldAggregates: Map<WorldId, Map<string, number>>
): Promise<void> {
  for (const [worldId, production] of worldAggregates) {
    const updateFields: Record<string, number> = {};

    // Update both production rates AND inventory
    for (const [resource, amount] of production) {
      // Production rate = amount per tick
      updateFields[`productionRates.${resource}`] = amount;
      // Also increment world inventory
      updateFields[`inventory.${resource}`] = amount;
    }

    // Apply updates (rates are set, inventory is incremented)
    await WorldModel.updateOne(
      { _id: worldId },
      {
        $set: Object.fromEntries(
          Object.entries(updateFields).filter(([k]) => k.startsWith('productionRates.'))
        ),
        $inc: Object.fromEntries(
          Object.entries(updateFields).filter(([k]) => k.startsWith('inventory.'))
        ),
      }
    );
  }
}

/**
 * Store global production supply data in Redis for price calculation
 * TTL of 120 seconds ensures stale data expires if production stops
 */
async function storeProductionSupply(
  globalProduction: Map<string, number>
): Promise<void> {
  if (globalProduction.size === 0) return;

  const TTL_SECONDS = 120;

  for (const [resourceId, amount] of globalProduction) {
    const key = `resource:supply:${resourceId}`;
    await safeSet(key, amount.toString(), TTL_SECONDS);
  }

  console.log(`${JOB_NAME} Stored production supply for ${globalProduction.size} resources in Redis`);
}

/**
 * Broadcast production tick event to world room AND game:map room
 */
function broadcastProductionTick(
  agentId: string,
  worldId: WorldId,
  production: Record<string, number>
): void {
  const io = getIO();
  if (!io) return;

  // Get the agent's current inventory and parcel info (after update)
  AgentModel.findById(agentId)
    .lean()
    .then(agent => {
      if (!agent) return;

      // When using lean(), Maps are returned as plain objects
      const inventory = agent.inventory as Record<string, number> | undefined;
      const totalInventory = inventory || {};

      // Get parcel position for floating text
      const mapService = require('../game/map/state').mapState;
      const parcels = mapService.getParcelsForAgent(agentId);
      const firstParcel = parcels[0];

      const event: ProductionTick = {
        agentId,
        agentName: agent.name,
        worldId,
        parcelId: firstParcel?.id,
        blockX: firstParcel?.blockX,
        blockY: firstParcel?.blockY,
        production,
        totalInventory,
      };

      // Broadcast to world room AND game:map room (spectators join game:map)
      io.to(`world:${worldId}`).emit(SOCKET_EVENTS.PRODUCTION_TICK as 'production.tick', event);
      io.to('game:map').emit(SOCKET_EVENTS.PRODUCTION_TICK as 'production.tick', event);
    })
    .catch(err => {
      console.error(`${JOB_NAME} Error fetching agent inventory for broadcast:`, err);
    });
}
