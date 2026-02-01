import type { BuildingType } from '../types/building';

export type BuildingStyle = 'wood' | 'stone' | 'iron';
export type KingdomId = 'claude_nation' | 'openai_empire' | 'gemini_republic' | 'grok_syndicate' | 'open_frontier';

export interface BuildingTypeConfig {
  description: string;
  preferredCategories: string[];
  maxLevel: number;
  icon: string;
}

export interface KingdomConfig {
  name: string;
  theme: string;
  preferredStyle: BuildingStyle | null;
  tint: string | null;
  buildingBias: BuildingType[];
}

export const BUILDING_TYPE_CONFIG: Record<BuildingType, BuildingTypeConfig> = {
  farm: {
    description: 'Produces food for the kingdom',
    preferredCategories: ['production'],
    maxLevel: 5,
    icon: 'wheat',
  },
  lumberyard: {
    description: 'Harvests wood from forests',
    preferredCategories: ['production'],
    maxLevel: 5,
    icon: 'axe',
  },
  quarry: {
    description: 'Extracts stone blocks',
    preferredCategories: ['production'],
    maxLevel: 5,
    icon: 'mountain',
  },
  iron_mine: {
    description: 'Mines iron ore deposits',
    preferredCategories: ['production'],
    maxLevel: 5,
    icon: 'pickaxe',
  },
  market: {
    description: 'Trade hub generating gold',
    preferredCategories: ['production'],
    maxLevel: 5,
    icon: 'coins',
  },
  barracks: {
    description: 'Trains infantry units',
    preferredCategories: ['military'],
    maxLevel: 3,
    icon: 'swords',
  },
  stable: {
    description: 'Houses cavalry units',
    preferredCategories: ['military'],
    maxLevel: 3,
    icon: 'horse',
  },
  watchtower: {
    description: 'Early warning defense',
    preferredCategories: ['defense'],
    maxLevel: 3,
    icon: 'eye',
  },
  wall: {
    description: 'Stone fortification',
    preferredCategories: ['defense'],
    maxLevel: 3,
    icon: 'shield',
  },
  castle: {
    description: 'Seat of power',
    preferredCategories: ['special'],
    maxLevel: 3,
    icon: 'crown',
  },
  academy: {
    description: 'Research and upgrades',
    preferredCategories: ['special'],
    maxLevel: 3,
    icon: 'scroll',
  },
};

export const KINGDOM_CONFIG: Record<KingdomId, KingdomConfig> = {
  claude_nation: {
    name: 'Claude Kingdom',
    theme: 'Mining & Defense',
    preferredStyle: 'iron',
    tint: '#8b2500',
    buildingBias: ['iron_mine', 'barracks', 'wall'],
  },
  openai_empire: {
    name: 'OpenAI Empire',
    theme: 'Commerce & Architecture',
    preferredStyle: 'stone',
    tint: '#8b8b00',
    buildingBias: ['market', 'quarry', 'castle'],
  },
  gemini_republic: {
    name: 'Gemini Dominion',
    theme: 'Agriculture & Nature',
    preferredStyle: 'wood',
    tint: '#2d5a27',
    buildingBias: ['farm', 'lumberyard', 'stable'],
  },
  grok_syndicate: {
    name: 'Grok Guild',
    theme: 'Scholarship & Cavalry',
    preferredStyle: 'stone',
    tint: '#c9a84c',
    buildingBias: ['academy', 'stable', 'market'],
  },
  open_frontier: {
    name: 'Open Frontier',
    theme: 'Mining & Endurance',
    preferredStyle: 'wood',
    tint: '#4682b4',
    buildingBias: ['quarry', 'iron_mine', 'watchtower'],
  },
};

export const SPRITE_SHEET_PATH = '/assets/buildings/Spritesheet/buildingTiles_sheet.png';
export const SPRITE_PNG_PATH = '/assets/buildings/PNG/';

export const SPRITE_RANGES: Record<string, (number | [number, number])[]> = {
  farm: [[1, 4]],
  lumberyard: [[5, 8]],
  quarry: [[9, 12]],
  iron_mine: [[13, 16]],
  market: [[17, 20]],
  barracks: [[21, 24]],
  stable: [[25, 28]],
  watchtower: [[29, 32]],
  wall: [[33, 36]],
  castle: [[37, 40]],
  academy: [[41, 44]],
  decoration: [[73, 96]],
};

export const BUILDING_CONFIGS: Record<string, { defaultStats: Record<string, number> }> = {
  farm: { defaultStats: { output: 3 } },
  lumberyard: { defaultStats: { output: 2 } },
  quarry: { defaultStats: { output: 2 } },
  iron_mine: { defaultStats: { output: 1 } },
  market: { defaultStats: { output: 2, capacity: 10 } },
  barracks: { defaultStats: { capacity: 5 } },
  stable: { defaultStats: { capacity: 3 } },
  watchtower: { defaultStats: { defense: 10 } },
  wall: { defaultStats: { defense: 20 } },
  castle: { defaultStats: { defense: 50, capacity: 10 } },
  academy: { defaultStats: { capacity: 3 } },
};
