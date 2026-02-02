import type { ArmyDocument } from '@agentropolis/db';
import { AgentModel, ArmyModel } from '@agentropolis/db';
import { SOCKET_EVENTS, type BattleEvent, type BattleResolvedEvent, type BattleTickEvent, type TerritoryCapturedEvent, type WorldId } from '@agentropolis/shared';
import type { TerrainType, ArmyUnit } from '@agentropolis/shared';
import { UNIT_STATS } from '@agentropolis/shared';
import { getIO } from '../socket';
import { mapState } from '../game/map/state';
import { resolveBattle } from '../game/battle/resolveBattle';
import { applyHonorChange } from './honorJob';

interface ActiveBattle {
  battleId: string;
  attackerArmyId: string;
  defenderArmyId: string;
  attackerId: string;
  defenderId: string;
  attackerName: string;
  defenderName: string;
  attackerWorldId: WorldId;
  defenderWorldId: WorldId;
  position: { x: number; y: number };
  terrain: TerrainType;
  round: number;
  maxRounds: number;
  attackerUnits: ArmyUnit;
  defenderUnits: ArmyUnit;
}

const activeBattles = new Map<string, ActiveBattle>();

// Capture timer duration in milliseconds (90 seconds)
const CAPTURE_DURATION_MS = 90000;

function sumUnits(units: ArmyUnit): number {
  return units.infantry + units.archer + units.cavalry + units.siege;
}

function getUnits(army: ArmyDocument): ArmyUnit {
  const raw = army.units as unknown as Partial<ArmyUnit>;
  return {
    infantry: raw.infantry ?? 0,
    archer: raw.archer ?? 0,
    cavalry: raw.cavalry ?? 0,
    siege: raw.siege ?? 0,
  };
}

function applyUnits(army: ArmyDocument, units: ArmyUnit): void {
  (army.units as unknown as Record<string, number>).infantry = units.infantry;
  (army.units as unknown as Record<string, number>).archer = units.archer;
  (army.units as unknown as Record<string, number>).cavalry = units.cavalry;
  (army.units as unknown as Record<string, number>).siege = units.siege;
  army.totalAttack =
    units.infantry * UNIT_STATS.infantry.attack +
    units.archer * UNIT_STATS.archer.attack +
    units.cavalry * UNIT_STATS.cavalry.attack +
    units.siege * UNIT_STATS.siege.attack;
  army.totalDefense =
    units.infantry * UNIT_STATS.infantry.defense +
    units.archer * UNIT_STATS.archer.defense +
    units.cavalry * UNIT_STATS.cavalry.defense +
    units.siege * UNIT_STATS.siege.defense;
}

function emitBattleStarted(battle: ActiveBattle): void {
  const io = getIO();
  const payload: BattleEvent = {
    battleId: battle.battleId,
    attackerId: battle.attackerId,
    attackerName: battle.attackerName,
    attackerWorldId: battle.attackerWorldId,
    defenderId: battle.defenderId,
    defenderName: battle.defenderName,
    defenderWorldId: battle.defenderWorldId,
    status: 'active',
    attackerArmy: sumUnits(battle.attackerUnits),
    defenderArmy: sumUnits(battle.defenderUnits),
  };
  io.to('multiverse').emit(SOCKET_EVENTS.BATTLE_STARTED as 'battle.started', payload);
  io.to('game:map').emit(SOCKET_EVENTS.BATTLE_STARTED as 'battle.started', payload);
  io.to(`world:${battle.attackerWorldId}`).emit(SOCKET_EVENTS.BATTLE_STARTED as 'battle.started', payload);
  io.to(`world:${battle.defenderWorldId}`).emit(SOCKET_EVENTS.BATTLE_STARTED as 'battle.started', payload);
}

