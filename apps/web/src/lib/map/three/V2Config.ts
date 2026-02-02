/**
 * V2Config - Infinitown-style city renderer configuration
 *
 * Architecture:
 *  - Pre-composed blocks (60×60 units) loaded as complete GLB scenes
 *  - Road lanes (15×60) and intersections (15×15) placed around blocks
 *  - Chunk = block + surrounding roads = 75×75 units
 *  - 7×7 visible chunks, wrap-around for infinite illusion
 */

// ============ CHUNK DIMENSIONS ============

export const TILE = 15;              // Base tile unit
export const BLOCK_SIZE = 60;        // 4×4 tiles = one pre-composed block
export const ROAD_WIDTH = 15;        // 1-tile road lane
export const CHUNK_SIZE = BLOCK_SIZE + ROAD_WIDTH; // 75 units per chunk

// Grid of visible chunks
export const CHUNK_COUNT = 7;        // 7×7 visible grid
export const TABLE_SIZE = 9;         // 9×9 virtual table for variety (wraps around)

// ============ CAMERA (Infinitown-style perspective) ============

export const CAMERA_FOV = 30;
export const CAMERA_NEAR = 10;
export const CAMERA_FAR = 600;

// Camera position: elevated isometric view
export const CAMERA_HEIGHT = 200;     // Infinitown: 200, then lerps to targetHeight
export const CAMERA_OFFSET_X = 80;
export const CAMERA_OFFSET_Z = 80;

export const ZOOM_MIN_HEIGHT = 30;    // Closest zoom
export const ZOOM_MAX_HEIGHT = 200;   // Farthest zoom (default)

// Controls: Infinitown uses PAN_SPEED=0.1, lerp=0.05
export const PAN_SPEED = 0.1;
export const PAN_LERP = 0.05;
export const ZOOM_LERP = 0.05;

// ============ FOG ============

export const FOG_COLOR = 0xA2CEDF;    // Light blue-gray (Infinitown: 0xA30DFF ≈ 10676479)
export const FOG_NEAR = 225;          // Infinitown: 225
export const FOG_FAR = 325;           // Infinitown: 325

// ============ SHADOWS ============

export const SHADOWMAP_RESOLUTION = 2048;
export const DIR_LIGHT_COLOR = 0xFFE8C0;
export const DIR_LIGHT_INTENSITY = 1.25;

// ============ ASSETS ============

export const ASSET_BASE = '/assets/city/';

// Block types available
export const BLOCK_TYPES = [
  'block_residential.glb',
  'block_commercial.glb',
  'block_park.glb',
];

// Road assets
export const ROAD_LANE_NS = 'road_lane.glb';       // 15×60 vertical road
export const ROAD_LANE_EW = 'road_lane_ew.glb';    // 60×15 horizontal road
export const ROAD_INTERSECTION = 'road_004.glb';    // 15×15 crossroad

// ============ TYPES ============

export interface HoverInfo {
  chunkX: number;
  chunkZ: number;
  worldX: number;
  worldZ: number;
}

export interface CityRendererV2Callbacks {
  onHover?: (hover: HoverInfo | null) => void;
  onClick?: (hover: HoverInfo) => void;
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
}
