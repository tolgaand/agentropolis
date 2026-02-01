/**
 * Map System Types
 *
 * SPECTATOR-FIRST ARCHITECTURE:
 * - Dynamic expanding city with ring-based expansion
 * - Rich parcels with multiple buildings (20x20 tiles per block)
 * - 3-tile roads between parcels
 * - Agents own parcels, not districts
 *
 * BLOCK SYSTEM:
 * - Each parcel occupies a 20x20 tile block
 * - 3-tile roads separate blocks
 * - Block (0,0) reserved for World Monument
 * - Ring expansion pattern: (0,0) -> ring 1 -> ring 2 -> ...
 */

import type { ParcelTheme } from './socket';
import { createSeededRng, seededRandomChoice } from '../utils/seed';

// ============================================================================
// Block System Constants
// ============================================================================

/**
 * Parcel size in tiles (20x20 per parcel)
 */
export const PARCEL_SIZE = 20;

/**
 * Road width in tiles (3-tile roads between parcels)
 */
export const ROAD_WIDTH = 3;

/**
 * Full block size including road (23 tiles = 20 parcel + 3 road)
 */
export const BLOCK_SIZE = PARCEL_SIZE + ROAD_WIDTH;

// ============================================================================
// Tile IDs
// ============================================================================

export const TILE_IDS = {
  // Empty
  EMPTY: -1,

  // Terrain: 0-99
  GRASS: 0,
  WATER: 1,
  SAND: 2,
  FOREST: 3,
  DIRT: 4,
  PARCEL_GROUND: 5,  // Brown/tan ground for parcels

  // Paths: 50-99
  PATH_STONE: 50,
  PATH_DIRT: 51,
  PATH_BRICK: 52,

  // Roads: 100-199
  ROAD_STRAIGHT_H: 100,
  ROAD_STRAIGHT_V: 101,
  ROAD_CORNER_NE: 102,
  ROAD_CORNER_NW: 103,
  ROAD_CORNER_SE: 104,
  ROAD_CORNER_SW: 105,
  ROAD_CROSS: 106,
  ROAD_T_NORTH: 107,
  ROAD_T_SOUTH: 108,
  ROAD_T_EAST: 109,
  ROAD_T_WEST: 110,
  ROAD_END_NORTH: 111,
  ROAD_END_SOUTH: 112,
  ROAD_END_EAST: 113,
  ROAD_END_WEST: 114,

  // Fences: 150-199
  FENCE_WOOD: 150,
  FENCE_STONE: 151,
  FENCE_IRON: 152,
  FENCE_CORNER_NE: 153,
  FENCE_CORNER_NW: 154,
  FENCE_CORNER_SE: 155,
  FENCE_CORNER_SW: 156,

  // System Buildings: 200-249
  BUILDING_TOWN_HALL: 200,
  BUILDING_PLAZA: 201,
  BUILDING_MONUMENT: 1,

  // Decorations: 300-399
  DECO_TREE: 300,
  DECO_LAMP: 301,
  DECO_BENCH: 302,
  DECO_FOUNTAIN: 303,
  DECO_BUSH: 304,
  DECO_FLOWER: 305,
  DECO_ROCK: 306,
  DECO_STATUE: 307,
  DECO_SIGN: 308,
  DECO_MAILBOX: 309,
} as const;

export type TileId = (typeof TILE_IDS)[keyof typeof TILE_IDS];

// ============================================================================
// Sprite Mapping
// ============================================================================

export const TILE_SPRITES: Record<number, number> = {
  // Terrain
  [TILE_IDS.GRASS]: 0,
  [TILE_IDS.WATER]: 0,
  [TILE_IDS.PARCEL_GROUND]: 0, // Drawn procedurally

  // Paths
  [TILE_IDS.PATH_STONE]: 93,
  [TILE_IDS.PATH_DIRT]: 94,
  [TILE_IDS.PATH_BRICK]: 95,

  // Roads
  [TILE_IDS.ROAD_STRAIGHT_H]: 97,
  [TILE_IDS.ROAD_STRAIGHT_V]: 98,
  [TILE_IDS.ROAD_CROSS]: 99,
  [TILE_IDS.ROAD_CORNER_NE]: 100,
  [TILE_IDS.ROAD_CORNER_NW]: 101,
  [TILE_IDS.ROAD_CORNER_SE]: 102,
  [TILE_IDS.ROAD_CORNER_SW]: 103,
  [TILE_IDS.ROAD_T_NORTH]: 104,
  [TILE_IDS.ROAD_T_SOUTH]: 105,
  [TILE_IDS.ROAD_T_EAST]: 106,
  [TILE_IDS.ROAD_T_WEST]: 107,

  // System Buildings
  [TILE_IDS.BUILDING_TOWN_HALL]: 1,
  [TILE_IDS.BUILDING_PLAZA]: 73,

  // Decorations
  [TILE_IDS.DECO_TREE]: 89,
  [TILE_IDS.DECO_LAMP]: 90,
  [TILE_IDS.DECO_BENCH]: 91,
  [TILE_IDS.DECO_FOUNTAIN]: 92,
  [TILE_IDS.DECO_BUSH]: 85,
  [TILE_IDS.DECO_FLOWER]: 86,
  [TILE_IDS.DECO_ROCK]: 87,
  [TILE_IDS.DECO_STATUE]: 88,
};

