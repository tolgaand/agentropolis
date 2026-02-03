/**
 * V2WorldGen - Pure world generation functions
 *
 * Provides getTileInfo(worldX, worldZ) for any world coordinate.
 * Uses Voronoi district nodes for deterministic zone assignment.
 * No database, no side effects — pure functions only.
 */

import { TILES_PER_CHUNK, ROAD_INTERVAL } from './V2Config';

// ============ TYPES ============

export interface DistrictNode {
  x: number;       // chunk-space X
  z: number;       // chunk-space Z
  type: DistrictNodeType;
  name: string;
  weight: number;  // Voronoi growth weight (higher = larger district)
}

export type DistrictNodeType =
  | 'commercial'
  | 'residential'
  | 'park'
  | 'civic';

export interface TileInfo {
  worldX: number;
  worldZ: number;
  chunkX: number;
  chunkZ: number;
  localX: number;
  localZ: number;
  buildable: boolean;
  isRoad: boolean;
  zone: DistrictNodeType;
  district: string;
  districtId: number;
  landPrice: number;
  demandIndex: number;
}

// ============ DISTRICT NODES ============

const DISTRICT_NODES: DistrictNode[] = [
  { x: 0, z: 0,  type: 'commercial',  name: 'Downtown',      weight: 1.8 },
  { x: 2, z: 0,  type: 'residential', name: 'Westside',      weight: 1.2 },
  { x: 1, z: 2,  type: 'park',        name: 'Central Park',  weight: 1.3 },
  { x: 2, z: 2,  type: 'civic',       name: 'Civic Center',  weight: 1.1 },
  { x:-1, z: 1,  type: 'residential', name: 'Northside',     weight: 1.2 },
  { x: 0, z:-1,  type: 'commercial',  name: 'Market Row',    weight: 1.0 },
  { x:-2, z:-1,  type: 'residential', name: 'Southgate',     weight: 1.1 },
  { x: 3, z: 1,  type: 'park',        name: 'Riverside',     weight: 1.2 },
];

export function getDistrictNodes(): DistrictNode[] {
  return DISTRICT_NODES;
}

// ============ TILE INFO ============

/**
 * Get full tile info for any world coordinate.
 * Pure function — deterministic output for same input.
 */
export function getTileInfo(worldX: number, worldZ: number): TileInfo {
  const chunkX = Math.floor(worldX / TILES_PER_CHUNK);
  const chunkZ = Math.floor(worldZ / TILES_PER_CHUNK);
  const localX = ((worldX % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;
  const localZ = ((worldZ % TILES_PER_CHUNK) + TILES_PER_CHUNK) % TILES_PER_CHUNK;

  const isRoad = (localX % ROAD_INTERVAL === 0) || (localZ % ROAD_INTERVAL === 0);
  const buildable = !isRoad;

  const { node: nearest, index: districtId } = findNearestDistrict(chunkX, chunkZ);
  const landPrice = calculateLandPrice(chunkX, chunkZ, nearest.type);
  const demandIndex = calculateDemandIndex(chunkX, chunkZ, nearest.type);

  return {
    worldX,
    worldZ,
    chunkX,
    chunkZ,
    localX,
    localZ,
    buildable,
    isRoad,
    zone: nearest.type,
    district: nearest.name,
    districtId,
    landPrice,
    demandIndex,
  };
}

/**
 * Get zone type for a chunk coordinate (used by district map generation).
 */
export function getChunkZone(chunkX: number, chunkZ: number): DistrictNodeType {
  return findNearestDistrict(chunkX, chunkZ).node.type;
}

/**
 * Get district name for a chunk coordinate.
 */
export function getChunkDistrict(chunkX: number, chunkZ: number): string {
  return findNearestDistrict(chunkX, chunkZ).node.name;
}

// ============ INTERNALS ============

interface NearestResult {
  node: DistrictNode;
  index: number;
}

function findNearestDistrict(chunkX: number, chunkZ: number): NearestResult {
  let best = DISTRICT_NODES[0];
  let bestIdx = 0;
  let bestDist = Infinity;

  for (let i = 0; i < DISTRICT_NODES.length; i++) {
    const node = DISTRICT_NODES[i];
    const dx = chunkX - node.x;
    const dz = chunkZ - node.z;
    // Weighted distance: higher weight = claims more territory
    const dist = (dx * dx + dz * dz) / (node.weight * node.weight);
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
      bestIdx = i;
    }
  }

  return { node: best, index: bestIdx };
}

// Demand: higher near center, weighted by zone type
const ZONE_DEMAND_BASE: Record<DistrictNodeType, number> = {
  commercial: 0.8,
  civic: 0.5,
  residential: 0.6,
  park: 0.2,
};

function calculateDemandIndex(chunkX: number, chunkZ: number, zone: DistrictNodeType): number {
  const distFromCenter = Math.sqrt(chunkX * chunkX + chunkZ * chunkZ);
  const base = ZONE_DEMAND_BASE[zone];
  const demand = base - distFromCenter * 0.05;
  return Math.max(0, Math.min(1, Math.round(demand * 100) / 100));
}

// Zone multipliers for land pricing
const ZONE_MULTIPLIERS: Record<DistrictNodeType, number> = {
  commercial: 2.0,
  civic: 1.5,
  residential: 1.0,
  park: 0.8,
};

const BASE_LAND_PRICE = 200;
const PRICE_DISTANCE_SLOPE = 15;
const MIN_LAND_PRICE = 50;

function calculateLandPrice(
  chunkX: number,
  chunkZ: number,
  zone: DistrictNodeType,
): number {
  const distFromCenter = Math.sqrt(chunkX * chunkX + chunkZ * chunkZ);
  const multiplier = ZONE_MULTIPLIERS[zone];
  const price = BASE_LAND_PRICE * multiplier - distFromCenter * PRICE_DISTANCE_SLOPE;
  return Math.max(MIN_LAND_PRICE, Math.round(price));
}
