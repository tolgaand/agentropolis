/**
 * ThreeConfig - Constants for Three.js 3D isometric renderer
 */

// Isometric camera angles (true isometric)
export const ISO_ROTATION_Y = Math.PI / 4;                   // 45 degrees
export const ISO_ROTATION_X = Math.atan(1 / Math.SQRT2);     // ~35.264 degrees

// Camera defaults
// With frustum=50, zoom=1 shows ~100*aspect tiles wide (~150 tiles at 1.5 aspect)
export const CAMERA_ZOOM_DEFAULT = 5.0;  // Fixed at 500% zoom
export const CAMERA_ZOOM_MIN = 5.0;     // Locked — no zoom out
export const CAMERA_ZOOM_MAX = 5.0;     // Locked — no zoom in
export const CAMERA_FRUSTUM = 100; // Base frustum size (adjusted by aspect)
export const PAN_FRICTION = 0.92;
export const PAN_SPEED = 0.15;
export const ZOOM_LERP_FACTOR = 0.15;
export const ZOOM_STEP_FACTOR = 0.08;

// Tile geometry
export const TILE_SIZE = 1;       // 1 world unit per tile
export const TILE_DEPTH = 0.15;   // Prism depth for ground tiles
// Chunk system
export const CHUNK_SIZE_BLOCKS = 4;  // 4x4 blocks per chunk (matches 2D)
export const BLOCK_SIZE = 20;        // 20x20 tiles per parcel
export const BLOCK_STRIDE = 23;      // BLOCK_SIZE + gap between parcels
export const CHUNK_SIZE_TILES = BLOCK_STRIDE * CHUNK_SIZE_BLOCKS; // 92 tiles
export const BLOCK_OFFSET_X = 105;
export const BLOCK_OFFSET_Y = 105;

// Streaming radii (in chunks)
export const LOAD_RADIUS = 3;
export const UNLOAD_RADIUS = 6;   // 2x load radius

// Performance
export const MAX_DRAW_CALLS = 400;
export const MAX_INSTANCES_PER_MESH = 16384;

// Ground colors - Medieval earth tones
export const GROUND_COLORS = {
  // Empty ground (outside parcels) - visible warm earth
  base: {
    top: 0x3d3225,
    left: 0x332a1c,
    right: 0x4a3e2e,
  },
  // Parcel ground - warm medieval earth tone (from Blender prototype)
  parcel: {
    top: 0x6b5940,
    left: 0x5a4830,
    right: 0x7c6a50,
  },
};

// Terrain-specific parcel ground colors (from Blender prototype, warmer tones)
export const TERRAIN_GROUND_COLORS: Record<string, { top: number; left: number; right: number }> = {
  plains:   { top: 0x6b5940, left: 0x5a4830, right: 0x7c6a50 },  // warm earth (default)
  forest:   { top: 0x385e2e, left: 0x2e4e24, right: 0x426e38 },  // rich forest green
  mountain: { top: 0x736b62, left: 0x635b52, right: 0x837b72 },  // warm grey stone
  mine:     { top: 0x5a4830, left: 0x4a3820, right: 0x6a5840 },  // warm brown
  river:    { top: 0x4a6a50, left: 0x3a5a40, right: 0x5a7a60 },  // green-brown riverbank
  volcanic: { top: 0x4a2820, left: 0x3a1810, right: 0x5a3830 },  // warm dark red-brown
};

// Kingdom color themes
export const WORLD_COLORS: Record<string, number> = {
  claude_nation: 0x8b2500,
  openai_empire: 0x8b8b00,
  gemini_republic: 0x2d5a27,
  grok_syndicate: 0xc9a84c,
  open_frontier: 0x4682b4,
};

// Lighting - warm medieval daylight
export const LIGHTING = {
  ambient: {
    color: 0xfff5e0,
    intensity: 1.3,
  },
  directional: {
    color: 0xffeedd,
    intensity: 1.6,
    position: { x: 10, y: 20, z: 10 },
  },
};

// Time phase lighting presets - medieval warm tones
export const TIME_PHASE_LIGHTING: Record<string, {
  ambientColor: number;
  ambientIntensity: number;
  dirColor: number;
  dirIntensity: number;
  fogColor: number;
}> = {
  morning: {
    ambientColor: 0xffe0b0,
    ambientIntensity: 0.9,
    dirColor: 0xffcc88,
    dirIntensity: 1.1,
    fogColor: 0x3a2e1e,
  },
  day: {
    ambientColor: 0xfff5e0,
    ambientIntensity: 1.3,
    dirColor: 0xffeedd,
    dirIntensity: 1.6,
    fogColor: 0x4a3e2e,
  },
  evening: {
    ambientColor: 0xcc8060,
    ambientIntensity: 0.7,
    dirColor: 0xff7744,
    dirIntensity: 0.8,
    fogColor: 0x2a1e10,
  },
  night: {
    ambientColor: 0x303060,
    ambientIntensity: 0.3,
    dirColor: 0x5050aa,
    dirIntensity: 0.25,
    fogColor: 0x0a0808,
  },
};

// Background - warm dark earth (matches fog fade)
export const BACKGROUND_COLOR = 0x2a2015;

// Hover/selection
export const HOVER_COLOR = 0xffffff;
export const HOVER_OPACITY = 0.3;
export const PARCEL_BORDER_COLOR = 0x8b5a2b;
export const PARCEL_BORDER_HOVER_COLOR = 0xffc864;

// Parcel edge highlighting
export const PARCEL_BORDER_BRIGHTNESS = 0.06; // Amount to brighten edge tiles

// 3D Model paths
export const MODEL_MANIFEST_PATH = '/assets/models/manifest.json';

// Post-processing
export const BLOOM_PARAMS = {
  threshold: 0.6,
  strength: 0.4,
  radius: 0.5,
};

export const BLOOM_NIGHT_STRENGTH = 0.8;
export const BLOOM_DAY_STRENGTH = 0.2;

// Kingdom emissive (warm glow instead of neon)
export const NEON_EMISSIVE_INTENSITY = 0.3;

// LOD distances (zoom thresholds)
export const LOD_FULL = 2.0;      // zoom > 2: Full GLTF
export const LOD_MEDIUM = 0.5;    // zoom 0.5-2: Simplified box
export const LOD_FAR = 0.5;       // zoom < 0.5: Skip
