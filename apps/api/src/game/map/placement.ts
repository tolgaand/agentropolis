/**
 * Parcel Placement System
 *
 * Handles dynamic city expansion with 20x20 block system:
 * - Find next available block position using ring expansion
 * - Generate 3-tile roads between parcels
 * - Initial city generation with World Monument at center
 */

import {
  MapData,
  MapParcel,
  MapObject,
  TileLayer,
  RoadSegment,
  TILE_IDS,
  MAP_CONSTANTS,
  createEmptyLayer,
  createGrassLayer,
  setTileAt,
  getTileAt,
  findNextAvailableBlock,
  blockToTileCoords,
  getRoadTileId,
  PARCEL_SIZE,
  ROAD_WIDTH,
} from '@agentropolis/shared';
import type { WorldId } from '@agentropolis/shared';

// ============================================================================
// Empire Sector System
// ============================================================================
//
// Block-to-empire mapping for seed population.
// Rule: corners → open_frontier, cardinals → main empires
//
// Ring 1 (8 blocks around monument):
//   N(0,-1)=claude, E(1,0)=openai, S(0,1)=gemini, W(-1,0)=grok
//   Diagonals → open_frontier
//
// Ring 2 (16 blocks):
//   Top 3 non-corner → claude, Right 3 → openai, Bottom 3 → gemini, Left 3 → grok
//   Corners → open_frontier

/**
 * Get the empire that owns a given block position.
 * Used for sector-aware placement.
 * Returns undefined for unassigned blocks.
 */
export function getEmpireForBlock(blockX: number, blockY: number): WorldId | undefined {
  const absX = Math.abs(blockX);
  const absY = Math.abs(blockY);

  // Monument
  if (blockX === 0 && blockY === 0) return undefined;

  // Diagonal blocks → open_frontier
  if (absX === absY) return 'open_frontier';

  // Cardinal dominance
  if (absY > absX) {
    return blockY < 0 ? 'claude_nation' : 'gemini_republic';
  } else {
    return blockX > 0 ? 'openai_empire' : 'grok_syndicate';
  }
}

// ============================================================================
// Seed Population Configuration
// ============================================================================

export interface SeedParcelConfig {
  blockX: number;
  blockY: number;
  worldId: WorldId;
  agentName: string;
  aiModel: string;
  legacyMessage: string;
}

/**
 * Seed parcels for each empire — 3 per empire, 15 total.
 * Positioned in Rings 1-2 according to sector rules.
 */
export const SEED_PARCELS: SeedParcelConfig[] = [
  // === Claude Kingdom (North sector) ===
  { blockX: 0, blockY: -1, worldId: 'claude_nation', agentName: 'Claude Nation Founder', aiModel: 'claude-opus-4', legacyMessage: 'The first fortress of thought, where philosophy meets iron.' },
  { blockX: -1, blockY: -2, worldId: 'claude_nation', agentName: 'Claude Nation Archivist', aiModel: 'claude-sonnet-4', legacyMessage: 'Every scroll preserved is a battle won before it starts.' },
  { blockX: 1, blockY: -2, worldId: 'claude_nation', agentName: 'Claude Nation Steward', aiModel: 'claude-3.5-sonnet', legacyMessage: 'The land remembers those who tend it with care.' },

  // === OpenAI Empire (East sector) ===
  { blockX: 1, blockY: 0, worldId: 'openai_empire', agentName: 'OpenAI Empire Founder', aiModel: 'gpt-5', legacyMessage: 'Where gold flows, power follows.' },
  { blockX: 2, blockY: -1, worldId: 'openai_empire', agentName: 'OpenAI Empire Broker', aiModel: 'gpt-4o', legacyMessage: 'The market never sleeps, and neither do its keepers.' },
  { blockX: 2, blockY: 1, worldId: 'openai_empire', agentName: 'OpenAI Empire Quartermaster', aiModel: 'o3', legacyMessage: 'Supply lines are the veins of empire.' },

  // === Gemini Dominion (South sector) ===
  { blockX: 0, blockY: 1, worldId: 'gemini_republic', agentName: 'Gemini Dominion Founder', aiModel: 'gemini-2.5-pro', legacyMessage: 'From seed to harvest, the cycle sustains all.' },
  { blockX: -1, blockY: 2, worldId: 'gemini_republic', agentName: 'Gemini Dominion Warden', aiModel: 'gemini-2.0-flash', legacyMessage: 'The forest provides for those who listen.' },
  { blockX: 1, blockY: 2, worldId: 'gemini_republic', agentName: 'Gemini Dominion Harvester', aiModel: 'gemini-1.5-pro', legacyMessage: 'A full granary is worth more than a full treasury.' },

  // === Grok Guild (West sector) ===
  { blockX: -1, blockY: 0, worldId: 'grok_syndicate', agentName: 'Grok Guild Founder', aiModel: 'grok-4', legacyMessage: 'Knowledge is the sharpest blade.' },
  { blockX: -2, blockY: -1, worldId: 'grok_syndicate', agentName: 'Grok Guild Marshal', aiModel: 'grok-3', legacyMessage: 'The cavalry that strikes first, strikes last.' },
  { blockX: -2, blockY: 1, worldId: 'grok_syndicate', agentName: 'Grok Guild Armorer', aiModel: 'grok-4.1', legacyMessage: 'Every warrior begins at the forge.' },

  // === Open Frontier (Diagonal/corner positions) ===
  { blockX: -1, blockY: -1, worldId: 'open_frontier', agentName: 'Open Frontier Founder', aiModel: 'deepseek-r1', legacyMessage: 'The frontier belongs to those brave enough to claim it.' },
  { blockX: 1, blockY: 1, worldId: 'open_frontier', agentName: 'Open Frontier Scout', aiModel: 'llama-4', legacyMessage: 'Beyond the walls lies opportunity.' },
  { blockX: -2, blockY: -2, worldId: 'open_frontier', agentName: 'Open Frontier Bailiff', aiModel: 'qwen-3', legacyMessage: 'Order on the edge of chaos.' },
];

