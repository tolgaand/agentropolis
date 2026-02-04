/**
 * V2Config - Infinitown-style city renderer configuration
 *
 * Architecture:
 *  - Individual GLB assets composed at runtime via InstancedMesh
 *  - Each chunk = 16x16 tile grid (roads every 4 tiles + 3x3 buildable blocks)
 *  - 5x5 visible chunks, 7x7 virtual table with wrap-around
 *  - Chunk = 240x240 units (16 tiles * 15 units each)
 */

// ============ CHUNK DIMENSIONS ============

export const TILE = 15;              // Base tile unit
export const TILES_PER_CHUNK = 16;   // 16x16 tile grid per chunk
export const CHUNK_SIZE = TILE * TILES_PER_CHUNK; // 240 units per chunk
export const ROAD_INTERVAL = 4;      // Road every 4 tiles (at 0, 4, 8, 12)
export const BLOCK_TILES = 3;        // 3x3 buildable area between roads

// Grid of visible chunks
export const CHUNK_COUNT = 5;        // 5x5 visible grid
export const TABLE_SIZE = 7;         // 7x7 virtual table for variety (wraps around)

// ============ CAMERA (Infinitown-style perspective) ============

export const CAMERA_FOV = 30;
export const CAMERA_NEAR = 10;
export const CAMERA_FAR = 800;

// Camera position: elevated isometric view
export const CAMERA_HEIGHT = 300;     // Start height for larger chunks
export const CAMERA_OFFSET_X = 120;
export const CAMERA_OFFSET_Z = 120;

export const ZOOM_MIN_HEIGHT = 40;    // Closest zoom
export const ZOOM_MAX_HEIGHT = 300;   // Farthest zoom (default)

// Controls: Infinitown uses PAN_SPEED=0.1, lerp=0.05
export const PAN_SPEED = 0.1;
export const PAN_LERP = 0.05;
export const ZOOM_LERP = 0.05;

// ============ FOG ============

export const FOG_COLOR = 0xd8dce0;    // Neutral light grey
export const FOG_NEAR = 350;
export const FOG_FAR = 500;

// ============ SHADOWS ============

export const SHADOWMAP_RESOLUTION = 2048;
export const DIR_LIGHT_COLOR = 0xFFE8C0;
export const DIR_LIGHT_INTENSITY = 1.25;

// ============ ASSETS ============

export const ASSET_BASE = '/assets/city/';

export interface AssetMeta {
  file: string;
  type: 'ground' | 'road' | 'building' | 'prop';
  tileW: number;  // width in tiles (1, 2, 3...)
  tileD: number;  // depth in tiles
  zone?: ('residential' | 'commercial' | 'park')[];
}