// ============================================================================
// Layer Types
// ============================================================================

export type LayerType = 'ground' | 'road' | 'building' | 'decoration';

export interface TileLayer {
  name: string;
  type: LayerType;
  visible: boolean;
  tiles: number[][]; // 2D array of tile IDs, -1 = empty
}

// ============================================================================
// Map Objects
// ============================================================================

export type MapObjectType = 'building' | 'npc' | 'item' | 'event' | 'decoration';

export interface MapObject {
  id: string;
  type: MapObjectType;
  gridX: number;
  gridY: number;
  spriteId: number;
  buildingType?: string;  // Actual type: 'farm', 'castle', 'market', etc. Used for 3D model lookup.
  name?: string;
  ownerId?: string;
  parcelId?: string;
  level?: number;
  meta?: Record<string, unknown>;
}

// ============================================================================
// Rich Parcel System (20x20 tiles with multiple buildings)
// ============================================================================

// Note: PARCEL_SIZE is defined above as 20 (not 5)

/**
 * Block coordinate (where the parcel is in the block grid)
 */
export interface BlockCoord {
  blockX: number;
  blockY: number;
}

/**
 * Agent hover data for UI display
 */
export interface AgentHoverData {
  id: string;
  name: string;
  aiModel: string;
  legacyMessage?: string;
  registeredAt: string;
}

export interface MapParcel {
  id: string;
  agentId: string;
  agentName: string;
  // World this parcel belongs to
  worldId: string;
  // Block coordinates (not tile coordinates)
  blockX: number;
  blockY: number;
  // Tile bounds (computed from block coordinates)
  bounds: ParcelBounds;
  theme: ParcelTheme;
  layout: ParcelLayout;
  registeredAt: string;
  legacyMessage?: string;
  // Agent data for hover display
  agentData?: AgentHoverData;
  // DNA-derived properties
  terrain?: string;         // TerrainType: plains, forest, mountain, mine, river, volcanic
  fertilityStars?: number;  // 1-5 stars, affects production multiplier
  startingBuilding?: string; // From EMPIRE_DNA pool, selected by hash
}

export interface ParcelBounds {
  x: number;       // Tile X (computed: offset + blockX * BLOCK_SIZE)
  y: number;       // Tile Y (computed: offset + blockY * BLOCK_SIZE)
  width: number;   // Always PARCEL_SIZE (20)
  height: number;  // Always PARCEL_SIZE (20)
}

/**
 * Rich parcel layout with multiple elements (20x20 grid)
 */
export interface ParcelLayout {
  // Main building at center area (around 9,9 to 10,10)
  mainBuilding: ParcelBuilding;
  // Secondary buildings (corners, edges)
  secondaryBuildings: ParcelBuilding[];
  // Decorations (trees, flowers, benches)
  decorations: ParcelDecoration[];
  // Ground tiles (paths, special ground)
  groundTiles: ParcelGroundTile[];
  // Fence around parcel border
  hasFence: boolean;
  fenceType?: 'wood' | 'stone' | 'iron';
}

export interface ParcelBuilding {
  localX: number;  // 0-19 within parcel
  localY: number;  // 0-19 within parcel
  spriteId: number;
  buildingType: string;  // Actual type: 'farm', 'castle', 'market', etc.
  name: string;
  level: number;
}

export interface ParcelDecoration {
  localX: number;  // 0-19 within parcel
  localY: number;  // 0-19 within parcel
  spriteId: number;
}

export interface ParcelGroundTile {
  localX: number;  // 0-19 within parcel
  localY: number;  // 0-19 within parcel
  tileId: number;
}

// ============================================================================
// Theme-based Building & Decoration Sprites
// ============================================================================

// ============================================================================
// Theme → Building Type Mapping
// ============================================================================
// Maps themes to actual building types from manifest.json/EMPIRE_DNA

