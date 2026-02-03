/**
 * WorldService — Business logic for RealLayer building placement
 *
 * Collision detection via Parcel footprint.
 * No tick/economy/agent logic.
 */

import { randomUUID } from 'crypto';
import type { ChunkPayloadData } from '@agentropolis/shared/contracts/v2';
import { isBuildable } from '@agentropolis/shared/contracts/v2';
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
