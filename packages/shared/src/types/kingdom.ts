/**
 * Kingdom System Types
 *
 * MEDIEVAL GAME ARCHITECTURE:
 * - Buildings produce resources and house units
 * - Units provide military power for battles and defense
 * - Each kingdom has unique bonuses
 */

import type { ResourceId, WorldId } from './world';

// ============================================================================
// Building Types
// ============================================================================

export type KingdomBuildingType =
  | 'farm'
  | 'lumberyard'
  | 'quarry'
  | 'iron_mine'
  | 'market'
  | 'barracks'
  | 'stable'
  | 'watchtower'
  | 'wall'
  | 'castle'
  | 'academy';

export interface KingdomBuildingDef {
  type: KingdomBuildingType;
  name: string;
  description: string;
  category: 'production' | 'military' | 'defense' | 'special';
  produces?: ResourceId;
  output: number;              // units per tick
  upkeep: Record<string, number>; // resource cost per tick
  cost: Record<string, number>;   // build cost
  buildTicks: number;          // ticks to construct
  maxLevel: number;
  modelName: string;           // 3D model reference
}

export const KINGDOM_BUILDINGS: Record<KingdomBuildingType, KingdomBuildingDef> = {
  farm: {
    type: 'farm',
    name: 'Farm',
    description: 'Produces food to sustain the kingdom',
    category: 'production',
    produces: 'food',
    output: 3,
    upkeep: {},
    cost: { wood: 20, gold: 10 },
    buildTicks: 30,
    maxLevel: 5,
    modelName: 'Farm',
  },
  lumberyard: {
    type: 'lumberyard',
    name: 'Lumberyard',
    description: 'Harvests timber from nearby forests',
    category: 'production',
    produces: 'wood',
    output: 2,
    upkeep: { food: 1 },
    cost: { wood: 10, gold: 15 },
    buildTicks: 25,
    maxLevel: 5,
    modelName: 'Lumberyard',
  },
  quarry: {
    type: 'quarry',
    name: 'Quarry',
    description: 'Extracts stone from the earth',
    category: 'production',
    produces: 'stone',
    output: 2,
    upkeep: { food: 1, wood: 1 },
    cost: { wood: 30, gold: 20 },
    buildTicks: 40,
    maxLevel: 5,
    modelName: 'Quarry',
  },
  iron_mine: {
    type: 'iron_mine',
    name: 'Iron Mine',
    description: 'Deep shafts yielding precious iron ore',
    category: 'production',
    produces: 'iron',
    output: 1,
    upkeep: { food: 2, wood: 1 },
    cost: { wood: 40, stone: 30, gold: 30 },
    buildTicks: 60,
    maxLevel: 5,
    modelName: 'Iron_Mine',
  },
  market: {
    type: 'market',
    name: 'Market',
    description: 'Generates gold through trade',
    category: 'production',
    produces: 'gold',
    output: 2,
    upkeep: { food: 1 },
    cost: { wood: 30, stone: 20, gold: 25 },
    buildTicks: 35,
    maxLevel: 5,
    modelName: 'Market',
  },
  barracks: {
    type: 'barracks',
    name: 'Barracks',
    description: 'Trains infantry and militia',
    category: 'military',
    output: 0,
    upkeep: { food: 3, gold: 2 },
    cost: { wood: 40, stone: 30, iron: 10, gold: 30 },
    buildTicks: 50,
    maxLevel: 3,
    modelName: 'Barracks',
  },
  stable: {
    type: 'stable',
    name: 'Stable',
    description: 'Houses and trains mounted cavalry',
    category: 'military',
    output: 0,
    upkeep: { food: 5, gold: 3 },
    cost: { wood: 50, stone: 20, iron: 15, gold: 40 },
    buildTicks: 60,
    maxLevel: 3,
    modelName: 'Stable',
  },
  watchtower: {
    type: 'watchtower',
    name: 'Watchtower',
    description: 'Provides early warning of enemy approach',
    category: 'defense',
    output: 0,
    upkeep: { food: 1, gold: 1 },
    cost: { wood: 20, stone: 30, gold: 15 },
    buildTicks: 30,
    maxLevel: 3,
    modelName: 'Watchtower',
  },
  wall: {
    type: 'wall',
    name: 'Wall',
    description: 'Stone fortification protecting the settlement',
    category: 'defense',
    output: 0,
    upkeep: {},
    cost: { stone: 50, iron: 5, gold: 20 },
    buildTicks: 80,
    maxLevel: 3,
    modelName: 'Wall',
  },
  castle: {
    type: 'castle',
    name: 'Castle',
    description: 'Seat of power and ultimate fortification',
    category: 'special',
    output: 0,
    upkeep: { food: 5, gold: 5 },
    cost: { wood: 100, stone: 200, iron: 50, gold: 200 },
    buildTicks: 200,
    maxLevel: 3,
    modelName: 'Castle',
  },
  academy: {
    type: 'academy',
    name: 'Academy',
    description: 'Research and upgrade center',
    category: 'special',
    output: 0,
    upkeep: { food: 3, gold: 5 },
    cost: { wood: 60, stone: 80, iron: 20, gold: 100 },
    buildTicks: 120,
    maxLevel: 3,
    modelName: 'Academy',
  },
};