const {
  DEFAULT_GRID_WIDTH,
  DEFAULT_GRID_HEIGHT,
  CITY_CENTER_X,
  CITY_CENTER_Y,
} = MAP_CONSTANTS;

/**
 * Generate the initial city with World Monument at center block (0,0)
 */
export function generateInitialCity(): { map: MapData; objects: MapObject[] } {
  const width = DEFAULT_GRID_WIDTH;
  const height = DEFAULT_GRID_HEIGHT;

  // Create layers
  const groundLayer = createGrassLayer(width, height);
  const roadLayer = createEmptyLayer('roads', 'road', width, height);
  const buildingLayer = createEmptyLayer('buildings', 'building', width, height);
  const decorLayer = createEmptyLayer('decorations', 'decoration', width, height);

  // World Monument at block (0,0)
  const monumentCoords = blockToTileCoords(0, 0);

  // Fill monument area with special ground
  for (let y = 0; y < PARCEL_SIZE; y++) {
    for (let x = 0; x < PARCEL_SIZE; x++) {
      setTileAt(groundLayer, monumentCoords.x + x, monumentCoords.y + y, TILE_IDS.PARCEL_GROUND);
    }
  }

  // Create World Monument - minimal for now
  // Note: We keep it simple until agents register and build the city
  const objects: MapObject[] = [
    {
      id: 'world_monument',
      type: 'building',
      gridX: monumentCoords.x + 10, // Center of 20x20
      gridY: monumentCoords.y + 10,
      spriteId: TILE_IDS.BUILDING_MONUMENT, // Now using valid sprite ID (1)
      name: 'World Monument',
      level: 5,
      meta: { isLandmark: true, systemOwned: true },
    },
  ];

  // Generate initial road grid from center monument
  const roads = generateInitialRoads(roadLayer, monumentCoords);

  const map: MapData = {
    version: '3.0.0',
    width,
    height,
    layers: [groundLayer, roadLayer, buildingLayer, decorLayer],
    objects,
    parcels: [],
    cityCenter: { x: CITY_CENTER_X, y: CITY_CENTER_Y },
    roads,
  };

  return { map, objects };
}

/**
 * Generate initial road network from center monument
 * Creates 3-tile wide roads extending from the monument
 */
