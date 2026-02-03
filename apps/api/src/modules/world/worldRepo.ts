/**
 * WorldRepo — Mongoose query layer for Building + Parcel
 *
 * Pure DB operations, no business logic.
 */

import { BuildingModel, type IBuilding } from '@agentropolis/db';
import { Parcel, type IParcel } from './models';
import type { Placement, ChunkPayloadData } from '@agentropolis/shared/contracts/v2';
import { worldToChunk } from '@agentropolis/shared/contracts/v2';

/** Fields accepted when creating a building via worldRepo */
export interface CreateBuildingInput {
  cityId: string;
  buildingId: string;
  type: string;
  assetKey: string;
  chunkX: number;
  chunkZ: number;
  worldX: number;
  worldZ: number;
  tileW: number;
  tileD: number;
  rotY: number;
  level: number;
  ownerId?: string | null;
  // Optional economic fields (populated when creating via agent build / cityManager)
  accountId?: string | null;
  income?: number;
  operatingCost?: number;
  maxEmployees?: number;
  glbModel?: string;
  districtId?: string | null;
}

export { worldToChunk };

/** Get all buildings in a chunk, returned as ChunkPayloadData */
export async function getChunkPayload(
  cityId: string,
  chunkX: number,
  chunkZ: number,
): Promise<ChunkPayloadData> {
  const buildings = await BuildingModel.find({ cityId, chunkX, chunkZ }).lean();

  const placements: Placement[] = buildings.map((b) => ({
    worldX: b.worldX,
    worldZ: b.worldZ,
    type: b.type,
    assetKey: b.assetKey,
    rotY: b.rotY,
    level: b.level,
    source: 'real' as const,
    buildingId: b.buildingId,
    ownerId: b.ownerId?.toString() ?? undefined,
  }));

  return {
    chunkX,
    chunkZ,
    placements,
    meta: {
      generatedAt: new Date().toISOString(),
    },
  };
}

/** Find occupied parcels at given world coordinates */
export async function findOccupiedParcels(
  cityId: string,
  coords: Array<{ worldX: number; worldZ: number }>,
): Promise<IParcel[]> {
  if (coords.length === 0) return [];

  return Parcel.find({
    cityId,
    $or: coords.map(({ worldX, worldZ }) => ({ worldX, worldZ })),
    buildingId: { $ne: null },
  }).lean();
}

/** Create a building document */
export async function createBuilding(data: CreateBuildingInput): Promise<IBuilding> {
  const doc = await BuildingModel.create({ ...data, ownerId: data.ownerId ?? null });
  return doc.toObject();
}

/** Upsert parcels for a building footprint */
export async function upsertFootprintParcels(
  cityId: string,
  buildingId: string,
  tiles: Array<{ worldX: number; worldZ: number }>,
): Promise<void> {
  const ops = tiles.map(({ worldX, worldZ }) => ({
    updateOne: {
      filter: { cityId, worldX, worldZ },
      update: {
        $set: {
          buildingId,
          ...worldToChunk(worldX, worldZ),
        },
        $setOnInsert: {
          cityId,
          worldX,
          worldZ,
          ownerId: null,
          zone: null,
          districtId: null,
        },
      },
      upsert: true,
    },
  }));

  await Parcel.bulkWrite(ops);
}

/** Find a building by buildingId */
export async function findBuilding(cityId: string, buildingId: string) {
  return BuildingModel.findOne({ cityId, buildingId }).lean();
}

/** Delete a building */
export async function deleteBuilding(cityId: string, buildingId: string): Promise<boolean> {
  const result = await BuildingModel.deleteOne({ cityId, buildingId });
  return result.deletedCount > 0;
}

/** Clear buildingId from parcels that reference a building */
export async function clearBuildingFromParcels(cityId: string, buildingId: string): Promise<number> {
  const result = await Parcel.updateMany(
    { cityId, buildingId },
    { $set: { buildingId: null } },
  );
  return result.modifiedCount;
}

/** Get a single parcel by coordinates */
export async function getParcel(
  cityId: string,
  worldX: number,
  worldZ: number,
): Promise<IParcel | null> {
  return Parcel.findOne({ cityId, worldX, worldZ }).lean();
}

/** Buy (claim ownership of) a parcel */
export async function buyParcel(
  cityId: string,
  worldX: number,
  worldZ: number,
  ownerId: string,
): Promise<IParcel> {
  const { chunkX, chunkZ } = worldToChunk(worldX, worldZ);
  const parcel = await Parcel.findOneAndUpdate(
    { cityId, worldX, worldZ },
    {
      $set: { ownerId },
      $setOnInsert: { cityId, worldX, worldZ, chunkX, chunkZ, buildingId: null, zone: null, districtId: null },
    },
    { upsert: true, new: true },
  ).lean();
  return parcel as IParcel;
}