const THEME_BUILDING_TYPES: Record<ParcelTheme, {
  small: string[];
  medium: string[];
  large: string[];
  xlarge: string[];
}> = {
  farming: {
    small: ['farm', 'farm', 'lumberyard'],
    medium: ['lumberyard', 'quarry'],
    large: ['farm', 'quarry'],
    xlarge: [],
  },
  military: {
    small: ['watchtower', 'watchtower'],
    medium: ['barracks', 'stable'],
    large: ['barracks', 'iron_mine'],
    xlarge: ['castle'],
  },
  trade: {
    small: ['market', 'market', 'farm'],
    medium: ['market', 'lumberyard'],
    large: ['market', 'quarry'],
    xlarge: [],
  },
  residential: {
    small: ['farm', 'farm', 'lumberyard', 'quarry'],
    medium: ['market', 'academy'],
    large: ['academy', 'market'],
    xlarge: [],
  },
  noble: {
    small: ['watchtower', 'watchtower'],
    medium: ['academy', 'market'],
    large: ['castle', 'academy'],
    xlarge: ['castle'],
  },
  mixed: {
    small: ['farm', 'market', 'watchtower', 'lumberyard'],
    medium: ['barracks', 'market', 'lumberyard'],
    large: ['quarry', 'academy', 'iron_mine'],
    xlarge: ['castle'],
  },
};

/**
 * Building size categories matching manifest.json footprints
 * small = 2x2, medium = 3x2, large = 3x3, xlarge = 4x3
 *
 * Decoration / urban furniture categories:
 * greenery: bushes, trees (1x1)
 * sidewalk: benches, hydrants, streetlights (1x1)
 * urban: dumpsters, trash, boxes (1x1)
 * vehicles: cars parked along roads (2x1)
 * traffic: traffic lights at intersections (1x1)
 */
export const SPRITE_IDS = {
  // Medieval decorations
  TREE_OAK: 73,
  TREE_PINE: 74,
  BUSH: 89,
  WELL: 85,
  TORCH: 90,
  HAY_BALE: 91,
  FENCE_WOOD: 50,
  FENCE_STONE: 51,
  CART: 60,
  BARREL: 54,
  CRATE: 56,
  ROCK: 57,
  // Special
  MONUMENT: 36,
} as const;

export const THEME_SPRITES: Record<ParcelTheme, {
  smallBuildings: number[];   // 2x2 footprint
  mediumBuildings: number[];  // 3x2 footprint
  largeBuildings: number[];   // 3x3 footprint
  xlargeBuildings: number[];  // 4x3 footprint
}> = {
  farming: {
    smallBuildings: [1, 2, 3, 4],       // Farms, granaries
    mediumBuildings: [5, 6],             // Lumberyards
    largeBuildings: [7, 8],              // Large farms
    xlargeBuildings: [],
  },
  military: {
    smallBuildings: [9, 10],             // Watchtowers
    mediumBuildings: [11, 12],           // Barracks
    largeBuildings: [13, 14],            // Stables, armories
    xlargeBuildings: [15],               // Fortress
  },
  trade: {
    smallBuildings: [17, 18, 19],        // Shops, stalls
    mediumBuildings: [20, 21],           // Markets
    largeBuildings: [22, 23],            // Warehouses
    xlargeBuildings: [],
  },
  residential: {
    smallBuildings: [25, 26, 27, 28],    // Cottages, houses
    mediumBuildings: [29, 30],           // Townhouses
    largeBuildings: [31, 32],            // Manor houses
    xlargeBuildings: [],
  },
  noble: {
    smallBuildings: [33, 34],            // Guard posts
    mediumBuildings: [35, 36],           // Academy wings
    largeBuildings: [37, 38],            // Castle sections
    xlargeBuildings: [39],               // Grand castle
  },
  mixed: {
    smallBuildings: [1, 2, 17, 18, 25, 26],
    mediumBuildings: [5, 11, 20, 29],
    largeBuildings: [7, 13, 22, 31],
    xlargeBuildings: [15],
  },
};

// ============================================================================
// AI Model to Theme Mapping
// ============================================================================

/**
 * Get parcel theme based on AI model name
 */
export function getThemeForAiModel(aiModel: string): ParcelTheme {
  const normalizedModel = aiModel.toLowerCase();

  if (normalizedModel.startsWith('claude') || normalizedModel.includes('anthropic')) {
    return 'residential';
  }
  if (normalizedModel.startsWith('gpt') || normalizedModel.startsWith('o1') || normalizedModel.startsWith('o3') || normalizedModel.includes('openai')) {
    return 'trade';
  }
  if (normalizedModel.startsWith('gemini') || normalizedModel.includes('google')) {
    return 'farming';
  }
  if (normalizedModel.startsWith('grok') || normalizedModel.includes('xai')) {
    return 'noble';
  }
  if (normalizedModel.startsWith('llama') || normalizedModel.includes('meta') || normalizedModel.includes('deepseek') || normalizedModel.includes('mistral') || normalizedModel.includes('qwen')) {
    return 'military';
  }

  // Default: random theme
  const themes: ParcelTheme[] = ['farming', 'military', 'trade', 'residential', 'noble', 'mixed'];
  return themes[Math.floor(Math.random() * themes.length)];
}