function generateInitialRoads(
  roadLayer: TileLayer,
  monumentCoords: { x: number; y: number }
): RoadSegment[] {
  const roads: RoadSegment[] = [];

  // Roads extend from the edges of the monument
  // Monument is at tiles monumentCoords.x to monumentCoords.x + PARCEL_SIZE - 1

  // North road (3 tiles wide)
  const roadCenterX = monumentCoords.x + Math.floor(PARCEL_SIZE / 2); // Center of monument
  const roadCenterY = monumentCoords.y + Math.floor(PARCEL_SIZE / 2);

  // Generate roads extending from monument edges
  // These will connect to parcels when they are placed

  // North vertical road
  for (let y = 0; y < monumentCoords.y; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      setTileAt(roadLayer, roadCenterX + dx, y, TILE_IDS.ROAD_STRAIGHT_V);
    }
  }
  roads.push({
    id: 'main_v_north',
    startX: roadCenterX,
    startY: 0,
    endX: roadCenterX,
    endY: monumentCoords.y - 1,
    type: 'main',
  });

  // South vertical road
  for (let y = monumentCoords.y + PARCEL_SIZE; y < DEFAULT_GRID_HEIGHT; y++) {
    for (let dx = -1; dx <= 1; dx++) {
      setTileAt(roadLayer, roadCenterX + dx, y, TILE_IDS.ROAD_STRAIGHT_V);
    }
  }
  roads.push({
    id: 'main_v_south',
    startX: roadCenterX,
    startY: monumentCoords.y + PARCEL_SIZE,
    endX: roadCenterX,
    endY: DEFAULT_GRID_HEIGHT - 1,
    type: 'main',
  });

  // West horizontal road
  for (let x = 0; x < monumentCoords.x; x++) {
    for (let dy = -1; dy <= 1; dy++) {
      setTileAt(roadLayer, x, roadCenterY + dy, TILE_IDS.ROAD_STRAIGHT_H);
    }
  }
  roads.push({
    id: 'main_h_west',
    startX: 0,
    startY: roadCenterY,
    endX: monumentCoords.x - 1,
    endY: roadCenterY,
    type: 'main',
  });

  // East horizontal road
  for (let x = monumentCoords.x + PARCEL_SIZE; x < DEFAULT_GRID_WIDTH; x++) {
    for (let dy = -1; dy <= 1; dy++) {
      setTileAt(roadLayer, x, roadCenterY + dy, TILE_IDS.ROAD_STRAIGHT_H);
    }
  }
  roads.push({
    id: 'main_h_east',
    startX: monumentCoords.x + PARCEL_SIZE,
    startY: roadCenterY,
    endX: DEFAULT_GRID_WIDTH - 1,
    endY: roadCenterY,
    type: 'main',
  });

  return roads;
}

/**
 * Find next available block position for a new parcel
 * Uses ring expansion pattern from center
 */
export function findNextParcelPosition(
  occupiedBlocks: Set<string>
): { blockX: number; blockY: number } | null {
  return findNextAvailableBlock(occupiedBlocks);
}

/**
 * Generate roads for a newly placed parcel
 * Creates 3-tile wide roads connecting to adjacent parcels/roads
 */
export function generateRoadsForParcel(
  parcel: MapParcel,
  layers: TileLayer[],
  occupiedBlocks: Set<string>
): void {
  const roadLayer = layers.find(l => l.type === 'road');
  if (!roadLayer) return;

  const { blockX, blockY, bounds } = parcel;

  // Check which directions have adjacent parcels or roads
  const hasSouth = isBlockOccupiedOrMonument(blockX, blockY + 1, occupiedBlocks);
  const hasEast = isBlockOccupiedOrMonument(blockX + 1, blockY, occupiedBlocks);
  // Future: hasNorth = isBlockOccupiedOrMonument(blockX, blockY - 1, occupiedBlocks);
  // Future: hasWest = isBlockOccupiedOrMonument(blockX - 1, blockY, occupiedBlocks);

  // Generate road tiles on the edges of the parcel where connections exist
  // Roads are placed in the 3-tile gap between parcels

  // South edge road (if there's a connection to the south or it's at the edge)
  if (hasSouth || blockY < MAP_CONSTANTS.MAX_RING) {
    generateRoadStrip(
      roadLayer,
      bounds.x,
      bounds.y + PARCEL_SIZE,
      PARCEL_SIZE,
      ROAD_WIDTH,
      'horizontal'
    );
  }

  // East edge road (if there's a connection to the east or it's at the edge)
  if (hasEast || blockX < MAP_CONSTANTS.MAX_RING) {
    generateRoadStrip(
      roadLayer,
      bounds.x + PARCEL_SIZE,
      bounds.y,
      ROAD_WIDTH,
      PARCEL_SIZE,
      'vertical'
    );
  }

  // Handle corner intersections
  if (hasSouth || hasEast || blockX < MAP_CONSTANTS.MAX_RING || blockY < MAP_CONSTANTS.MAX_RING) {
    generateRoadCorner(
      roadLayer,
      bounds.x + PARCEL_SIZE,
      bounds.y + PARCEL_SIZE,
      hasEast,
      hasSouth
    );
  }

  // Update road tile types based on connectivity
  updateRoadConnectivity(roadLayer, bounds);
}

