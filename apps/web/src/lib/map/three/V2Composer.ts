/**
 * V2Composer - Merges procedural placements with override buildings
 *
 * When BuildingStore is empty (default), returns pure procedural placements.
 * When buildings exist in the store, they replace procedural buildings
 * at matching tile positions.
 */

import {
  TILES_PER_CHUNK,
  ASSET_REGISTRY,
  type Placement,
  type SeededRandom,
} from './V2Config';
import { composeChunkFromDistrict } from './V2Layout';
import { type DistrictZone } from './V2Districts';
import { type BuildingStore, type BuildingInfo } from './V2Stores';

/** Returns true if rotation is ~90 or ~270 degrees (PI/2 or 3*PI/2) */
export function isRotated90(rotation?: number): boolean {
  if (rotation == null) return false;
  const r = ((rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.abs(r - Math.PI / 2) < 0.01 || Math.abs(r - (3 * Math.PI / 2)) < 0.01;
}

/** Get effective footprint width/depth accounting for rotation */
function effectiveFootprint(building: BuildingInfo): { tw: number; td: number } {
  const meta = ASSET_REGISTRY[building.assetKey];
  const baseTw = meta?.tileW ?? building.tileW;
  const baseTd = meta?.tileD ?? building.tileD;
  if (isRotated90(building.rotation)) {
    return { tw: baseTd, td: baseTw };
  }
  return { tw: baseTw, td: baseTd };
}

/**
 * Compute all tile coords a building occupies given its origin and footprint.
 * Accounts for rotation swapping width/depth.
 */
export function coveredTiles(
  localX: number,
  localZ: number,
  tileW: number,
  tileD: number,
  rotation?: number,
): Array<{ x: number; z: number }> {
  const rotated = isRotated90(rotation);
  const tw = rotated ? tileD : tileW;
  const td = rotated ? tileW : tileD;
  const tiles: Array<{ x: number; z: number }> = [];
  for (let dx = 0; dx < tw; dx++) {
    for (let dz = 0; dz < td; dz++) {
      tiles.push({ x: localX + dx, z: localZ + dz });
    }
  }
  return tiles;
}

export interface ComposerContext {
  buildingStore: BuildingStore;
  /** Authoritative buildings from backend/stub (highest precedence) */
  realLayerStore?: BuildingStore;
}

/**
 * Build occupancy set and placements from a list of BuildingInfo.
 * Returns the set of occupied tile keys and corresponding Placement[].
 */
function buildingsToOccupancy(buildings: BuildingInfo[]): {
  tiles: Set<string>;
  placements: Placement[];
} {
  const tiles = new Set<string>();
  const placements: Placement[] = [];

  for (const building of buildings) {
    const { tw, td } = effectiveFootprint(building);

    // Mark all tiles occupied
    for (let dx = 0; dx < tw; dx++) {
      for (let dz = 0; dz < td; dz++) {
        const tx = building.localX + dx;
        const tz = building.localZ + dz;
        if (tx < TILES_PER_CHUNK && tz < TILES_PER_CHUNK) {
          tiles.add(`${tx},${tz}`);
        }
      }
    }

    // Building placement
    placements.push({
      assetKey: building.assetKey,
      tileX: building.localX,
      tileZ: building.localZ,
      rotation: building.rotation,
    });

    // Ground under building
    for (let dx = 0; dx < tw; dx++) {
      for (let dz = 0; dz < td; dz++) {
        placements.push({
          assetKey: 'asphalt',
          tileX: building.localX + dx,
          tileZ: building.localZ + dz,
        });
      }
    }
  }

  return { tiles, placements };
}

/**
 * Filter placements: remove non-road entries whose tiles overlap the given set.
 */
function filterByOccupancy(placements: Placement[], occupied: Set<string>): Placement[] {
  if (occupied.size === 0) return placements;
  return placements.filter(p => {
    const meta = ASSET_REGISTRY[p.assetKey];
    if (!meta) return true;
    if (meta.type === 'road') return true;

    const rotated = isRotated90(p.rotation);
    const tw = rotated ? meta.tileD : meta.tileW;
    const td = rotated ? meta.tileW : meta.tileD;
    for (let dx = 0; dx < tw; dx++) {
      for (let dz = 0; dz < td; dz++) {
        if (occupied.has(`${p.tileX + dx},${p.tileZ + dz}`)) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * Compose final placements for a chunk, merging three layers:
 *
 *   1. RealLayer (authoritative from backend/stub) — highest precedence
 *   2. Override layer (user-placed buildings)
 *   3. Procedural fill — lowest precedence
 *
 * Each higher layer masks out tiles from lower layers.
 */
export function composePlacements(
  chunkX: number,
  chunkZ: number,
  districtZone: DistrictZone,
  rng: SeededRandom,
  context: ComposerContext,
): Placement[] {
  // 1. Generate procedural placements (lowest layer)
  const procedural = composeChunkFromDistrict(districtZone, rng);

  // 2. Collect authoritative (real layer) buildings
  const realBuildings = context.realLayerStore?.getBuildingsInChunk(chunkX, chunkZ) ?? [];
  const { tiles: realTiles, placements: realPlacements } = buildingsToOccupancy(realBuildings);

  // 3. Collect override buildings
  const overrides = context.buildingStore.getBuildingsInChunk(chunkX, chunkZ);

  // Filter overrides: remove any that collide with real layer tiles
  const cleanOverrides = overrides.filter(b => {
    const { tw, td } = effectiveFootprint(b);
    for (let dx = 0; dx < tw; dx++) {
      for (let dz = 0; dz < td; dz++) {
        if (realTiles.has(`${b.localX + dx},${b.localZ + dz}`)) return false;
      }
    }
    return true;
  });
  const { tiles: overrideTiles, placements: overridePlacements } = buildingsToOccupancy(cleanOverrides);

  // No overrides or real data → pure procedural
  if (realBuildings.length === 0 && cleanOverrides.length === 0) return procedural;

  // 4. Combined occupied set (real + override)
  const allOccupied = new Set<string>([...realTiles, ...overrideTiles]);

  // 5. Filter procedural: remove anything overlapping real or override tiles
  const filteredProcedural = filterByOccupancy(procedural, allOccupied);

  // 6. Merge: procedural (filtered) + overrides (filtered by real) + real layer
  return [...filteredProcedural, ...overridePlacements, ...realPlacements];
}
