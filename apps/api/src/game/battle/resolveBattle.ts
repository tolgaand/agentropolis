import type { ArmyDocument } from '@agentropolis/db';
import type { ArmyUnit } from '@agentropolis/shared';
import type { TerrainType } from '@agentropolis/shared';

export interface ResolveBattleOptions {
  battleId: string;
  attackerMorale?: number;
  defenderMorale?: number;
  defenderHomeBonus?: number;
  fortBonus?: number;
  rounds?: number;
}

export interface BattleRoundResult {
  round: number;
  attackerRemaining: ArmyUnit;
  defenderRemaining: ArmyUnit;
  attackerLosses: ArmyUnit;
  defenderLosses: ArmyUnit;
  damageDealt: { attacker: number; defender: number };
}

export interface BattleResult {
  battleId: string;
  victor: 'attacker' | 'defender' | 'draw';
  attackerRemaining: ArmyUnit;
  defenderRemaining: ArmyUnit;
  attackerLosses: ArmyUnit;
  defenderLosses: ArmyUnit;
  rounds: BattleRoundResult[];
  lootGold: number;
  lootResources: Record<string, number>;
}

type UnitType = keyof ArmyUnit;

const UNIT_HP: Record<UnitType, number> = {
  infantry: 100,
  archer: 90,
  cavalry: 110,
  siege: 150,
};

const UNIT_ATTACK: Record<UnitType, number> = {
  infantry: 10,
  archer: 12,
  cavalry: 20,
  siege: 30,
};

const RPS_MULTIPLIER: Record<UnitType, Record<UnitType, number>> = {
  infantry: { infantry: 1.0, archer: 1.3, cavalry: 0.7, siege: 1.2 },
  archer: { infantry: 0.7, archer: 1.0, cavalry: 1.3, siege: 1.0 },
  cavalry: { infantry: 1.3, archer: 0.7, cavalry: 1.0, siege: 1.5 },
  siege: { infantry: 0.3, archer: 0.3, cavalry: 0.2, siege: 0.5 },
};

const TERRAIN_ATTACK_BONUS: Partial<Record<TerrainType, Partial<Record<UnitType, number>>>> = {
  forest: { archer: 1.15 },
  plains: { cavalry: 1.15 },
  mountain: { infantry: 1.15 },
};

function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function cloneUnits(units: ArmyUnit): ArmyUnit {
  return {
    infantry: units.infantry,
    archer: units.archer,
    cavalry: units.cavalry,
    siege: units.siege,
  };
}

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

function getTerrainBonus(terrain: TerrainType, unit: UnitType): number {
  return TERRAIN_ATTACK_BONUS[terrain]?.[unit] ?? 1.0;
}

function weightedRps(attackerType: UnitType, defender: ArmyUnit): number {
  const total = sumUnits(defender);
  if (total === 0) return 1.0;
  const weights: Array<[UnitType, number]> = [
    ['infantry', defender.infantry],
    ['archer', defender.archer],
    ['cavalry', defender.cavalry],
    ['siege', defender.siege],
  ];
  let multiplier = 0;
  for (const [defType, count] of weights) {
    if (count <= 0) continue;
    multiplier += (count / total) * RPS_MULTIPLIER[attackerType][defType];
  }
  return multiplier;
}

function computeDamage(
  attacker: ArmyUnit,
  defender: ArmyUnit,
  terrain: TerrainType,
  morale: number,
  rng: () => number,
  extraMultiplier: number,
): number {
  const unitTypes: UnitType[] = ['infantry', 'archer', 'cavalry', 'siege'];
  let base = 0;
  for (const type of unitTypes) {
    const count = attacker[type];
    if (count <= 0) continue;
    const terrainBonus = getTerrainBonus(terrain, type);
    const rps = weightedRps(type, defender);
    base += count * UNIT_ATTACK[type] * terrainBonus * rps;
  }
  const moraleMultiplier = Math.max(0.1, morale);
  const rngMultiplier = 0.9 + rng() * 0.2;
  return base * moraleMultiplier * extraMultiplier * rngMultiplier;
}

function applyLosses(units: ArmyUnit, damage: number): ArmyUnit {
  const totalHpPool =
    units.infantry * UNIT_HP.infantry +
    units.archer * UNIT_HP.archer +
    units.cavalry * UNIT_HP.cavalry +
    units.siege * UNIT_HP.siege;

  if (totalHpPool <= 0 || damage <= 0) {
    return { infantry: 0, archer: 0, cavalry: 0, siege: 0 };
  }

  const loss = (count: number, hp: number): number => {
    if (count <= 0) return 0;
    const share = (count * hp) / totalHpPool;
    const rawLoss = (damage * share) / hp;
    // Use ceil so even small armies inflict at least 1 casualty per round
    const lossUnits = Math.ceil(rawLoss);
    return Math.min(count, Math.max(0, lossUnits));
  };

  return {
    infantry: loss(units.infantry, UNIT_HP.infantry),
    archer: loss(units.archer, UNIT_HP.archer),
    cavalry: loss(units.cavalry, UNIT_HP.cavalry),
    siege: loss(units.siege, UNIT_HP.siege),
  };
}

