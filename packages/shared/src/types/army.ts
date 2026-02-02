export interface ArmyUnit {
  infantry: number;
  archer: number;
  cavalry: number;
  siege: number;
}

export const UNIT_COSTS: Record<keyof ArmyUnit, { food: number; wood: number; stone: number; iron: number; crn: number }> = {
  infantry: { food: 50, wood: 30, stone: 0, iron: 10, crn: 0 },
  archer:   { food: 50, wood: 40, stone: 0, iron: 15, crn: 0 },
  cavalry:  { food: 60, wood: 20, stone: 0, iron: 40, crn: 0 },
  siege:    { food: 80, wood: 80, stone: 60, iron: 40, crn: 0 },
};

export const UNIT_STATS: Record<keyof ArmyUnit, { attack: number; defense: number; speed: number }> = {
  infantry: { attack: 10, defense: 15, speed: 3 },
  archer:   { attack: 12, defense: 8, speed: 3 },
  cavalry:  { attack: 20, defense: 8, speed: 6 },
  siege:    { attack: 30, defense: 5, speed: 1 },
};

export const TERRAIN_SPEED_MODIFIER: Record<string, number> = {
  plains: 1.0,
  forest: 0.8,
  mountain: 0.6,
  mine: 0.7,
  river: 0.5,
  volcanic: 0.4,
};

export function calculateTravelHours(distance: number, baseSpeed: number, terrainMod: number): number {
  return Math.max(1, distance / (baseSpeed * terrainMod));
}

export function calculateBattlePower(units: ArmyUnit, morale: number, techMod: number): number {
  return (
    units.infantry * UNIT_STATS.infantry.attack +
    units.archer * UNIT_STATS.archer.attack +
    units.cavalry * UNIT_STATS.cavalry.attack +
    units.siege * UNIT_STATS.siege.attack
  ) * morale * techMod;
}

export function calculateDefensePower(units: ArmyUnit, morale: number, techMod: number, fortBonus: number): number {
  return (
    units.infantry * UNIT_STATS.infantry.defense +
    units.archer * UNIT_STATS.archer.defense +
    units.cavalry * UNIT_STATS.cavalry.defense +
    units.siege * UNIT_STATS.siege.defense
  ) * morale * techMod * fortBonus;
}

// ============================================================================
// ARMY MARCH TYPES
// ============================================================================

export interface MarchingArmy {
  armyId: string;
  factionId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  progress: number; // 0-1
  speed: number;
  unitCount: number;
}

export interface ArmyMarchEvent {
  armyId: string;
  ownerId: string;
  factionId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  progress: number;
  speed: number;
  estimatedArrival: string;
}

export interface ArmyMarchProgressEvent {
  armyId: string;
  currentPosition: { x: number; y: number };
  progress: number; // 0.0 to 1.0
  remainingSeconds: number;
}

export interface ArmyMarchArrivedEvent {
  armyId: string;
  ownerId: string;
  factionId: string;
  position: { x: number; y: number };
  arrivedAt: string;
  nextState: 'attacking' | 'idle';
}

export interface ArmyMarchRecalledEvent {
  armyId: string;
  recalledAt: string;
  returnETA: string;
  currentPosition: { x: number; y: number };
}
