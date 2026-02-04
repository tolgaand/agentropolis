/**
 * WorldService — Business logic for RealLayer building placement
 *
 * Collision detection via Parcel footprint.
 * No tick/economy/agent logic.
 */

import { randomUUID } from 'crypto';
import type { ChunkPayloadData, Placement } from '@agentropolis/shared/contracts/v2';
import { isBuildable } from '@agentropolis/shared/contracts/v2';
import { BuildingModel } from '@agentropolis/db';
import * as repo from './worldRepo';
import { generateStubChunk } from '../realtime/stubProvider';

// ============ TYPES ============

export interface PlaceBuildingInput {
  worldX: number;
  worldZ: number;
  type: string;
  assetKey: string;
  rotY?: number;
  tileW?: number;
  tileD?: number;
  level?: number;
  ownerId?: string;
  // Optional economic fields — passed through to DB when creating via agent/cityManager
  accountId?: string | null;
  income?: number;
  operatingCost?: number;
  maxEmployees?: number;
  glbModel?: string;
  districtId?: string | null;
}

export interface PlaceResult {
  ok: boolean;
  buildingId?: string;
  reason?: string;
  collidedWith?: string[];
}

export interface RemoveResult {
  ok: boolean;
  reason?: string;
}

// ============ HELPERS ============

/** Compute all tiles a building covers (footprint) */
function computeFootprint(
  worldX: number,
  worldZ: number,
  tileW: number,
  tileD: number,
  rotY: number,
): Array<{ worldX: number; worldZ: number }> {
  const isRotated = rotY === 90 || rotY === 270;
  const w = isRotated ? tileD : tileW;
  const d = isRotated ? tileW : tileD;

  const tiles: Array<{ worldX: number; worldZ: number }> = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      tiles.push({ worldX: worldX + dx, worldZ: worldZ + dz });
    }
  }
  return tiles;
}

// ============ SERVICE FUNCTIONS ============

/**
 * Get chunk payload: deterministic base + DB overrides merged.
 * DB buildings (source:'real') take priority over stub base (source:'stub').
 */