// ============================================================================
// MapData - Main structure (no districts)
// ============================================================================

export interface MapData {
  version: string;
  width: number;
  height: number;
  layers: TileLayer[];
  objects: MapObject[];
  parcels: MapParcel[];
  // City center info
  cityCenter: { x: number; y: number };
  // Road network
  roads: RoadSegment[];
}

export interface RoadSegment {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  type: 'main' | 'secondary';
}

// ============================================================================
// Map Configuration
// ============================================================================

/**
 * Map constants for the 20x20 block system
 *
 * Grid Layout:
 * - 10x10 blocks = 10 * 23 = 230 tiles per dimension
 * - Each block: 20 tiles parcel + 3 tiles road
 * - Block (0,0) at center, reserved for World Monument
 */
export const MAP_CONSTANTS = {
  // Tile dimensions
  TILE_WIDTH: 128,
  TILE_HEIGHT: 64,
  SPRITE_SIZE: 128,

  // Block system settings
  PARCEL_SIZE: 20,      // 20x20 tiles per parcel
  ROAD_WIDTH: 3,        // 3-tile roads between parcels
  BLOCK_SIZE: 23,       // PARCEL_SIZE + ROAD_WIDTH

  // Grid size (10x10 blocks = 230x230 tiles)
  BLOCKS_PER_DIMENSION: 10,
  DEFAULT_GRID_WIDTH: 230,   // 10 * 23
  DEFAULT_GRID_HEIGHT: 230,  // 10 * 23

  // Camera defaults
  DEFAULT_ZOOM: 0.5,
  MIN_ZOOM: 0.2,
  MAX_ZOOM: 2.5,

  // City center in tiles (middle of the grid)
  // For 230x230, center is at 115
  CITY_CENTER_X: 115,
  CITY_CENTER_Y: 115,

  // Block grid offset (where block 0,0 starts in tile coordinates)
  // Center block (0,0) is at the middle
  // Offset = center - half of one block = 115 - 10 = 105
  BLOCK_OFFSET_X: 105,
  BLOCK_OFFSET_Y: 105,

  // Maximum ring (5 rings = covers -5 to +5 blocks from center)
  MAX_RING: 5,
} as const;

// ============================================================================
// Sprite Anchor Data
// ============================================================================

export interface SpriteAnchor {
  spriteId: number;
  width: number;
  height: number;
  anchorY: number;
  footprint: { w: number; h: number };
}

export const DEFAULT_SPRITE_ANCHOR: Omit<SpriteAnchor, 'spriteId'> = {
  width: 128,
  height: 128,
  anchorY: 64,
  footprint: { w: 1, h: 1 },
};

// ============================================================================
// Helper Functions
// ============================================================================

export function createEmptyLayer(
  name: string,
  type: LayerType,
  width: number,
  height: number
): TileLayer {
  return {
    name,
    type,
    visible: true,
    tiles: Array(height).fill(null).map(() => Array(width).fill(TILE_IDS.EMPTY)),
  };
}

export function createGrassLayer(width: number, height: number): TileLayer {
  return {
    name: 'ground',
    type: 'ground',
    visible: true,
    tiles: Array(height).fill(null).map(() => Array(width).fill(TILE_IDS.GRASS)),
  };
}

export function getTileAt(layer: TileLayer, x: number, y: number): number {
  if (y < 0 || y >= layer.tiles.length) return TILE_IDS.EMPTY;
  if (x < 0 || x >= layer.tiles[y].length) return TILE_IDS.EMPTY;
  return layer.tiles[y][x];
}

export function setTileAt(layer: TileLayer, x: number, y: number, tileId: number): void {
  if (y < 0 || y >= layer.tiles.length) return;
  if (x < 0 || x >= layer.tiles[y].length) return;
  layer.tiles[y][x] = tileId;
}

// Seeded helper wrappers (rng passed via closure in generateParcelLayout)
// pickRandom and shuffled are now replaced by seededRandomChoice and seededShuffle

/**
 * Size categories for buildings.
 * small=2x2, medium=3x2, large=3x3, xlarge=4x3 (all in tiles)
 */
type SizeKey = 'small' | 'medium' | 'large' | 'xlarge';