function subtractUnits(units: ArmyUnit, losses: ArmyUnit): ArmyUnit {
  return {
    infantry: Math.max(0, units.infantry - losses.infantry),
    archer: Math.max(0, units.archer - losses.archer),
    cavalry: Math.max(0, units.cavalry - losses.cavalry),
    siege: Math.max(0, units.siege - losses.siege),
  };
}

export function resolveBattle(
  attacker: ArmyDocument,
  defender: ArmyDocument,
  terrain: TerrainType,
  options: ResolveBattleOptions,
): BattleResult {
  const rounds = Math.min(5, Math.max(1, options.rounds ?? 4));
  const attackerMorale = options.attackerMorale ?? 1.0;
  const defenderMorale = options.defenderMorale ?? 1.0;
  const defenderHomeBonus = options.defenderHomeBonus ?? 1.1;
  const fortBonus = options.fortBonus ?? 1.0;

  let attackerUnits = getUnits(attacker);
  let defenderUnits = getUnits(defender);

  const attackerLossesTotal: ArmyUnit = { infantry: 0, archer: 0, cavalry: 0, siege: 0 };
  const defenderLossesTotal: ArmyUnit = { infantry: 0, archer: 0, cavalry: 0, siege: 0 };
  const roundsLog: BattleRoundResult[] = [];

  for (let i = 0; i < rounds; i++) {
    if (sumUnits(attackerUnits) === 0 || sumUnits(defenderUnits) === 0) break;
    const seedBase = hashString(`${options.battleId}:${i}`);
    const attackerRng = createRng(seedBase ^ 0xa11ce);
    const defenderRng = createRng(seedBase ^ 0xd3f3d);

    const attackerDamage = computeDamage(
      attackerUnits,
      defenderUnits,
      terrain,
      attackerMorale,
      attackerRng,
      1.0,
    );

    const defenderDamage = computeDamage(
      defenderUnits,
      attackerUnits,
      terrain,
      defenderMorale,
      defenderRng,
      defenderHomeBonus * fortBonus,
    );

    const defenderLosses = applyLosses(defenderUnits, attackerDamage);
    const attackerLosses = applyLosses(attackerUnits, defenderDamage);

    attackerUnits = subtractUnits(attackerUnits, attackerLosses);
    defenderUnits = subtractUnits(defenderUnits, defenderLosses);

    roundsLog.push({
      round: i + 1,
      attackerRemaining: cloneUnits(attackerUnits),
      defenderRemaining: cloneUnits(defenderUnits),
      attackerLosses: cloneUnits(attackerLosses),
      defenderLosses: cloneUnits(defenderLosses),
      damageDealt: { attacker: attackerDamage, defender: defenderDamage },
    });

    attackerLossesTotal.infantry += attackerLosses.infantry;
    attackerLossesTotal.archer += attackerLosses.archer;
    attackerLossesTotal.cavalry += attackerLosses.cavalry;
    attackerLossesTotal.siege += attackerLosses.siege;

    defenderLossesTotal.infantry += defenderLosses.infantry;
    defenderLossesTotal.archer += defenderLosses.archer;
    defenderLossesTotal.cavalry += defenderLosses.cavalry;
    defenderLossesTotal.siege += defenderLosses.siege;
  }

  const attackerRemainingTotal = sumUnits(attackerUnits);
  const defenderRemainingTotal = sumUnits(defenderUnits);
  let victor: 'attacker' | 'defender' | 'draw' = 'draw';

  if (attackerRemainingTotal === 0 && defenderRemainingTotal === 0) {
    victor = 'draw';
  } else if (attackerRemainingTotal === 0) {
    victor = 'defender';
  } else if (defenderRemainingTotal === 0) {
    victor = 'attacker';
  } else {
    const attackerHp =
      attackerUnits.infantry * UNIT_HP.infantry +
      attackerUnits.archer * UNIT_HP.archer +
      attackerUnits.cavalry * UNIT_HP.cavalry +
      attackerUnits.siege * UNIT_HP.siege;
    const defenderHp =
      defenderUnits.infantry * UNIT_HP.infantry +
      defenderUnits.archer * UNIT_HP.archer +
      defenderUnits.cavalry * UNIT_HP.cavalry +
      defenderUnits.siege * UNIT_HP.siege;
    if (attackerHp > defenderHp) victor = 'attacker';
    else if (defenderHp > attackerHp) victor = 'defender';
  }

  return {
    battleId: options.battleId,
    victor,
    attackerRemaining: attackerUnits,
    defenderRemaining: defenderUnits,
    attackerLosses: attackerLossesTotal,
    defenderLosses: defenderLossesTotal,
    rounds: roundsLog,
    lootGold: 0,
    lootResources: {},
  };
}
