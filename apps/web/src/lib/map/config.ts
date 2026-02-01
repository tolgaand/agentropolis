// Map configuration constants

// Block-based grid constants (20x20 parcels with 3-tile roads)
export const BLOCK_SIZE = 20;       // 20x20 tiles per parcel
export const ROAD_SIZE = 3;         // 3-tile wide roads between parcels
export const BLOCK_STRIDE = 23;     // BLOCK_SIZE + ROAD_SIZE = total stride
export const CHUNK_SIZE_BLOCKS = 4; // 4x4 blocks per chunk
export const CHUNK_SIZE_TILES = BLOCK_STRIDE * CHUNK_SIZE_BLOCKS; // 92 tiles per chunk

// Block offset from world origin (matches backend MAP_CONSTANTS)
// Block (0,0) starts at tile (BLOCK_OFFSET_X, BLOCK_OFFSET_Y)
export const BLOCK_OFFSET_X = 105;
export const BLOCK_OFFSET_Y = 105;

export const MAP_CONFIG = {
  // Tile dimensions
  TILE_WIDTH: 128,
  TILE_HEIGHT: 64,
  SPRITE_HEIGHT: 128,

  // Grid size
  GRID_WIDTH: 30,
  GRID_HEIGHT: 30,

  // Camera
  MIN_ZOOM: 0.25,
  MAX_ZOOM: 2.5,
  DEFAULT_ZOOM: 0.6,
  ZOOM_SPEED: 0.1,
  PAN_FRICTION: 0.92, // Inertia decay

  // Visual style - gradient background for sky effect
  BACKGROUND_COLOR: '#1e2a3a',
  BACKGROUND_GRADIENT: {
    top: '#2c3e50',
    bottom: '#1a252f',
  },

  // Ground colors with 3D faces (top, left shadow, right highlight)
  GROUND_COLORS: {
    base: {
      top: '#4a7c3f',
      left: '#3d6634',
      right: '#5a8f4f',
    },
    light: {
      top: '#5a8c4f',
      left: '#4d7644',
      right: '#6a9f5f',
    },
  },

  // Parcel ground colors - brown/tan for owned land
  PARCEL_GROUND_COLORS: {
    top: '#8b7355',
    left: '#6b5a45',
    right: '#a08868',
  },

  // District theme colors - more saturated and distinct
  DISTRICT_COLORS: {
    academic: {
      ground: { top: '#3a5a7a', left: '#2d4a6a', right: '#4a6a8a' },
      accent: '#7eb8d8',
      gridLine: 'rgba(126, 184, 216, 0.3)',
    },
    industrial: {
      ground: { top: '#5a5a6a', left: '#4a4a5a', right: '#6a6a7a' },
      accent: '#a0a0b0',
      gridLine: 'rgba(160, 160, 176, 0.3)',
    },
    nature: {
      ground: { top: '#3a6a4a', left: '#2d5a3d', right: '#4a7a5a' },
      accent: '#8cd89c',
      gridLine: 'rgba(140, 216, 156, 0.3)',
    },
    mixed: {
      ground: { top: '#7a6a5a', left: '#6a5a4a', right: '#8a7a6a' },
      accent: '#d8c8a8',
      gridLine: 'rgba(216, 200, 168, 0.3)',
    },
  } as Record<string, {
    ground: { top: string; left: string; right: string };
    accent: string;
    gridLine: string;
  }>,

  // Shadow - softer, more realistic
  SHADOW_COLOR: 'rgba(0, 0, 0, 0.35)',
  SHADOW_BLUR: 12,
  SHADOW_OFFSET_X: 15,
  SHADOW_OFFSET_Y: 8,

  // Highlight
  HOVER_COLOR: 'rgba(255, 255, 255, 0.5)',
  HOVER_FILL: 'rgba(255, 255, 255, 0.1)',
  LANDMARK_GLOW: 'rgba(255, 220, 100, 0.4)',

  // Grid lines
  GRID_LINE_COLOR: 'rgba(255, 255, 255, 0.08)',
  GRID_LINE_WIDTH: 0.5,

  // UI
  LABEL_FONT: 'bold 14px "Inter", system-ui, sans-serif',
  LABEL_COLOR: 'rgba(255, 255, 255, 0.9)',
  LABEL_SHADOW: 'rgba(0, 0, 0, 0.8)',

  // Vignette - reduced intensity
  VIGNETTE_INNER_RADIUS: 0.4,
  VIGNETTE_OUTER_RADIUS: 0.9,
  VIGNETTE_OPACITY: 0.25,
} as const;