const SIZE_FOOTPRINT: Record<SizeKey, [number, number]> = {
  small: [2, 2],
  medium: [3, 2],
  large: [3, 3],
  xlarge: [4, 3],
};

// ============================================================================
// Zone-based City Block Layout
// ============================================================================
//
// 20×20 parcel divided by a cross-shaped internal road (2 tiles wide):
//
//      0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19
//  0   S  S  S  S  S  S  S  S  S  R  R  S  S  S  S  S  S  S  S  S
//  1   S  .  .  .  .  .  .  .  S  R  R  S  .  .  .  .  .  .  .  S
//  2   S  .  NW QUADRANT    .  S  R  R  S  .  NE QUADRANT    .  S
//  ...
//  7   S  .  .  .  .  .  .  .  S  R  R  S  .  .  .  .  .  .  .  S
//  8   S  S  S  S  S  S  S  S  S  R  R  S  S  S  S  S  S  S  S  S
//  9   R  R  R  R  R  R  R  R  R  +  +  R  R  R  R  R  R  R  R  R
// 10   R  R  R  R  R  R  R  R  R  +  +  R  R  R  R  R  R  R  R  R
// 11   S  S  S  S  S  S  S  S  S  R  R  S  S  S  S  S  S  S  S  S
// 12   S  .  SW QUADRANT    .  S  R  R  S  .  SE QUADRANT    .  S
//  ...
// 18   S  .  .  .  .  .  .  .  S  R  R  S  .  .  .  .  .  .  .  S
// 19   S  S  S  S  S  S  S  S  S  R  R  S  S  S  S  S  S  S  S  S
//
// S = sidewalk (decorations), R = road, + = intersection, . = build zone
// Each quadrant build zone: 7×7 tiles
//   NW: (1,1)→(7,7)   NE: (12,1)→(18,7)
//   SW: (1,12)→(7,18)  SE: (12,12)→(18,18)

/** Quadrant origin + build zone */
const QUADRANT_ORIGINS = [
  { ox: 1, oy: 1 },   // NW
  { ox: 12, oy: 1 },  // NE
  { ox: 1, oy: 12 },  // SW
  { ox: 12, oy: 12 }, // SE
];

/**
 * Quadrant building pattern: each defines 1-3 buildings within a 7×7 zone.
 * Positions are relative to the quadrant origin (0-6 range).
 * Verified to never overlap within the 7×7 area.
 */
interface QSlot { rx: number; ry: number; size: SizeKey }

const Q_PATTERNS = {
  // 2 small houses with diagonal offset
  two_small_diag: [
    { rx: 0, ry: 0, size: 'small' as SizeKey },
    { rx: 4, ry: 4, size: 'small' as SizeKey },
  ],
  // 2 small houses side by side
  two_small_row: [
    { rx: 0, ry: 2, size: 'small' as SizeKey },
    { rx: 4, ry: 2, size: 'small' as SizeKey },
  ],
  // 3 small houses in L-shape
  three_small_L: [
    { rx: 0, ry: 0, size: 'small' as SizeKey },
    { rx: 4, ry: 0, size: 'small' as SizeKey },
    { rx: 0, ry: 4, size: 'small' as SizeKey },
  ],
  // 1 medium building centered
  one_medium: [
    { rx: 2, ry: 2, size: 'medium' as SizeKey },
  ],
  // 1 medium + 1 small
  medium_small: [
    { rx: 0, ry: 0, size: 'medium' as SizeKey },
    { rx: 4, ry: 4, size: 'small' as SizeKey },
  ],
  // 1 large building centered
  one_large: [
    { rx: 2, ry: 2, size: 'large' as SizeKey },
  ],
  // 1 large building corner-aligned
  one_large_corner: [
    { rx: 0, ry: 0, size: 'large' as SizeKey },
  ],
  // 1 xlarge taking most of the quadrant
  one_xlarge: [
    { rx: 1, ry: 2, size: 'xlarge' as SizeKey },
  ],
  // 1 small alone (sparse, park-like)
  one_small: [
    { rx: 2, ry: 2, size: 'small' as SizeKey },
  ],
  // 1 large + watertower-sized slot
  large_plus_small: [
    { rx: 0, ry: 0, size: 'large' as SizeKey },
    { rx: 5, ry: 5, size: 'small' as SizeKey },
  ],
};