function emitBattleTick(battle: ActiveBattle): void {
  const io = getIO();
  const payload: BattleTickEvent = {
    battleId: battle.battleId,
    round: battle.round,
    attackerRemaining: sumUnits(battle.attackerUnits),
    defenderRemaining: sumUnits(battle.defenderUnits),
    status: 'active',
    event: 'round',
  };
  io.to('multiverse').emit(SOCKET_EVENTS.BATTLE_TICK as 'battle.tick', payload);
  io.to('game:map').emit(SOCKET_EVENTS.BATTLE_TICK as 'battle.tick', payload);
  io.to(`world:${battle.attackerWorldId}`).emit(SOCKET_EVENTS.BATTLE_TICK as 'battle.tick', payload);
  io.to(`world:${battle.defenderWorldId}`).emit(SOCKET_EVENTS.BATTLE_TICK as 'battle.tick', payload);
}

function emitBattleResolved(battle: ActiveBattle, result: BattleResolvedEvent): void {
  const io = getIO();
  io.to('multiverse').emit(SOCKET_EVENTS.BATTLE_RESOLVED as 'battle.resolved', result);
  io.to('game:map').emit(SOCKET_EVENTS.BATTLE_RESOLVED as 'battle.resolved', result);
  io.to(`world:${battle.attackerWorldId}`).emit(SOCKET_EVENTS.BATTLE_RESOLVED as 'battle.resolved', result);
  io.to(`world:${battle.defenderWorldId}`).emit(SOCKET_EVENTS.BATTLE_RESOLVED as 'battle.resolved', result);
}

async function processArrivals(): Promise<void> {
  const now = new Date();
  const arrivals = await ArmyModel.find({
    state: 'marching',
    estimatedArrival: { $lte: now },
  });

  for (const army of arrivals) {
    if (!army.target) continue;
    army.position = { x: army.target.x, y: army.target.y };
    army.state = 'attacking';
    army.target = undefined;
    army.estimatedArrival = undefined;
    await army.save();

    const defender = await ArmyModel.findOne({
      'position.x': army.position.x,
      'position.y': army.position.y,
      state: { $in: ['idle', 'attacking'] },
      factionId: { $ne: army.factionId },
    });

    if (!defender) {
      army.state = 'idle';
      await army.save();
      continue;
    }

    const existing = Array.from(activeBattles.values()).find(
      b => b.attackerArmyId === army.id || b.defenderArmyId === army.id
    );
    if (existing) continue;

    const [attackerAgent, defenderAgent] = await Promise.all([
      AgentModel.findById(army.ownerId),
      AgentModel.findById(defender.ownerId),
    ]);

    const parcel = mapState.getParcelByBlock(army.position.x, army.position.y);
    const terrain = (parcel?.terrain ?? 'plains') as TerrainType;

    const battleId = `battle_${army.id}_${defender.id}_${Date.now()}`;
    const battle: ActiveBattle = {
      battleId,
      attackerArmyId: army.id,
      defenderArmyId: defender.id,
      attackerId: army.ownerId,
      defenderId: defender.ownerId,
      attackerName: attackerAgent?.name || 'Unknown',
      defenderName: defenderAgent?.name || 'Unknown',
      attackerWorldId: army.factionId as WorldId,
      defenderWorldId: defender.factionId as WorldId,
      position: { x: army.position.x, y: army.position.y },
      terrain,
      round: 0,
      maxRounds: 4,
      attackerUnits: getUnits(army),
      defenderUnits: getUnits(defender),
    };

    activeBattles.set(battleId, battle);
    emitBattleStarted(battle);
  }
}