export const ASSET_REGISTRY: Record<string, AssetMeta> = {
  // Ground tiles
  asphalt:    { file: 'asphalt_001.glb',            type: 'ground', tileW: 1, tileD: 1 },
  grass:      { file: 'grass_001.glb',              type: 'ground', tileW: 1, tileD: 1 },
  platform:   { file: 'building_platform_002.glb',  type: 'ground', tileW: 1, tileD: 1 },

  // Road tiles
  road_ns:    { file: 'road_001.glb', type: 'road', tileW: 1, tileD: 1 },
  road_ew:    { file: 'road_002.glb', type: 'road', tileW: 1, tileD: 1 },
  road_t:     { file: 'road_003.glb', type: 'road', tileW: 1, tileD: 1 },
  road_cross: { file: 'road_004.glb', type: 'road', tileW: 1, tileD: 1 },

  // Residential buildings (1x1)
  residential_01: { file: 'residental_building_001.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_02: { file: 'residental_building_002.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_03: { file: 'residental_building_003.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_04: { file: 'residental_building_004.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_05: { file: 'residental_building_005.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_06: { file: 'residental_building_006.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_07: { file: 'residental_building_007.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_08: { file: 'residental_building_008.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_09: { file: 'residental_building_009.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },
  residential_10: { file: 'residental_building_010.glb', type: 'building', tileW: 1, tileD: 1, zone: ['residential'] },

  // Elite residential (taller, varied sizes)
  elite_res_02: { file: 'elite_residental_building_002.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },
  elite_res_05: { file: 'elite_residental_building_005.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },
  elite_res_06: { file: 'elite_residental_building_006.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },
  elite_res_07: { file: 'elite_residental_building_007.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },
  elite_res_03: { file: 'elite_residental_building_003.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },
  elite_res_04: { file: 'elite_residental_building_004.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },
  elite_res_08: { file: 'elite_residental_building_008.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },
  elite_res_09: { file: 'elite_residental_building_009.glb', type: 'building', tileW: 2, tileD: 2, zone: ['residential'] },

  // Shopping / commercial (1x1)
  coffee:          { file: 'coffee_shop_001.glb',     type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  bar:             { file: 'bar_001.glb',             type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  barbershop:      { file: 'barbershop_001.glb',      type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  burger_shop:     { file: 'burger_shop_001.glb',     type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  cinema:          { file: 'cinema_001.glb',          type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  fastfood:        { file: 'fastfood_001.glb',        type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  ice_cream_shop:  { file: 'ice_cream_shop_001.glb',  type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  library:         { file: 'library_001.glb',         type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  pizzeria:        { file: 'pizzeria_001.glb',        type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  tool_store:      { file: 'tool_store_001.glb',      type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  biz_center_04:   { file: 'business_center_004.glb', type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },

  // Shopping / commercial (2x1 or 2x2)
  gym:             { file: 'gym_001.glb',             type: 'building', tileW: 2, tileD: 1, zone: ['commercial'] },
  music_store:     { file: 'music_store_001.glb',     type: 'building', tileW: 2, tileD: 1, zone: ['commercial'] },
  supermarket_02:  { file: 'supermarket_002.glb',     type: 'building', tileW: 2, tileD: 1, zone: ['commercial'] },
  supermarket_03:  { file: 'supermarket_003.glb',     type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },
  school:          { file: 'school_001.glb',          type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },
  supermarket_01:  { file: 'supermarket_001.glb',     type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },
  police:          { file: 'police_department_001.glb', type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },
  casino:          { file: 'casino_001.glb',          type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },

  // Business center / skyscrapers
  skyscraper:      { file: 'skyscraper_002.glb',       type: 'building', tileW: 1, tileD: 1, zone: ['commercial'] },
  biz_center_02:   { file: 'business_center_002.glb',  type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },
  biz_center_03:   { file: 'business_center_003.glb',  type: 'building', tileW: 2, tileD: 1, zone: ['commercial'] },
  biz_center_05:   { file: 'business_center_005.glb',  type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },
  biz_center_01:   { file: 'business_center_001.glb',  type: 'building', tileW: 2, tileD: 2, zone: ['commercial'] },

  // Props
  tree:        { file: 'tree_012.glb',      type: 'prop', tileW: 1, tileD: 1 },
  tree_13:     { file: 'tree_013.glb',      type: 'prop', tileW: 1, tileD: 1 },
  tree_16:     { file: 'tree_016.glb',      type: 'prop', tileW: 1, tileD: 1 },
  tree_17:     { file: 'tree_017.glb',      type: 'prop', tileW: 1, tileD: 1 },
  bench:       { file: 'bench_001.glb',     type: 'prop', tileW: 1, tileD: 1 },
  lamp:        { file: 'lamp_post_001.glb', type: 'prop', tileW: 1, tileD: 1 },
  lamp_02:     { file: 'lamp_post_002.glb', type: 'prop', tileW: 1, tileD: 1 },
  bush_01:     { file: 'bush_001.glb',      type: 'prop', tileW: 1, tileD: 1 },
  bush_02:     { file: 'bush_002.glb',      type: 'prop', tileW: 1, tileD: 1 },
  bush_03:     { file: 'bush_003.glb',      type: 'prop', tileW: 1, tileD: 1 },
  fountain_01: { file: 'fountain_001.glb',  type: 'prop', tileW: 1, tileD: 1 },
  fountain_02: { file: 'fountain_002.glb',  type: 'prop', tileW: 1, tileD: 1 },
  hydrant:     { file: 'hydrant_001.glb',   type: 'prop', tileW: 1, tileD: 1 },
  trash:       { file: 'trash_001.glb',     type: 'prop', tileW: 1, tileD: 1 },
  monument:    { file: 'monument_001.glb',  type: 'prop', tileW: 1, tileD: 1 },
  phone_booth: { file: 'phone_booth_001.glb', type: 'prop', tileW: 1, tileD: 1 },
};

// ============ TYPES ============

export interface HoverInfo {
  chunkX: number;
  chunkZ: number;
  worldX: number;
  worldZ: number;
  localX: number;
  localZ: number;
  zone: string;
  district: string;
  districtId: number;
  landPrice: number;
  demandIndex: number;
  buildable: boolean;
  isRoad: boolean;
  building?: string;
  buildingId?: string;
  owner?: string;
  /** Screen-space CSS pixel position of the hovered tile center */
  screenX: number;
  screenY: number;
}

export interface CityRendererV2Callbacks {
  onHover?: (hover: HoverInfo | null) => void;
  onClick?: (hover: HoverInfo) => void;
}

export interface Placement {
  assetKey: string;      // ASSET_REGISTRY key
  tileX: number;         // 0-15 within chunk
  tileZ: number;         // 0-15 within chunk
  rotation?: number;     // radians: 0, PI/2, PI, 3*PI/2
}

// ============ PRNG ============

export class SeededRandom {
  private seed: number;
  constructor(seed = 42) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  reset(seed = 42): void { this.seed = seed; }
  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  /** Shuffle array in place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
