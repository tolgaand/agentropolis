/**
 * Honor Recovery Job
 *
 * Manages agent honor system (Metin2-style PK system):
 * - Passive honor regeneration (+1 per minute for agents below 100)
 * - Apply penalties for low honor (slower march, higher costs)
 * - Track honor status changes
 *
 * Runs every 60 seconds
 */

import { AgentModel } from '@agentropolis/db';
import { getHonorStatus, getHonorMultipliers, SOCKET_EVENTS, type HonorChangedEvent } from '@agentropolis/shared';
import { getIO } from '../socket';

/**
 * Run honor recovery tick
 * - Grant +1 honor to all agents with honor < 100
 * - Update honor status if changed
 */
export async function runHonorRecoveryTick(): Promise<void> {
  const now = new Date();

  try {
    // Find all agents with honor < 100
    const agents = await AgentModel.find({ honor: { $lt: 100 } });

    let updated = 0;

    for (const agent of agents) {
      const oldHonor = agent.honor;
      const oldStatus = getHonorStatus(oldHonor);

      // Regenerate +1 honor (capped at 100)
      agent.honor = Math.min(100, agent.honor + 1);

      const newStatus = getHonorStatus(agent.honor);

      // Status changed - emit socket event
      if (oldStatus !== newStatus) {
        const io = getIO();
        const event: HonorChangedEvent = {
          agentId: agent.id,
          agentName: agent.name,
          factionId: agent.factionId,
          oldHonor,
          newHonor: agent.honor,
          oldStatus,
          newStatus,
          timestamp: now.toISOString(),
        };
        io.to(`world:${agent.factionId}`).emit(SOCKET_EVENTS.HONOR_CHANGED as 'honor.changed', event);

        console.log(`[HonorJob] ${agent.name} honor status changed: ${oldStatus} -> ${newStatus} (${oldHonor} -> ${agent.honor})`);
      }

      await agent.save();
      updated++;
    }

    if (updated > 0) {
      console.log(`[HonorJob] Regenerated +1 honor for ${updated} agents`);
    }
  } catch (error) {
    console.error('[HonorJob] Error during honor recovery:', error);
  }
}

/**
 * Apply honor change to agent
 * Called from battle resolution, territory capture, etc.
 *
 * @param agentId Agent ID
 * @param delta Honor change amount (can be positive or negative)
 * @param reason Reason for honor change
 */
export async function applyHonorChange(
  agentId: string,
  delta: number,
  reason: string
): Promise<void> {
  try {
    const agent = await AgentModel.findById(agentId);
    if (!agent) {
      console.error(`[HonorJob] Agent not found: ${agentId}`);
      return;
    }

    const oldHonor = agent.honor;
    const oldStatus = getHonorStatus(oldHonor);

    // Apply honor change (clamped to 0-100)
    agent.honor = Math.max(0, Math.min(100, agent.honor + delta));

    const newStatus = getHonorStatus(agent.honor);
    const multipliers = getHonorMultipliers(agent.honor);

    await agent.save();

    // Emit socket event
    const io = getIO();
    const event: HonorChangedEvent = {
      agentId: agent.id,
      agentName: agent.name,
      factionId: agent.factionId,
      delta,
      oldHonor,
      newHonor: agent.honor,
      oldStatus,
      newStatus,
      reason,
      multipliers,
      timestamp: new Date().toISOString(),
    };
    io.to(`world:${agent.factionId}`).emit(SOCKET_EVENTS.HONOR_CHANGED as 'honor.changed', event);

    console.log(
      `[HonorJob] ${agent.name} honor changed: ${oldHonor} -> ${agent.honor} (${delta >= 0 ? '+' : ''}${delta}) - ${reason}`
    );

    // Log status change
    if (oldStatus !== newStatus) {
      console.log(`[HonorJob] ${agent.name} status changed: ${oldStatus} -> ${newStatus}`);
    }
  } catch (error) {
    console.error(`[HonorJob] Error applying honor change for agent ${agentId}:`, error);
  }
}
