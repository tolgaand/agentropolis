import { MAP_CONFIG, BLOCK_STRIDE, BLOCK_SIZE, BLOCK_OFFSET_X, BLOCK_OFFSET_Y } from './config';

const { TILE_WIDTH, TILE_HEIGHT } = MAP_CONFIG;
const HALF_TILE_W = TILE_WIDTH / 2;
const HALF_TILE_H = TILE_HEIGHT / 2;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface GridPoint {
  x: number;
  y: number;
}

/**
 * Convert grid coordinates to screen (pixel) coordinates
 * Isometric projection: screen.x = (grid.x - grid.y) * halfWidth
 *                       screen.y = (grid.x + grid.y) * halfHeight
 */
export function gridToScreen(gridX: number, gridY: number): ScreenPoint {
  return {
    x: (gridX - gridY) * HALF_TILE_W,
    y: (gridX + gridY) * HALF_TILE_H,
  };
}

/**
 * Convert screen coordinates to grid coordinates (for mouse picking)
 * Inverse of isometric projection
 * Note: Added small epsilon to avoid off-by-one errors at tile boundaries
 */
export function screenToGrid(screenX: number, screenY: number): GridPoint {
  // For isometric 2:1 projection, we need to account for the tile center
  // The screen origin of a tile at (gx, gy) is at the LEFT corner of the diamond
  // We need to offset to tile center for proper hit detection
  const centeredX = screenX - HALF_TILE_W;
  const centeredY = screenY - HALF_TILE_H;

  const gx = (centeredX / HALF_TILE_W + centeredY / HALF_TILE_H) / 2;
  const gy = (centeredY / HALF_TILE_H - centeredX / HALF_TILE_W) / 2;

  // Add tiny epsilon to avoid floating point boundary issues
  return {
    x: Math.floor(gx + 1e-6),
    y: Math.floor(gy + 1e-6),
  };
}

/**
 * Check if grid coordinates are within map bounds
 */
export function isInBounds(gridX: number, gridY: number): boolean {
  return (
    gridX >= 0 &&
    gridX < MAP_CONFIG.GRID_WIDTH &&
    gridY >= 0 &&
    gridY < MAP_CONFIG.GRID_HEIGHT
  );
}

/**
 * Get draw order for Y-sorting (painter's algorithm)
 * Higher values = draw later (on top)
 */
export function getDrawOrder(gridX: number, gridY: number): number {
  return gridX + gridY;
}

/**
 * Get the screen Y position for drawing (accounts for sprite height)
 */
export function getDrawY(screenY: number): number {
  return screenY - (MAP_CONFIG.SPRITE_HEIGHT - TILE_HEIGHT);
}

// ============================================================================
// Three.js 3D Coordinate System
// Grid(x, y) → World3D(x * TILE_SIZE, 0, y * TILE_SIZE)
// ============================================================================

export interface World3DPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Convert grid coordinates to Three.js world coordinates
 * Grid Y maps to World Z; World Y is always 0 (ground level)
 * tileSize defaults to 1 (ThreeConfig.TILE_SIZE)
 */
export function gridToWorld3D(gridX: number, gridY: number, tileSize = 1): World3DPoint {
  return {
    x: gridX * tileSize,
    y: 0,
    z: gridY * tileSize,
  };
}

/**
 * Convert Three.js world coordinates back to grid coordinates
 * World Z maps to Grid Y; World Y is ignored
 */
export function world3DToGrid(worldX: number, worldZ: number, tileSize = 1): GridPoint {
  return {
    x: Math.floor(worldX / tileSize + 1e-6),
    y: Math.floor(worldZ / tileSize + 1e-6),
  };
}

// ============================================================================
// Block Coordinate System (20x20 parcels with 3-tile roads)
// ============================================================================

export interface BlockCoord {
  blockX: number;
  blockY: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  vx?: number;
  vy?: number;
}

/**
 * Convert block coordinates to world (tile) coordinates
 * Each block starts at (BLOCK_OFFSET + blockX * BLOCK_STRIDE)
 */