// ============================================================================
// Unit Types
// ============================================================================

export type UnitType =
  | 'farmer'
  | 'militia'
  | 'soldier'
  | 'archer'
  | 'knight'
  | 'scout'
  | 'general';

export interface UnitDef {
  type: UnitType;
  name: string;
  description: string;
  attack: number;
  hp: number;
  defense: number;
  speed: number;
  cost: Record<string, number>;
  upkeep: Record<string, number>;
  trainTicks: number;
  requiresBuilding: KingdomBuildingType;
}

export const UNIT_DEFS: Record<UnitType, UnitDef> = {
  farmer: {
    type: 'farmer',
    name: 'Farmer',
    description: 'Basic worker, weak in combat',
    attack: 1,
    hp: 10,
    defense: 0,
    speed: 1,
    cost: { food: 5, gold: 2 },
    upkeep: { food: 1 },
    trainTicks: 5,
    requiresBuilding: 'farm',
  },
  militia: {
    type: 'militia',
    name: 'Militia',
    description: 'Armed peasants providing basic defense',
    attack: 3,
    hp: 20,
    defense: 1,
    speed: 1,
    cost: { food: 10, iron: 2, gold: 5 },
    upkeep: { food: 1, gold: 1 },
    trainTicks: 10,
    requiresBuilding: 'barracks',
  },
  soldier: {
    type: 'soldier',
    name: 'Soldier',
    description: 'Trained infantry with sword and shield',
    attack: 6,
    hp: 35,
    defense: 3,
    speed: 1,
    cost: { food: 15, iron: 5, gold: 10 },
    upkeep: { food: 2, gold: 2 },
    trainTicks: 20,
    requiresBuilding: 'barracks',
  },
  archer: {
    type: 'archer',
    name: 'Archer',
    description: 'Ranged unit effective against light troops',
    attack: 5,
    hp: 20,
    defense: 1,
    speed: 1,
    cost: { food: 12, wood: 5, gold: 8 },
    upkeep: { food: 1, gold: 1 },
    trainTicks: 15,
    requiresBuilding: 'barracks',
  },
  knight: {
    type: 'knight',
    name: 'Knight',
    description: 'Heavy mounted cavalry, devastating charge',
    attack: 10,
    hp: 50,
    defense: 5,
    speed: 2,
    cost: { food: 25, iron: 10, gold: 25 },
    upkeep: { food: 3, gold: 3 },
    trainTicks: 40,
    requiresBuilding: 'stable',
  },
  scout: {
    type: 'scout',
    name: 'Scout',
    description: 'Fast reconnaissance unit',
    attack: 2,
    hp: 15,
    defense: 1,
    speed: 3,
    cost: { food: 8, gold: 5 },
    upkeep: { food: 1 },
    trainTicks: 8,
    requiresBuilding: 'stable',
  },
  general: {
    type: 'general',
    name: 'General',
    description: 'Boosts all troops in army, rare elite unit',
    attack: 8,
    hp: 60,
    defense: 4,
    speed: 1,
    cost: { food: 50, iron: 20, gold: 100 },
    upkeep: { food: 5, gold: 10 },
    trainTicks: 80,
    requiresBuilding: 'castle',
  },
};

// ============================================================================
// Kingdom Bonuses
// ============================================================================

export interface KingdomBonus {
  worldId: WorldId;
  productionBonus: Partial<Record<ResourceId, number>>;
  militaryBonus: {
    attackMultiplier: number;
    defenseMultiplier: number;
  };
  tradeBonus: number; // fee reduction multiplier
  description: string;
}

export const KINGDOM_BONUSES: Record<WorldId, KingdomBonus> = {
  claude_nation: {
    worldId: 'claude_nation',
    productionBonus: { iron: 1.2 },
    militaryBonus: { attackMultiplier: 1.0, defenseMultiplier: 1.15 },
    tradeBonus: 1.0,
    description: 'Superior iron production and fortified defenses',
  },
  openai_empire: {
    worldId: 'openai_empire',
    productionBonus: { stone: 1.1, gold: 1.1 },
    militaryBonus: { attackMultiplier: 1.0, defenseMultiplier: 1.0 },
    tradeBonus: 0.9,
    description: 'Merchant princes with reduced trade fees',
  },
  gemini_republic: {
    worldId: 'gemini_republic',
    productionBonus: { food: 1.25, wood: 1.15 },
    militaryBonus: { attackMultiplier: 1.1, defenseMultiplier: 1.0 },
    tradeBonus: 1.0,
    description: 'Bountiful harvests and deadly archers',
  },
  grok_syndicate: {
    worldId: 'grok_syndicate',
    productionBonus: { gold: 1.25 },
    militaryBonus: { attackMultiplier: 1.15, defenseMultiplier: 1.0 },
    tradeBonus: 1.0,
    description: 'Scholarly riches and lightning cavalry',
  },
  open_frontier: {
    worldId: 'open_frontier',
    productionBonus: { diamond: 1.3 },
    militaryBonus: { attackMultiplier: 1.0, defenseMultiplier: 1.1 },
    tradeBonus: 1.0,
    description: 'Diamond miners and hardened northern warriors',
  },
};