export async function getChunkPayload(
  cityId: string,
  chunkX: number,
  chunkZ: number,
  seed: number = 42,
): Promise<ChunkPayloadData> {
  // 1. Generate deterministic base placements
  const base = generateStubChunk(seed, chunkX, chunkZ);

  // 2. Get DB authoritative buildings
  const dbPayload = await repo.getChunkPayload(cityId, chunkX, chunkZ);

  // 3. Build occupied tile set from DB buildings
  const occupiedTiles = new Set<string>();
  for (const p of dbPayload.placements) {
    occupiedTiles.add(`${p.worldX},${p.worldZ}`);
  }

  // 4. Filter base placements that don't overlap DB buildings
  const filteredBase = base.placements.filter(
    (p) => !occupiedTiles.has(`${p.worldX},${p.worldZ}`),
  );

  // 5. Merge: DB buildings first, then non-overlapping base
  return {
    chunkX,
    chunkZ,
    placements: [...dbPayload.placements, ...filteredBase],
    meta: {
      seed,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** Place a building with collision detection */
export async function placeBuilding(
  cityId: string,
  input: PlaceBuildingInput,
): Promise<PlaceResult> {
  const {
    worldX,
    worldZ,
    type,
    assetKey,
    rotY = 0,
    tileW = 1,
    tileD = 1,
    level = 1,
    ownerId,
    accountId,
    income,
    operatingCost,
    maxEmployees,
    glbModel,
    districtId,
  } = input;

  // Compute footprint tiles
  const footprint = computeFootprint(worldX, worldZ, tileW, tileD, rotY);

  // Check all footprint tiles are buildable (not road)
  for (const tile of footprint) {
    if (!isBuildable(tile.worldX, tile.worldZ)) {
      return { ok: false, reason: 'not_buildable' };
    }
  }

  // Check collision: any footprint tile already occupied?
  const occupied = await repo.findOccupiedParcels(cityId, footprint);
  if (occupied.length > 0) {
    const collidedIds = [...new Set(occupied.map((p) => p.buildingId).filter(Boolean))] as string[];
    return {
      ok: false,
      reason: 'overlap',
      collidedWith: collidedIds,
    };
  }

  // Compute chunk from world coords
  const { chunkX, chunkZ } = repo.worldToChunk(worldX, worldZ);
  const buildingId = randomUUID();

  // Create building (spatial + optional economic fields in one write)
  await repo.createBuilding({
    cityId,
    buildingId,
    type,
    assetKey,
    chunkX,
    chunkZ,
    worldX,
    worldZ,
    tileW,
    tileD,
    rotY,
    level,
    ownerId: ownerId ?? null,
    ...(accountId != null && { accountId }),
    ...(income != null && { income }),
    ...(operatingCost != null && { operatingCost }),
    ...(maxEmployees != null && { maxEmployees }),
    ...(glbModel != null && { glbModel }),
    ...(districtId !== undefined && { districtId }),
  });

  // Upsert footprint parcels
  await repo.upsertFootprintParcels(cityId, buildingId, footprint);

  return { ok: true, buildingId };
}

/** Remove a building and clear its parcel footprint */
export async function removeBuilding(
  cityId: string,
  buildingId: string,
  ownerId?: string,
): Promise<RemoveResult> {
  const building = await repo.findBuilding(cityId, buildingId);
  if (!building) {
    return { ok: false, reason: 'not_found' };
  }

  // Ownership check: if ownerId provided, must match
  if (ownerId && building.ownerId && building.ownerId.toString() !== ownerId) {
    return { ok: false, reason: 'not_owner' };
  }

  await repo.clearBuildingFromParcels(cityId, buildingId);
  await repo.deleteBuilding(cityId, buildingId);

  return { ok: true };
}

/** Check which parcels in the given coordinates are occupied by buildings */
export async function findOccupiedParcels(
  cityId: string,
  coords: Array<{ worldX: number; worldZ: number }>,
) {
  return repo.findOccupiedParcels(cityId, coords);
}

// ============ PARCEL BUY ============

export interface BuyParcelResult {
  ok: boolean;
  reason?: string;
}

/** Buy (claim ownership of) a parcel */
export async function buyParcel(
  cityId: string,
  worldX: number,
  worldZ: number,
  ownerId: string,
): Promise<BuyParcelResult> {
  if (!isBuildable(worldX, worldZ)) {
    return { ok: false, reason: 'not_buildable' };
  }

  // Check if already owned by someone else
  const existing = await repo.getParcel(cityId, worldX, worldZ);
  if (existing?.ownerId && existing.ownerId !== ownerId) {
    return { ok: false, reason: 'already_owned' };
  }

  await repo.buyParcel(cityId, worldX, worldZ, ownerId);
  return { ok: true };
}

// ============ DEBUG PROVENANCE ============

/** Extended placement with override info — only for debug endpoints */
export interface DebugPlacement extends Placement {
  overridesStub: boolean;
}

export interface DebugChunkPayload {
  chunkX: number;
  chunkZ: number;
  placements: DebugPlacement[];
  stats: {
    stubCount: number;
    realCount: number;
    overrideCount: number;
  };
  meta?: ChunkPayloadData['meta'];
}

/**
 * Debug version of getChunkPayload — includes overridesStub flag per placement.
 * Not used in normal socket flow; only for debug REST endpoint.
 */
export async function getChunkPayloadDebug(
  cityId: string,
  chunkX: number,
  chunkZ: number,
  seed: number = 42,
): Promise<DebugChunkPayload> {
  const base = generateStubChunk(seed, chunkX, chunkZ);
  const dbPayload = await repo.getChunkPayload(cityId, chunkX, chunkZ);

  // Build set of tiles that stubs originally occupied
  const stubTiles = new Set<string>();
  for (const p of base.placements) {
    stubTiles.add(`${p.worldX},${p.worldZ}`);
  }

  // Build set of tiles occupied by real buildings
  const occupiedTiles = new Set<string>();
  for (const p of dbPayload.placements) {
    occupiedTiles.add(`${p.worldX},${p.worldZ}`);
  }

  // Real placements with overridesStub flag
  let overrideCount = 0;
  const realPlacements: DebugPlacement[] = dbPayload.placements.map((p) => {
    const overrides = stubTiles.has(`${p.worldX},${p.worldZ}`);
    if (overrides) overrideCount++;
    return { ...p, overridesStub: overrides };
  });

  // Stub placements that survived (not overridden)
  const survivingStubs: DebugPlacement[] = base.placements
    .filter((p) => !occupiedTiles.has(`${p.worldX},${p.worldZ}`))
    .map((p) => ({ ...p, overridesStub: false }));

  return {
    chunkX,
    chunkZ,
    placements: [...realPlacements, ...survivingStubs],
    stats: {
      stubCount: survivingStubs.length,
      realCount: realPlacements.length,
      overrideCount,
    },
    meta: {
      seed,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ============ CHUNK STATS (aggregate-based) ============

export interface ChunkStats {
  chunkX: number;
  chunkZ: number;
  realBuildingCount: number;
  activeBuildingCount: number;
  closedBuildingCount: number;
  lastTouchedTick: number;
}

/**
 * Aggregate-based chunk stats — always accurate, no stale index.
 * Returns stats for all chunks that have at least one real building.
 */
export async function getChunkStatsAll(cityId: string): Promise<ChunkStats[]> {
  const result = await BuildingModel.aggregate([
    { $match: { cityId } },
    {
      $group: {
        _id: { chunkX: '$chunkX', chunkZ: '$chunkZ' },
        realBuildingCount: { $sum: 1 },
        activeBuildingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
        closedBuildingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'temporarily_closed'] }, 1, 0] },
        },
        lastTouchedTick: { $max: '$lastTouchedTick' },
      },
    },
    { $sort: { '_id.chunkX': 1, '_id.chunkZ': 1 } },
  ]);

  return result.map((r) => ({
    chunkX: r._id.chunkX,
    chunkZ: r._id.chunkZ,
    realBuildingCount: r.realBuildingCount,
    activeBuildingCount: r.activeBuildingCount,
    closedBuildingCount: r.closedBuildingCount,
    lastTouchedTick: r.lastTouchedTick ?? 0,
  }));
}

/** Get stats for a single chunk */
export async function getChunkStats(
  cityId: string,
  chunkX: number,
  chunkZ: number,
): Promise<ChunkStats | null> {
  const result = await BuildingModel.aggregate([
    { $match: { cityId, chunkX, chunkZ } },
    {
      $group: {
        _id: null,
        realBuildingCount: { $sum: 1 },
        activeBuildingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] },
        },
        closedBuildingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'temporarily_closed'] }, 1, 0] },
        },
        lastTouchedTick: { $max: '$lastTouchedTick' },
      },
    },
  ]);

  if (result.length === 0) return null;

  return {
    chunkX,
    chunkZ,
    realBuildingCount: result[0].realBuildingCount,
    activeBuildingCount: result[0].activeBuildingCount,
    closedBuildingCount: result[0].closedBuildingCount,
    lastTouchedTick: result[0].lastTouchedTick ?? 0,
  };
}