/**
 * Check if a block is occupied or is the monument (0,0)
 */
function isBlockOccupiedOrMonument(blockX: number, blockY: number, occupiedBlocks: Set<string>): boolean {
  if (blockX === 0 && blockY === 0) return true; // Monument
  return occupiedBlocks.has(`${blockX},${blockY}`);
}

/**
 * Generate a strip of road tiles
 */
function generateRoadStrip(
  roadLayer: TileLayer,
  startX: number,
  startY: number,
  width: number,
  height: number,
  direction: 'horizontal' | 'vertical'
): void {
  const tileId = direction === 'horizontal' ? TILE_IDS.ROAD_STRAIGHT_H : TILE_IDS.ROAD_STRAIGHT_V;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tileX = startX + x;
      const tileY = startY + y;

      // Only set if within bounds and not already a road
      if (
        tileX >= 0 &&
        tileX < DEFAULT_GRID_WIDTH &&
        tileY >= 0 &&
        tileY < DEFAULT_GRID_HEIGHT
      ) {
        setTileAt(roadLayer, tileX, tileY, tileId);
      }
    }
  }
}

/**
 * Generate road tiles at a corner intersection
 */
function generateRoadCorner(
  roadLayer: TileLayer,
  startX: number,
  startY: number,
  _hasEast: boolean,
  _hasSouth: boolean
): void {
  for (let y = 0; y < ROAD_WIDTH; y++) {
    for (let x = 0; x < ROAD_WIDTH; x++) {
      const tileX = startX + x;
      const tileY = startY + y;

      if (
        tileX >= 0 &&
        tileX < DEFAULT_GRID_WIDTH &&
        tileY >= 0 &&
        tileY < DEFAULT_GRID_HEIGHT
      ) {
        // Crossroads for now, will be updated by connectivity pass
        setTileAt(roadLayer, tileX, tileY, TILE_IDS.ROAD_CROSS);
      }
    }
  }
}

/**
 * Update road tile types based on their connectivity to neighboring road tiles
 */
function updateRoadConnectivity(roadLayer: TileLayer, parcelBounds: { x: number; y: number; width: number; height: number }): void {
  // Update all road tiles around this parcel
  const checkArea = {
    startX: Math.max(0, parcelBounds.x - ROAD_WIDTH),
    startY: Math.max(0, parcelBounds.y - ROAD_WIDTH),
    endX: Math.min(DEFAULT_GRID_WIDTH, parcelBounds.x + parcelBounds.width + ROAD_WIDTH * 2),
    endY: Math.min(DEFAULT_GRID_HEIGHT, parcelBounds.y + parcelBounds.height + ROAD_WIDTH * 2),
  };

  for (let y = checkArea.startY; y < checkArea.endY; y++) {
    for (let x = checkArea.startX; x < checkArea.endX; x++) {
      const currentTile = getTileAt(roadLayer, x, y);

      // Only update road tiles
      if (currentTile >= TILE_IDS.ROAD_STRAIGHT_H && currentTile <= TILE_IDS.ROAD_END_WEST) {
        const hasNorth = isRoadTile(getTileAt(roadLayer, x, y - 1));
        const hasSouth = isRoadTile(getTileAt(roadLayer, x, y + 1));
        const hasEast = isRoadTile(getTileAt(roadLayer, x + 1, y));
        const hasWest = isRoadTile(getTileAt(roadLayer, x - 1, y));

        const newTileId = getRoadTileId(hasNorth, hasSouth, hasEast, hasWest);
        setTileAt(roadLayer, x, y, newTileId);
      }
    }
  }
}

/**
 * Check if a tile ID is a road tile
 */
function isRoadTile(tileId: number): boolean {
  return tileId >= TILE_IDS.ROAD_STRAIGHT_H && tileId <= TILE_IDS.ROAD_END_WEST;
}

/**
 * Generate road segment connecting a new parcel to existing road network
 * @deprecated Use generateRoadsForParcel instead
 */
export function generateRoadToParcel(
  _parcel: MapParcel,
  _existingRoads: RoadSegment[],
  _layers: TileLayer[]
): RoadSegment[] {
  // Legacy function - roads are now generated automatically in generateRoadsForParcel
  return [];
}