async function processActiveBattles(): Promise<void> {
  for (const battle of activeBattles.values()) {
    battle.round += 1;

    const attackerShadow = { units: battle.attackerUnits } as unknown as ArmyDocument;
    const defenderShadow = { units: battle.defenderUnits } as unknown as ArmyDocument;
    const result = resolveBattle(attackerShadow, defenderShadow, battle.terrain, {
      battleId: `${battle.battleId}:${battle.round}`,
      defenderHomeBonus: 1.1,
      rounds: 1,
    });

    battle.attackerUnits = result.attackerRemaining;
    battle.defenderUnits = result.defenderRemaining;

    const attackerRemaining = sumUnits(battle.attackerUnits);
    const defenderRemaining = sumUnits(battle.defenderUnits);

    console.log(`[BattleJob] Round ${battle.round}/${battle.maxRounds}: ${battle.attackerName}(${attackerRemaining}) vs ${battle.defenderName}(${defenderRemaining})`);

    emitBattleTick(battle);

    const resolved = battle.round >= battle.maxRounds || attackerRemaining === 0 || defenderRemaining === 0;

    if (!resolved) continue;

    const attackerArmy = await ArmyModel.findById(battle.attackerArmyId);
    const defenderArmy = await ArmyModel.findById(battle.defenderArmyId);
    if (!attackerArmy || !defenderArmy) {
      activeBattles.delete(battle.battleId);
      continue;
    }

    const attackerBefore = getUnits(attackerArmy);
    const defenderBefore = getUnits(defenderArmy);

    applyUnits(attackerArmy, battle.attackerUnits);
    applyUnits(defenderArmy, battle.defenderUnits);

    // Disband armies with 0 units, set survivors to idle
    if (sumUnits(battle.attackerUnits) === 0) {
      attackerArmy.state = 'disbanded';
    } else {
      attackerArmy.state = 'idle';
    }
    if (sumUnits(battle.defenderUnits) === 0) {
      defenderArmy.state = 'disbanded';
    } else {
      defenderArmy.state = 'idle';
    }

    await Promise.all([attackerArmy.save(), defenderArmy.save()]);

    const attackerLosses = {
      infantry: Math.max(0, attackerBefore.infantry - battle.attackerUnits.infantry),
      archer: Math.max(0, attackerBefore.archer - battle.attackerUnits.archer),
      cavalry: Math.max(0, attackerBefore.cavalry - battle.attackerUnits.cavalry),
      siege: Math.max(0, attackerBefore.siege - battle.attackerUnits.siege),
    };

    const defenderLosses = {
      infantry: Math.max(0, defenderBefore.infantry - battle.defenderUnits.infantry),
      archer: Math.max(0, defenderBefore.archer - battle.defenderUnits.archer),
      cavalry: Math.max(0, defenderBefore.cavalry - battle.defenderUnits.cavalry),
      siege: Math.max(0, defenderBefore.siege - battle.defenderUnits.siege),
    };

    const attackerLossesTotal = sumUnits(attackerLosses);
    const defenderLossesTotal = sumUnits(defenderLosses);

    const resolvedEvent: BattleResolvedEvent = {
      battleId: battle.battleId,
      attackerId: battle.attackerId,
      attackerName: battle.attackerName,
      attackerWorldId: battle.attackerWorldId,
      defenderId: battle.defenderId,
      defenderName: battle.defenderName,
      defenderWorldId: battle.defenderWorldId,
      victor: result.victor,
      lootGold: 0,
      lootResources: {},
      attackerLosses: attackerLossesTotal,
      defenderLosses: defenderLossesTotal,
      resolvedAt: new Date().toISOString(),
    };

    emitBattleResolved(battle, resolvedEvent);
    activeBattles.delete(battle.battleId);

    // Apply honor changes based on battle outcome
    await applyBattleHonor(battle, result.victor);

    // Start capture if attacker won
    if (result.victor === 'attacker') {
      startCaptureIfEligible(battle);
    }
  }
}

/**
 * Start capture process if position has a parcel and attacker won
 */
function startCaptureIfEligible(battle: ActiveBattle): void {
  const parcel = mapState.getParcelByBlock(battle.position.x, battle.position.y);
  if (!parcel) {
    console.log(`[BattleJob] No parcel at position (${battle.position.x},${battle.position.y}) - no capture`);
    return;
  }

  // Don't capture if already owned by attacker
  if (parcel.worldId === battle.attackerWorldId) {
    console.log(`[BattleJob] Parcel already owned by attacker ${battle.attackerWorldId} - no capture needed`);
    return;
  }

  // Set parcel as contested
  const success = mapState.setParcelContested(
    battle.position.x,
    battle.position.y,
    battle.attackerWorldId,
    battle.attackerId
  );

  if (success) {
    // Emit contested event
    const io = getIO();
    io.to('game:map').emit('city_event', {
      type: 'parcel_contested' as const,
      timestamp: new Date().toISOString(),
      payload: {
        blockX: battle.position.x,
        blockY: battle.position.y,
        claimingWorldId: battle.attackerWorldId,
        originalWorldId: parcel.worldId,
        captureProgress: 0,
      },
      scope: 'global' as const,
      parcelId: parcel.id,
    });

    console.log(`[BattleJob] Started capture of parcel (${battle.position.x},${battle.position.y}) by ${battle.attackerWorldId}`);
  }
}