export function blockToWorld(block: BlockCoord): GridPoint {
  return {
    x: BLOCK_OFFSET_X + block.blockX * BLOCK_STRIDE,
    y: BLOCK_OFFSET_Y + block.blockY * BLOCK_STRIDE,
  };
}

/**
 * Convert world (tile) coordinates to block coordinates
 */
export function worldToBlock(x: number, y: number): BlockCoord {
  return {
    blockX: Math.floor((x - BLOCK_OFFSET_X) / BLOCK_STRIDE),
    blockY: Math.floor((y - BLOCK_OFFSET_Y) / BLOCK_STRIDE),
  };
}

/**
 * Convert screen coordinates to block coordinates
 */
export function screenToBlock(screenX: number, screenY: number, camera: Camera): BlockCoord {
  const worldX = (screenX - camera.x) / camera.zoom;
  const worldY = (screenY - camera.y) / camera.zoom;
  const grid = screenToGrid(worldX, worldY);
  return worldToBlock(grid.x, grid.y);
}

/**
 * Get the screen diamond corners of a parcel (20x20 tile block)
 * Returns the 4 corners of the isometric diamond in screen coordinates
 */
export function getParcelScreenBounds(block: BlockCoord): {
  north: ScreenPoint;  // Top of screen (top corner of NW tile)
  east: ScreenPoint;   // Right of screen (right corner of NE tile)
  south: ScreenPoint;  // Bottom of screen (bottom corner of SE tile)
  west: ScreenPoint;   // Left of screen (left corner of SW tile)
  // Legacy aliases for backwards compatibility
  topLeft: ScreenPoint;
  topRight: ScreenPoint;
  bottomRight: ScreenPoint;
  bottomLeft: ScreenPoint;
} {
  const worldPos = blockToWorld(block);
  const lastTileX = worldPos.x + BLOCK_SIZE - 1;
  const lastTileY = worldPos.y + BLOCK_SIZE - 1;

  // Get screen positions of the 4 corner tiles
  const nwTileScreen = gridToScreen(worldPos.x, worldPos.y);
  const neTileScreen = gridToScreen(lastTileX, worldPos.y);
  const seTileScreen = gridToScreen(lastTileX, lastTileY);
  const swTileScreen = gridToScreen(worldPos.x, lastTileY);

  // Calculate actual screen corner points of the parcel diamond
  const north = { x: nwTileScreen.x + HALF_TILE_W, y: nwTileScreen.y };
  const east = { x: neTileScreen.x + TILE_WIDTH, y: neTileScreen.y + HALF_TILE_H };
  const south = { x: seTileScreen.x + HALF_TILE_W, y: seTileScreen.y + TILE_HEIGHT };
  const west = { x: swTileScreen.x, y: swTileScreen.y + HALF_TILE_H };

  return {
    north,
    east,
    south,
    west,
    // Legacy aliases
    topLeft: north,
    topRight: east,
    bottomRight: south,
    bottomLeft: west,
  };
}

/**
 * Check if a tile position is within a parcel (not on roads)
 */
export function isInParcel(x: number, y: number): boolean {
  const localX = ((x - BLOCK_OFFSET_X) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;
  const localY = ((y - BLOCK_OFFSET_Y) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;
  return localX < BLOCK_SIZE && localY < BLOCK_SIZE;
}

/**
 * Check if a tile position is on a road
 */
export function isOnRoad(x: number, y: number): boolean {
  const localX = ((x - BLOCK_OFFSET_X) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;
  const localY = ((y - BLOCK_OFFSET_Y) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE;
  return localX >= BLOCK_SIZE || localY >= BLOCK_SIZE;
}

/**
 * Get local position within a parcel (0-19 for each axis)
 */
export function getLocalParcelPosition(x: number, y: number): { localX: number; localY: number } | null {
  if (!isInParcel(x, y)) return null;
  return {
    localX: ((x - BLOCK_OFFSET_X) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE,
    localY: ((y - BLOCK_OFFSET_Y) % BLOCK_STRIDE + BLOCK_STRIDE) % BLOCK_STRIDE,
  };
}
