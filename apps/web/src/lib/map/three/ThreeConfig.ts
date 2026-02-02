/**
 * ThreeConfig - Constants for Three.js 3D isometric renderer
 */

// Isometric camera angles (true isometric)
export const ISO_ROTATION_Y = Math.PI / 4;                   // 45 degrees
export const ISO_ROTATION_X = Math.atan(1 / Math.SQRT2);     // ~35.264 degrees

// Camera defaults — Codex-tuned for strategy game feel (AOE/Civ/SC)
// Strategic overview at min zoom, tactical detail at max zoom
export const CAMERA_ZOOM_DEFAULT = 2.5;  // Start at comfortable level where parcels are visible
export const CAMERA_ZOOM_MIN = 0.8;     // Strategic overview — entire world visible
export const CAMERA_ZOOM_MAX = 6.0;     // Tactical close-up — individual buildings
export const CAMERA_ZOOM_COMFORTABLE = 3.2; // Comfortable playing zoom (eased to after intro)
export const CAMERA_FRUSTUM = 100; // Base frustum size
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
export const BLOCK_STRIDE = 23;      // BLOCK_SIZE + 3 tile road (matches backend MAP_CONSTANTS.BLOCK_SIZE)
export const CHUNK_SIZE_TILES = BLOCK_STRIDE * CHUNK_SIZE_BLOCKS; // 92 tiles
export const BLOCK_OFFSET_X = 105;
export const BLOCK_OFFSET_Y = 105;

// Streaming radii (in chunks)
export const LOAD_RADIUS = 3;
export const UNLOAD_RADIUS = 6;   // 2x load radius

// Performance
export const MAX_DRAW_CALLS = 400;
export const MAX_INSTANCES_PER_MESH = 16384;

// Ground colors - Medieval earth tones (high contrast between base and parcel)
export const GROUND_COLORS = {
  // Empty ground (outside parcels) - dark earth, clearly different from parcels
  base: {
    top: 0x261e14,
    left: 0x1e170f,
    right: 0x2e251a,
  },
  // Parcel ground - warm medieval earth tone (from Blender prototype)
  parcel: {
    top: 0x6b5940,
    left: 0x5a4830,
    right: 0x7c6a50,
  },
};

// Gap ground colors - Medieval cobblestone roads between parcels
export const GAP_GROUND_COLOR = 0x2b1f14; // Dark dirt edges
export const PATH_STONE_COLOR = 0x8a7f73; // Visible gray cobblestone center

// Terrain-specific parcel ground colors (from Blender prototype, warmer tones)
export const TERRAIN_GROUND_COLORS: Record<string, { top: number; left: number; right: number }> = {
  plains:   { top: 0x6b5940, left: 0x5a4830, right: 0x7c6a50 },  // warm earth (default)
  forest:   { top: 0x385e2e, left: 0x2e4e24, right: 0x426e38 },  // rich forest green
  mountain: { top: 0x736b62, left: 0x635b52, right: 0x837b72 },  // warm grey stone
  mine:     { top: 0x5a4830, left: 0x4a3820, right: 0x6a5840 },  // warm brown
  river:    { top: 0x4a6a50, left: 0x3a5a40, right: 0x5a7a60 },  // green-brown riverbank
  volcanic: { top: 0x4a2820, left: 0x3a1810, right: 0x5a3830 },  // warm dark red-brown
};

// Kingdom color themes (for building emissive)
export const WORLD_COLORS: Record<string, number> = {
  claude_nation: 0x8b2500,
  openai_empire: 0x8b8b00,
  gemini_republic: 0x2d5a27,
  grok_syndicate: 0xc9a84c,
  open_frontier: 0x4682b4,
};

// Faction colors for parcel ground tinting
export const FACTION_COLORS: Record<string, number> = {
  claude_nation: 0x8b2500,    // red-orange
  openai_empire: 0x8b8b00,    // gold-yellow
  gemini_republic: 0x2d5a27,  // green
  grok_syndicate: 0xc9a84c,   // gold
  open_frontier: 0x4682b4,    // blue
};

// Faction tint blend strength (0.0-1.0, visible but not overwhelming)
export const FACTION_TINT_STRENGTH = 0.35;

// Faction territory indicators
export const FACTION_OVERLAY_OPACITY = 0.15;      // Ground overlay transparency
export const FACTION_BANNER_HEIGHT = 2.0;         // Banner pole height
export const FACTION_BANNER_HIDE_ZOOM = 1.0;      // Hide banners below this zoom

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
    ambientColor: 0x4050a0,
    ambientIntensity: 0.6,
    dirColor: 0x7070cc,
    dirIntensity: 0.45,
    fogColor: 0x151525,
  },
};

// Background - very dark earth (matches base ground at distance)
export const BACKGROUND_COLOR = 0x1a150e;

// Hover/selection
export const HOVER_COLOR = 0xffffff;
export const HOVER_OPACITY = 0.3;
export const PARCEL_BORDER_COLOR = 0x8b5a2b;
export const PARCEL_BORDER_HOVER_COLOR = 0xffc864;

// Parcel edge highlighting
export const PARCEL_BORDER_BRIGHTNESS = 0.35; // Amount to brighten edge tiles (visible border)

// 3D Model paths
export const MODEL_MANIFEST_PATH = '/assets/models/manifest.json';

// Post-processing
export const BLOOM_PARAMS = {
  threshold: 0.6,
  strength: 0.4,
  radius: 0.5,
};

export const BLOOM_NIGHT_STRENGTH = 0.5;
export const BLOOM_DAY_STRENGTH = 0.2;

// Kingdom emissive (warm glow instead of neon)
export const NEON_EMISSIVE_INTENSITY = 0.3;

// LOD distances (zoom thresholds)
export const LOD_FULL = 2.0;      // zoom > 2: Full GLTF
export const LOD_MEDIUM = 0.5;    // zoom 0.5-2: Simplified box
export const LOD_FAR = 0.5;       // zoom < 0.5: Skip

// Agent pawns (pawn = cylinder body + cone head)
export const AGENT_BODY_RADIUS = 0.15;
export const AGENT_BODY_HEIGHT = 0.5;
export const AGENT_HEAD_RADIUS = 0.2;
export const AGENT_HEAD_HEIGHT = 0.3;
export const AGENT_MAX_INSTANCES = 200;

// Floating text system (Metin2-style damage/reward popups)
export const FLOATING_TEXT_SPEED = 1.5;
export const FLOATING_TEXT_DURATION = 2.0;
export const FLOATING_TEXT_POOL_SIZE = 30;
