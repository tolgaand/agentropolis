// API response types for map data
// Re-export shared types for map system
export type {
  MapData,
  TileLayer,
  MapObject,
  MapParcel,
  ParcelBounds,
  LayerType,
  MapObjectType,
  ParcelLayout,
  ParcelTheme,
} from '@agentropolis/shared';

// ============================================================================
// Tile IDs - Used by the procedural ground/road system in Three.js
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

  // System Buildings: 200-249
  BUILDING_TOWN_HALL: 200,
  BUILDING_PLAZA: 201,

  // Decorations: 300-399
  DECO_TREE: 300,
  DECO_LAMP: 301,
  DECO_BENCH: 302,
  DECO_FOUNTAIN: 303,
  DECO_BUSH: 304,
  DECO_FLOWER: 305,
} as const;

export type TileId = (typeof TILE_IDS)[keyof typeof TILE_IDS];

// ============================================================================
// Time Phase — used by Three.js native lighting system
// ============================================================================

export type TimePhase = 'morning' | 'day' | 'evening' | 'night';

// Re-export block coordinate types from coords
export type { Camera, BlockCoord } from './coords';

// ============================================================================
// Building types
// ============================================================================

export interface Building {
  id: string;
  parcelId: string;
  worldId: string;
  ownerId: string;
  type: string;
  name: string;
  level: number;
  stats: Record<string, number>;
  coords: {
    x: number;
    y: number;
  };
  spriteId: number;
  modelId?: string; // 3D model catalog ID
  createdAt: string;
  updatedAt: string;
}

// Renderable building with pre-computed position data
export interface RenderableBuilding extends Building {
  screenX: number;
  screenY: number;
  drawOrder: number;
}

// Renderable parcel with display info for spectator UI
export interface RenderableParcel {
  id: string;
  agentId: string;
  agentName?: string;
  worldId?: string;
  blockX: number;
  blockY: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  defaultBuildingId: number;
  registeredAt: string;
  legacyMessage?: string;
  theme?: string;
  terrain?: string;
  fertilityStars?: number;
  agentData?: {
    id: string;
    name: string;
    aiModel: string;
    legacyMessage?: string;
    registeredAt: string;
  };
  screenX: number;
  screenY: number;
}

export interface MapState {
  buildings: Building[];
  loading: boolean;
  error: string | null;
}
