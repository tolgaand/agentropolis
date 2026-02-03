/**
 * Coordinate types and pure helpers for the 16x16 chunk grid system.
 *
 * Used by both backend (worldRepo) and frontend (V2Config/V2MultiDataSource).
 */

export interface ChunkCoord {
  chunkX: number;
  chunkZ: number;
}

export interface WorldCoord {
  worldX: number;
  worldZ: number;
}

export const CHUNK_SIZE = 16;
export const ROAD_INTERVAL = 4;

/** Convert world coordinates to chunk coordinates */
export function worldToChunk(worldX: number, worldZ: number): ChunkCoord {
  return {
    chunkX: Math.floor(worldX / CHUNK_SIZE),
    chunkZ: Math.floor(worldZ / CHUNK_SIZE),
  };
}

/** Convert chunk coordinates to world coordinates (top-left corner of chunk) */
export function chunkToWorld(chunkX: number, chunkZ: number): WorldCoord {
  return {
    worldX: chunkX * CHUNK_SIZE,
    worldZ: chunkZ * CHUNK_SIZE,
  };
}

/** Convert world coordinates to local coordinates within a chunk (0..CHUNK_SIZE-1) */
export function worldToLocal(worldX: number, worldZ: number): { localX: number; localZ: number } {
  return {
    localX: ((worldX % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
    localZ: ((worldZ % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
  };
}

/** Check if a world coordinate is buildable (not a road tile) */
export function isBuildable(worldX: number, worldZ: number): boolean {
  const { localX, localZ } = worldToLocal(worldX, worldZ);
  return (localX % ROAD_INTERVAL !== 0) && (localZ % ROAD_INTERVAL !== 0);
}