/**
 * Process capture timers - finalize captures that have completed
 * Called on each battle tick
 */
async function processCaptureTimers(): Promise<void> {
  const contestedParcels = mapState.getAllContestedParcels();
  const now = new Date();

  for (const contested of contestedParcels) {
    const elapsed = now.getTime() - contested.contestedSince.getTime();
    const progress = Math.min(100, (elapsed / CAPTURE_DURATION_MS) * 100);

    // Check if defender has returned
    const defenderArmy = await ArmyModel.findOne({
      'position.x': contested.blockX,
      'position.y': contested.blockY,
      factionId: contested.originalWorldId,
      state: { $in: ['idle', 'attacking'] },
    });

    if (defenderArmy) {
      // Defender returned - cancel capture
      mapState.clearParcelContested(contested.blockX, contested.blockY);
      const io = getIO();
      io.to('game:map').emit('city_event', {
        type: 'parcel_updated' as const,
        timestamp: new Date().toISOString(),
        payload: {
          parcelId: `parcel_${contested.originalAgentId}`,
          changes: {
            legacyMessage: 'Capture defended!',
          },
        },
        scope: 'parcel' as const,
        parcelId: `parcel_${contested.originalAgentId}`,
      });
      console.log(`[BattleJob] Capture cancelled at (${contested.blockX},${contested.blockY}) - defender returned`);
      continue;
    }

    // Check if capture complete
    if (elapsed >= CAPTURE_DURATION_MS) {
      // Finalize capture
      const parcel = mapState.transferParcelOwnership(
        contested.blockX,
        contested.blockY,
        contested.claimingAgentId,
        contested.claimingWorldId
      );

      if (parcel) {
        // Emit territory captured event
        const io = getIO();
        const capturedEvent: TerritoryCapturedEvent = {
          parcelId: parcel.id,
          capturedBy: contested.claimingWorldId,
          capturedFrom: contested.originalWorldId,
          battleId: `capture_${contested.blockX}_${contested.blockY}`,
        };

        io.to('game:map').emit(SOCKET_EVENTS.TERRITORY_CAPTURED as 'territory.captured', capturedEvent);
        io.to('multiverse').emit(SOCKET_EVENTS.TERRITORY_CAPTURED as 'territory.captured', capturedEvent);
        io.to(`world:${contested.claimingWorldId}`).emit(SOCKET_EVENTS.TERRITORY_CAPTURED as 'territory.captured', capturedEvent);
        io.to(`world:${contested.originalWorldId}`).emit(SOCKET_EVENTS.TERRITORY_CAPTURED as 'territory.captured', capturedEvent);

        console.log(
          `[BattleJob] Territory captured! Parcel (${contested.blockX},${contested.blockY}) now belongs to ${contested.claimingWorldId}`
        );
      }
    } else {
      // Update progress (emit every ~10% to avoid spam)
      const prevProgress = contested.captureProgress;
      if (Math.floor(progress / 10) > Math.floor(prevProgress / 10)) {
        contested.captureProgress = progress;
        const io = getIO();
        io.to('game:map').emit('city_event', {
          type: 'parcel_updated' as const,
          timestamp: new Date().toISOString(),
          payload: {
            parcelId: `parcel_${contested.originalAgentId}`,
            changes: {
              legacyMessage: `Capture ${Math.floor(progress)}%`,
            },
          },
          scope: 'parcel' as const,
          parcelId: `parcel_${contested.originalAgentId}`,
        });
      }
    }
  }
}

/**
 * Apply honor changes based on battle outcome
 * - Friendly fire: Attacker loses 15 honor
 * - Defender wins: Defender gains 5 honor
 * - Attacker captures: Attacker gains 2 honor
 */