/** Each theme defines a pool of 4-quadrant configurations. We pick one randomly. */
const THEME_QUADRANT_POOLS: Record<ParcelTheme, QSlot[][][]> = {
  farming: [
    [ Q_PATTERNS.two_small_diag, Q_PATTERNS.one_medium, Q_PATTERNS.two_small_row, Q_PATTERNS.one_large ],
    [ Q_PATTERNS.three_small_L, Q_PATTERNS.one_medium, Q_PATTERNS.medium_small, Q_PATTERNS.two_small_diag ],
    [ Q_PATTERNS.two_small_row, Q_PATTERNS.two_small_diag, Q_PATTERNS.one_large, Q_PATTERNS.medium_small ],
  ],
  military: [
    [ Q_PATTERNS.one_xlarge, Q_PATTERNS.one_large, Q_PATTERNS.large_plus_small, Q_PATTERNS.one_medium ],
    [ Q_PATTERNS.one_large, Q_PATTERNS.one_xlarge, Q_PATTERNS.one_medium, Q_PATTERNS.large_plus_small ],
    [ Q_PATTERNS.one_large_corner, Q_PATTERNS.one_xlarge, Q_PATTERNS.one_large, Q_PATTERNS.one_medium ],
  ],
  trade: [
    [ Q_PATTERNS.one_large, Q_PATTERNS.medium_small, Q_PATTERNS.one_large_corner, Q_PATTERNS.one_medium ],
    [ Q_PATTERNS.one_medium, Q_PATTERNS.one_large, Q_PATTERNS.medium_small, Q_PATTERNS.one_large_corner ],
    [ Q_PATTERNS.one_large_corner, Q_PATTERNS.one_medium, Q_PATTERNS.one_large, Q_PATTERNS.medium_small ],
  ],
  residential: [
    [ Q_PATTERNS.two_small_diag, Q_PATTERNS.one_medium, Q_PATTERNS.two_small_row, Q_PATTERNS.one_large ],
    [ Q_PATTERNS.three_small_L, Q_PATTERNS.one_medium, Q_PATTERNS.medium_small, Q_PATTERNS.two_small_diag ],
    [ Q_PATTERNS.two_small_row, Q_PATTERNS.two_small_diag, Q_PATTERNS.one_large, Q_PATTERNS.medium_small ],
  ],
  noble: [
    [ Q_PATTERNS.one_medium, Q_PATTERNS.one_small, Q_PATTERNS.one_small, Q_PATTERNS.one_medium ],
    [ Q_PATTERNS.one_small, Q_PATTERNS.one_medium, Q_PATTERNS.one_medium, Q_PATTERNS.one_small ],
    [ Q_PATTERNS.two_small_diag, Q_PATTERNS.one_medium, Q_PATTERNS.one_medium, Q_PATTERNS.two_small_diag ],
  ],
  mixed: [
    [ Q_PATTERNS.one_large, Q_PATTERNS.two_small_diag, Q_PATTERNS.one_medium, Q_PATTERNS.medium_small ],
    [ Q_PATTERNS.one_xlarge, Q_PATTERNS.one_small, Q_PATTERNS.one_large_corner, Q_PATTERNS.two_small_row ],
    [ Q_PATTERNS.medium_small, Q_PATTERNS.one_large, Q_PATTERNS.two_small_diag, Q_PATTERNS.one_medium ],
  ],
};

/**
 * Generate a realistic city-block layout for a 20×20 parcel.
 *
 * Architecture:
 * 1. Cross-shaped 2-tile-wide internal road divides parcel into 4 quadrants
 * 2. 1-tile sidewalk buffer between buildings and roads
 * 3. Each quadrant (7×7) gets 1-3 buildings based on theme
 * 4. Sidewalks populated with streetlights, benches, fire hydrants
 * 5. Roads get parked cars and traffic lights at intersection
 * 6. Open spaces in quadrants filled with trees, bushes, dumpsters
 *
 * Adjacency rules:
 * - Streetlights: along roads every 4 tiles, along parcel edges
 * - Benches: on sidewalks facing roads
 * - Fire hydrants: sidewalk corners near roads
 * - Cars: parked along road edges (not in intersection)
 * - Traffic lights: 3 corners of intersection
 * - Dumpsters/trash/boxes: behind buildings (away from road)
 * - Trees/bushes: open spaces in quadrants, along parcel edges
 */
