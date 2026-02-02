/**
 * Army March Job
 * Runs every 3 seconds
 * - Updates march progress for all marching armies
 * - Emits progress events for client interpolation
 * - Handles arrivals (state transition to attacking/idle)
 * - Processes recalls (reverse march back to home)
 */

import { ArmyModel } from '@agentropolis/db';
import { getIO } from '../socket';
import { SOCKET_EVENTS } from '@agentropolis/shared';
import type { ArmyMarchProgressEvent, ArmyMarchArrivedEvent } from '@agentropolis/shared';

/**
 * Main army march tick - updates all marching armies
 */
export async function runArmyMarchTick(): Promise<void> {
  const now = new Date();

  try {
    // Process recalls first (change direction)
    await processRecalls(now);

    // Update marching armies and handle arrivals
    await updateMarchingArmies(now);
  } catch (error) {
    console.error('[ArmyMarchJob] Error:', error);
  }
}

/**
 * Update all marching armies' progress and handle arrivals
 */
async function updateMarchingArmies(now: Date): Promise<void> {
  const marchingArmies = await ArmyModel.find({
    state: { $in: ['marching', 'returning'] },
  });

  if (marchingArmies.length === 0) {
    return;
  }

  const io = getIO();
  const progressUpdates: ArmyMarchProgressEvent[] = [];
  const arrivals: ArmyMarchArrivedEvent[] = [];

  for (const army of marchingArmies) {
    if (!army.departedAt || !army.estimatedArrival || !army.target) continue;

    // Calculate progress
    const totalDuration = army.estimatedArrival.getTime() - army.departedAt.getTime();
    const elapsed = now.getTime() - army.departedAt.getTime();
    const progress = Math.min(1.0, Math.max(0, elapsed / totalDuration));

    const prevProgress = army.marchProgress ?? 0;

    // Check if arrived
    if (progress >= 1.0) {
      // Army has arrived
      army.position = { x: army.target.x, y: army.target.y };
      army.marchProgress = 1.0;

      // Determine next state
      if (army.state === 'returning') {
        // Returned home - army is now idle and city is no longer defenseless
        army.state = 'idle';
        army.isHomeCityDefenseless = false;
        // Reset optional march fields (use $unset in Mongoose)
        army.set('target', undefined);
        army.set('marchStartPosition', undefined);
        army.departedAt = undefined;
        army.estimatedArrival = undefined;
        army.marchProgress = 0;
      } else {
        // Arrived at target - transition to attacking state
        army.state = 'attacking';
        army.marchProgress = 0;
        army.set('marchStartPosition', undefined);
      }

      army.recallRequested = false;
      await army.save();

      // Emit arrival event
      arrivals.push({
        armyId: army.id,
        ownerId: army.ownerId,
        factionId: army.factionId,
        position: { x: army.position.x, y: army.position.y },
        arrivedAt: now.toISOString(),
        nextState: army.state === 'idle' ? 'idle' : 'attacking',
      });

      console.log(`[ArmyMarchJob] Army ${army.id} arrived at (${army.position.x}, ${army.position.y}), state: ${army.state}`);
    } else {
      // Still marching - update progress
      army.marchProgress = progress;
      await army.save();

      // Calculate interpolated position (for reference)
      const startX = army.marchStartPosition?.x ?? army.position.x;
      const startY = army.marchStartPosition?.y ?? army.position.y;
      const targetX = army.target.x;
      const targetY = army.target.y;

      const currentX = Math.round(startX + (targetX - startX) * progress);
      const currentY = Math.round(startY + (targetY - startY) * progress);

      // Only emit if progress changed significantly (> 1%)
      if (Math.floor(progress * 100) !== Math.floor(prevProgress * 100)) {
        progressUpdates.push({
          armyId: army.id,
          currentPosition: { x: currentX, y: currentY },
          progress,
          remainingSeconds: Math.max(0, (totalDuration - elapsed) / 1000),
        });
      }
    }
  }

  // Emit batch progress updates
  if (progressUpdates.length > 0) {
    for (const update of progressUpdates) {
      io.to('game:map').emit(
        SOCKET_EVENTS.ARMY_MARCH_PROGRESS as 'army.march.progress',
        update
      );
    }
    console.log(`[ArmyMarchJob] Emitted ${progressUpdates.length} march progress updates`);
  }

  // Emit arrivals
  if (arrivals.length > 0) {
    for (const arrival of arrivals) {
      io.to('game:map').emit(
        SOCKET_EVENTS.ARMY_MARCH_ARRIVED as 'army.march.arrived',
        arrival
      );
    }
    console.log(`[ArmyMarchJob] Emitted ${arrivals.length} arrival events`);
  }
}

/**
 * Process recall requests - reverse army march back to home
 */
async function processRecalls(now: Date): Promise<void> {
  const recalledArmies = await ArmyModel.find({
    state: 'marching',
    recallRequested: true,
  });

  if (recalledArmies.length === 0) {
    return;
  }

  const io = getIO();

  for (const army of recalledArmies) {
    if (!army.homePosition || !army.marchStartPosition || !army.target) continue;

    // Calculate current interpolated position
    const progress = army.marchProgress ?? 0;
    const startX = army.marchStartPosition.x;
    const startY = army.marchStartPosition.y;
    const targetX = army.target.x;
    const targetY = army.target.y;

    const currentX = Math.round(startX + (targetX - startX) * progress);
    const currentY = Math.round(startY + (targetY - startY) * progress);

    // Calculate return distance and time
    const homeX = army.homePosition.x;
    const homeY = army.homePosition.y;
    const returnDistance = Math.abs(homeX - currentX) + Math.abs(homeY - currentY);

    // Use army's march speed (or calculate if not set)
    let speed = army.marchSpeed;
    if (!speed || speed === 0) {
      const totalUnits = army.units.infantry + army.units.cavalry + army.units.siege;
      if (totalUnits === 0) continue;

      // Simplified speed calculation (tiles per hour)
      speed = 3; // Default speed
    }

    const returnHours = Math.max(1, returnDistance / speed);
    const returnETA = new Date(now.getTime() + returnHours * 60 * 60 * 1000);

    // Reverse the army
    army.state = 'returning';
    army.target = { x: homeX, y: homeY };
    army.marchStartPosition = { x: currentX, y: currentY };
    army.estimatedArrival = returnETA;
    army.marchProgress = 0;
    army.recallRequested = false;
    army.departedAt = now;

    await army.save();

    // Emit recall event
    io.to('game:map').emit(
      SOCKET_EVENTS.ARMY_MARCH_RECALLED as 'army.march.recalled',
      {
        armyId: army.id,
        recalledAt: now.toISOString(),
        returnETA: returnETA.toISOString(),
        currentPosition: { x: currentX, y: currentY },
      }
    );

    console.log(`[ArmyMarchJob] Army ${army.id} recalled, returning to (${homeX}, ${homeY})`);
  }

  if (recalledArmies.length > 0) {
    console.log(`[ArmyMarchJob] Processed ${recalledArmies.length} recall requests`);
  }
}