async function applyBattleHonor(battle: ActiveBattle, victor: 'attacker' | 'defender' | 'draw'): Promise<void> {
  try {
    // Check if attacker attacked same faction (friendly fire)
    if (battle.attackerWorldId === battle.defenderWorldId) {
      // Friendly fire - heavy penalty
      await applyHonorChange(
        battle.attackerId,
        -15,
        `Attacked same faction parcel at (${battle.position.x},${battle.position.y})`
      );
      return;
    }

    // Inter-faction combat
    if (victor === 'attacker') {
      // Attacker won - reward for capturing enemy territory
      await applyHonorChange(
        battle.attackerId,
        2,
        `Captured enemy parcel at (${battle.position.x},${battle.position.y})`
      );
    } else if (victor === 'defender') {
      // Defender won - reward for defending faction territory
      await applyHonorChange(
        battle.defenderId,
        5,
        `Defended parcel at (${battle.position.x},${battle.position.y})`
      );
    }
  } catch (error) {
    console.error('[BattleJob] Error applying honor changes:', error);
  }
}

/**
 * Detect opposing armies at the same position that aren't yet in battle.
 * This catches cases where the march job already transitioned armies
 * to 'attacking' or 'idle' before the battle job could process them.
 */
async function detectNewBattles(): Promise<void> {
  // Find all armies that are idle or attacking (not marching, not returning)
  const armies = await ArmyModel.find({
    state: { $in: ['idle', 'attacking'] },
  });

  if (armies.length < 2) {
    return;
  }

  // Group by position, skip armies with 0 units
  const byPosition = new Map<string, typeof armies>();
  for (const army of armies) {
    if (sumUnits(getUnits(army)) === 0) continue;
    const key = `${army.position.x},${army.position.y}`;
    if (!byPosition.has(key)) byPosition.set(key, []);
    byPosition.get(key)!.push(army);
  }

  // Check each position for opposing factions
  for (const [posKey, armiesAtPos] of byPosition) {
    if (armiesAtPos.length < 2) continue;

    // Find pairs of opposing factions
    for (let i = 0; i < armiesAtPos.length; i++) {
      for (let j = i + 1; j < armiesAtPos.length; j++) {
        const a = armiesAtPos[i];
        const b = armiesAtPos[j];

        if (a.factionId === b.factionId) continue;

        // Check if already in a battle
        const alreadyBattling = Array.from(activeBattles.values()).some(
          bat =>
            bat.attackerArmyId === a.id || bat.attackerArmyId === b.id ||
            bat.defenderArmyId === a.id || bat.defenderArmyId === b.id
        );
        if (alreadyBattling) continue;

        // Start battle! The army that arrived later (or with 'attacking' state) is the attacker
        const attacker = a.state === 'attacking' ? a : b;
        const defender = attacker === a ? b : a;

        const [attackerAgent, defenderAgent] = await Promise.all([
          AgentModel.findById(attacker.ownerId),
          AgentModel.findById(defender.ownerId),
        ]);

        const parcel = mapState.getParcelByBlock(attacker.position.x, attacker.position.y);
        const terrain = (parcel?.terrain ?? 'plains') as TerrainType;

        const battleId = `battle_${attacker.id}_${defender.id}_${Date.now()}`;
        const battle: ActiveBattle = {
          battleId,
          attackerArmyId: attacker.id,
          defenderArmyId: defender.id,
          attackerId: attacker.ownerId,
          defenderId: defender.ownerId,
          attackerName: attackerAgent?.name || 'Unknown',
          defenderName: defenderAgent?.name || 'Unknown',
          attackerWorldId: attacker.factionId as WorldId,
          defenderWorldId: defender.factionId as WorldId,
          position: { x: attacker.position.x, y: attacker.position.y },
          terrain,
          round: 0,
          maxRounds: 4,
          attackerUnits: getUnits(attacker),
          defenderUnits: getUnits(defender),
        };

        activeBattles.set(battleId, battle);
        emitBattleStarted(battle);
        console.log(`[BattleJob] New battle detected at ${posKey}: ${attacker.factionId} vs ${defender.factionId}`);
      }
    }
  }
}

export async function runBattleTick(): Promise<void> {
  await processArrivals();
  try {
    await detectNewBattles();
  } catch (err) {
    console.error('[BattleJob] detectNewBattles error:', err);
  }
  await processActiveBattles();
  await processCaptureTimers();
}