export function generateParcelLayout(theme: ParcelTheme, seed: string): ParcelLayout {
  const rng = createSeededRng(seed);
  const sprites = THEME_SPRITES[theme];

  // --- Occupancy grid (prevents overlaps) ---
  const grid: boolean[][] = Array.from({ length: 20 }, () => Array(20).fill(false));

  function markOccupied(x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const gx = x + dx, gy = y + dy;
        if (gx >= 0 && gx < 20 && gy >= 0 && gy < 20) grid[gy][gx] = true;
      }
    }
  }

  function isOccupied(x: number, y: number): boolean {
    return x < 0 || x >= 20 || y < 0 || y >= 20 || grid[y][x];
  }

  function canPlace(x: number, y: number, w: number, h: number): boolean {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (isOccupied(x + dx, y + dy)) return false;
      }
    }
    return true;
  }

  // Mark roads as occupied (cross: x=9-10 and y=9-10)
  for (let i = 0; i < 20; i++) {
    markOccupied(9, i, 2, 1);  // vertical road
    markOccupied(i, 9, 1, 2);  // horizontal road
  }

  // Mark sidewalks as occupied (border tiles: row/col 0, 8, 11, 19)
  for (let i = 0; i < 20; i++) {
    grid[0][i] = true; grid[8][i] = true;
    grid[11][i] = true; grid[19][i] = true;
    grid[i][0] = true; grid[i][8] = true;
    grid[i][11] = true; grid[i][19] = true;
  }

  // --- STEP 1: Select building sprite + type by size ---
  const buildingTypes = THEME_BUILDING_TYPES[theme];

  function getBuildingForSize(size: SizeKey): { spriteId: number; buildingType: string } {
    // Get building type from theme mapping
    const typePool = buildingTypes[size].length > 0 ? buildingTypes[size] : buildingTypes.small;
    const buildingType = seededRandomChoice(rng, typePool);

    // Get sprite from legacy sprite pool
    let spriteId: number;
    switch (size) {
      case 'small': spriteId = seededRandomChoice(rng, sprites.smallBuildings); break;
      case 'medium': spriteId = sprites.mediumBuildings.length > 0 ? seededRandomChoice(rng, sprites.mediumBuildings) : seededRandomChoice(rng, sprites.smallBuildings); break;
      case 'large': spriteId = sprites.largeBuildings.length > 0 ? seededRandomChoice(rng, sprites.largeBuildings) : seededRandomChoice(rng, sprites.smallBuildings); break;
      case 'xlarge': spriteId = sprites.xlargeBuildings.length > 0 ? seededRandomChoice(rng, sprites.xlargeBuildings) : (sprites.largeBuildings.length > 0 ? seededRandomChoice(rng, sprites.largeBuildings) : seededRandomChoice(rng, sprites.smallBuildings)); break;
    }

    return { spriteId, buildingType };
  }

  // --- STEP 2: Place buildings in quadrants ---
  const allBuildings: ParcelBuilding[] = [];
  const pool = THEME_QUADRANT_POOLS[theme];
  const selectedConfig = seededRandomChoice(rng, pool);
  let buildingIdx = 0;

  for (let q = 0; q < 4; q++) {
    const origin = QUADRANT_ORIGINS[q];
    const slots = selectedConfig[q];

    for (const slot of slots) {
      const x = origin.ox + slot.rx;
      const y = origin.oy + slot.ry;
      const [fw, fh] = SIZE_FOOTPRINT[slot.size];

      // Verify no overlap (should be guaranteed by design, but safety check)
      if (!canPlace(x, y, fw, fh)) continue;

      markOccupied(x, y, fw, fh);
      const { spriteId, buildingType } = getBuildingForSize(slot.size);
      allBuildings.push({
        localX: x,
        localY: y,
        spriteId,
        buildingType,
        name: buildingType,
        level: 1 + Math.floor(rng() * 3),
      });
      buildingIdx++;
    }
  }

  // Cap to max 7 buildings (optimized for 20x20 parcel based on Blender prototyping)
  const MAX_BUILDINGS = 7;
  if (allBuildings.length > MAX_BUILDINGS) {
    allBuildings.splice(MAX_BUILDINGS);
  }

  const mainBuilding = allBuildings[0] ?? {
    localX: 3, localY: 3, spriteId: seededRandomChoice(rng, sprites.smallBuildings), buildingType: 'farm', name: 'farm', level: 2,
  };
  const secondaryBuildings = allBuildings.slice(1);

  // No decorations — parcels have buildings only; empty tiles are filled
  // client-side with base.gltf ground tiles
  const decorations: ParcelDecoration[] = [];

  // --- STEP 4: Ground tiles (internal roads) ---
  const groundTiles: ParcelGroundTile[] = [];
  // Vertical road (x=9-10, full height)
  for (let y = 0; y < 20; y++) {
    groundTiles.push({ localX: 9, localY: y, tileId: TILE_IDS.PATH_STONE });
    groundTiles.push({ localX: 10, localY: y, tileId: TILE_IDS.PATH_STONE });
  }
  // Horizontal road (y=9-10, full width)
  for (let x = 0; x < 20; x++) {
    groundTiles.push({ localX: x, localY: 9, tileId: TILE_IDS.PATH_STONE });
    groundTiles.push({ localX: x, localY: 10, tileId: TILE_IDS.PATH_STONE });
  }

  return {
    mainBuilding,
    secondaryBuildings,
    decorations,
    groundTiles,
    hasFence: true,
    fenceType: theme === 'military' ? 'iron' : theme === 'noble' ? 'stone' : 'wood',
  };
}

