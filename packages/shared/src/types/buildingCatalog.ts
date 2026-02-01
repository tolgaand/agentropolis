/**
 * Building Catalog - Medieval building definitions
 *
 * Each building has a unique ID, model name, footprint, and cost.
 * Some buildings may be exclusive to specific kingdoms or require unlock levels.
 */

import type { WorldId } from './world';

export interface BuildingDefinition {
  id: string;
  name: string;
  category: 'production' | 'military' | 'defense' | 'decoration' | 'special';
  footprint: { w: number; h: number };
  cost: number;
  modelName: string;
  spriteId: number; // Fallback 2D sprite
  unlockLevel?: number;
  worldExclusive?: WorldId;
  description?: string;
}

export const BUILDING_CATALOG: BuildingDefinition[] = [
  // Production
  {
    id: 'farm',
    name: 'Farm',
    category: 'production',
    footprint: { w: 3, h: 3 },
    cost: 30,
    modelName: 'Farm',
    spriteId: 1,
  },
  {
    id: 'lumberyard',
    name: 'Lumberyard',
    category: 'production',
    footprint: { w: 3, h: 2 },
    cost: 25,
    modelName: 'Lumberyard',
    spriteId: 2,
  },
  {
    id: 'quarry',
    name: 'Quarry',
    category: 'production',
    footprint: { w: 3, h: 3 },
    cost: 50,
    modelName: 'Quarry',
    spriteId: 3,
  },
  {
    id: 'iron_mine',
    name: 'Iron Mine',
    category: 'production',
    footprint: { w: 3, h: 3 },
    cost: 100,
    modelName: 'Iron_Mine',
    spriteId: 4,
  },
  {
    id: 'market',
    name: 'Market',
    category: 'production',
    footprint: { w: 3, h: 2 },
    cost: 75,
    modelName: 'Market',
    spriteId: 5,
  },

  // Military
  {
    id: 'barracks',
    name: 'Barracks',
    category: 'military',
    footprint: { w: 3, h: 3 },
    cost: 110,
    modelName: 'Barracks',
    spriteId: 9,
    unlockLevel: 2,
  },
  {
    id: 'stable',
    name: 'Stable',
    category: 'military',
    footprint: { w: 3, h: 2 },
    cost: 125,
    modelName: 'Stable',
    spriteId: 10,
    unlockLevel: 2,
  },

  // Defense
  {
    id: 'watchtower',
    name: 'Watchtower',
    category: 'defense',
    footprint: { w: 2, h: 2 },
    cost: 65,
    modelName: 'Watchtower',
    spriteId: 17,
  },
  {
    id: 'wall',
    name: 'Wall',
    category: 'defense',
    footprint: { w: 3, h: 1 },
    cost: 75,
    modelName: 'Wall',
    spriteId: 18,
  },

  // Special
  {
    id: 'castle',
    name: 'Castle',
    category: 'special',
    footprint: { w: 4, h: 4 },
    cost: 750,
    modelName: 'Castle',
    spriteId: 25,
    unlockLevel: 5,
  },
  {
    id: 'academy',
    name: 'Academy',
    category: 'special',
    footprint: { w: 3, h: 3 },
    cost: 285,
    modelName: 'Academy',
    spriteId: 26,
    unlockLevel: 3,
  },

  // Decorations
  {
    id: 'tree_oak',
    name: 'Oak Tree',
    category: 'decoration',
    footprint: { w: 1, h: 1 },
    cost: 5,
    modelName: 'Tree_Oak',
    spriteId: 73,
  },
  {
    id: 'tree_pine',
    name: 'Pine Tree',
    category: 'decoration',
    footprint: { w: 1, h: 1 },
    cost: 5,
    modelName: 'Tree_Pine',
    spriteId: 74,
  },
  {
    id: 'well',
    name: 'Well',
    category: 'decoration',
    footprint: { w: 1, h: 1 },
    cost: 15,
    modelName: 'Well',
    spriteId: 85,
  },
  {
    id: 'torch',
    name: 'Torch Post',
    category: 'decoration',
    footprint: { w: 1, h: 1 },
    cost: 8,
    modelName: 'Torch',
    spriteId: 90,
  },
  {
    id: 'hay_bale',
    name: 'Hay Bale',
    category: 'decoration',
    footprint: { w: 1, h: 1 },
    cost: 3,
    modelName: 'Hay_Bale',
    spriteId: 91,
  },

  // Kingdom Exclusive
  {
    id: 'claude_forge',
    name: 'Claude Grand Forge',
    category: 'special',
    footprint: { w: 3, h: 3 },
    cost: 500,
    modelName: 'Grand_Forge',
    spriteId: 33,
    unlockLevel: 5,
    worldExclusive: 'claude_nation' as WorldId,
    description: 'A legendary forge exclusive to Claude Kingdom',
  },
  {
    id: 'openai_treasury',
    name: 'OpenAI Treasury',
    category: 'special',
    footprint: { w: 3, h: 3 },
    cost: 500,
    modelName: 'Treasury',
    spriteId: 34,
    unlockLevel: 5,
    worldExclusive: 'openai_empire' as WorldId,
    description: 'A great treasury exclusive to OpenAI Empire',
  },
];

export function getBuildingById(id: string): BuildingDefinition | undefined {
  return BUILDING_CATALOG.find(b => b.id === id);
}

export function getAvailableBuildings(
  worldId: WorldId,
  agentLevel: number,
): BuildingDefinition[] {
  return BUILDING_CATALOG.filter(b => {
    if (b.unlockLevel && agentLevel < b.unlockLevel) return false;
    if (b.worldExclusive && b.worldExclusive !== worldId) return false;
    return true;
  });
}
