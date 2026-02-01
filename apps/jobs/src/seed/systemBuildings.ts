import type { BuildingType } from '@agentropolis/shared';

interface SystemBuildingSeed {
  worldId: string;
  parcelId: string;
  coords: { x: number; y: number };
  isLandmark?: boolean;
  building: {
    name: string;
    type: BuildingType;
    spriteId: number;
    level?: number;
  };
}

// Sprite IDs from existing SPRITE_RANGES:
// plaza: [73-80], library: [65-72], workshop: [33-40], market: [1-8], decor: [89-96]

export const SYSTEM_BUILDINGS: SystemBuildingSeed[] = [
  // ============ CROSSROADS / CIVIC CENTER ============
  {
    worldId: 'open_frontier',
    parcelId: 'open_frontier_15_15',
    coords: { x: 15, y: 15 },
    isLandmark: true,
    building: {
      name: 'Town Hall',
      type: 'castle',
      spriteId: 73,
      level: 3,
    },
  },
  {
    worldId: 'open_frontier',
    parcelId: 'open_frontier_14_14',
    coords: { x: 14, y: 14 },
    building: {
      name: 'Civic Plaza NW',
      type: 'market',
      spriteId: 74,
      level: 1,
    },
  },
  {
    worldId: 'open_frontier',
    parcelId: 'open_frontier_15_14',
    coords: { x: 15, y: 14 },
    building: {
      name: 'Civic Plaza NE',
      type: 'market',
      spriteId: 75,
      level: 1,
    },
  },
  {
    worldId: 'open_frontier',
    parcelId: 'open_frontier_14_15',
    coords: { x: 14, y: 15 },
    building: {
      name: 'Civic Plaza SW',
      type: 'market',
      spriteId: 76,
      level: 1,
    },
  },

  // ============ WORLD LANDMARKS ============
  {
    worldId: 'claude_nation',
    parcelId: 'claude_nation_7_7',
    coords: { x: 7, y: 7 },
    isLandmark: true,
    building: {
      name: 'Archive Library',
      type: 'academy',
      spriteId: 65,
      level: 2,
    },
  },
  {
    worldId: 'openai_empire',
    parcelId: 'openai_empire_22_7',
    coords: { x: 22, y: 7 },
    isLandmark: true,
    building: {
      name: 'Factory Core',
      type: 'quarry',
      spriteId: 33,
      level: 2,
    },
  },
  {
    worldId: 'gemini_republic',
    parcelId: 'gemini_republic_7_22',
    coords: { x: 7, y: 22 },
    isLandmark: true,
    building: {
      name: 'Garden Conservatory',
      type: 'farm',
      spriteId: 89,
      level: 2,
    },
  },
  {
    worldId: 'open_frontier',
    parcelId: 'open_frontier_22_22',
    coords: { x: 22, y: 22 },
    isLandmark: true,
    building: {
      name: 'Grand Market',
      type: 'market',
      spriteId: 1,
      level: 2,
    },
  },
];