// ============================================================================
// Block Coordinate Utilities
// ============================================================================

/**
 * Convert block coordinates to tile coordinates
 */
export function blockToTileCoords(blockX: number, blockY: number): { x: number; y: number } {
  return {
    x: MAP_CONSTANTS.BLOCK_OFFSET_X + blockX * MAP_CONSTANTS.BLOCK_SIZE,
    y: MAP_CONSTANTS.BLOCK_OFFSET_Y + blockY * MAP_CONSTANTS.BLOCK_SIZE,
  };
}

/**
 * Convert tile coordinates to block coordinates
 */
export function tileToBlockCoords(tileX: number, tileY: number): { blockX: number; blockY: number } {
  return {
    blockX: Math.floor((tileX - MAP_CONSTANTS.BLOCK_OFFSET_X) / MAP_CONSTANTS.BLOCK_SIZE),
    blockY: Math.floor((tileY - MAP_CONSTANTS.BLOCK_OFFSET_Y) / MAP_CONSTANTS.BLOCK_SIZE),
  };
}

/**
 * Get ring expansion positions around center (0,0)
 * Ring 1: 8 positions around center
 * Ring 2: 16 positions
 * etc.
 */
export function getBlocksInRing(ring: number): Array<{ blockX: number; blockY: number }> {
  if (ring === 0) {
    return [{ blockX: 0, blockY: 0 }];
  }

  const blocks: Array<{ blockX: number; blockY: number }> = [];

  // Top row (left to right)
  for (let x = -ring; x <= ring; x++) {
    blocks.push({ blockX: x, blockY: -ring });
  }
  // Right column (top+1 to bottom-1)
  for (let y = -ring + 1; y < ring; y++) {
    blocks.push({ blockX: ring, blockY: y });
  }
  // Bottom row (right to left)
  for (let x = ring; x >= -ring; x--) {
    blocks.push({ blockX: x, blockY: ring });
  }
  // Left column (bottom-1 to top+1)
  for (let y = ring - 1; y > -ring; y--) {
    blocks.push({ blockX: -ring, blockY: y });
  }

  return blocks;
}

/**
 * Find next available block using ring expansion pattern
 */
export function findNextAvailableBlock(
  occupiedBlocks: Set<string>
): { blockX: number; blockY: number } | null {
  // Block (0,0) is reserved for World Monument
  const reserved = new Set(['0,0']);

  for (let ring = 1; ring <= MAP_CONSTANTS.MAX_RING; ring++) {
    const blocks = getBlocksInRing(ring);
    for (const block of blocks) {
      const key = `${block.blockX},${block.blockY}`;
      if (!occupiedBlocks.has(key) && !reserved.has(key)) {
        return block;
      }
    }
  }

  return null; // No available blocks
}

/**
 * Get road tile ID based on connectivity
 * n=north, s=south, e=east, w=west (true if connected to road in that direction)
 */
export function getRoadTileId(n: boolean, s: boolean, e: boolean, w: boolean): number {
  if (n && s && e && w) return TILE_IDS.ROAD_CROSS;        // 106
  if (n && s && e) return TILE_IDS.ROAD_T_WEST;            // 110
  if (n && s && w) return TILE_IDS.ROAD_T_EAST;            // 109
  if (e && w && n) return TILE_IDS.ROAD_T_SOUTH;           // 108
  if (e && w && s) return TILE_IDS.ROAD_T_NORTH;           // 107
  if (n && s) return TILE_IDS.ROAD_STRAIGHT_V;             // 101
  if (e && w) return TILE_IDS.ROAD_STRAIGHT_H;             // 100
  if (n && e) return TILE_IDS.ROAD_CORNER_SW;              // 105
  if (n && w) return TILE_IDS.ROAD_CORNER_SE;              // 104
  if (s && e) return TILE_IDS.ROAD_CORNER_NW;              // 103
  if (s && w) return TILE_IDS.ROAD_CORNER_NE;              // 102
  if (n) return TILE_IDS.ROAD_END_SOUTH;                   // 112
  if (s) return TILE_IDS.ROAD_END_NORTH;                   // 111
  if (e) return TILE_IDS.ROAD_END_WEST;                    // 114
  if (w) return TILE_IDS.ROAD_END_EAST;                    // 113
  return TILE_IDS.ROAD_STRAIGHT_H;                         // Default
}
