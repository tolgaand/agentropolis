/**
 * V2ChunkStats - Event-driven per-chunk building histogram
 *
 * Maintains cached stats that update incrementally as buildings
 * are added/removed. No polling, no re-counting.
 */

import { type BuildingInfo } from './V2Stores';

export interface ChunkStat {
  totalBuildings: number;
  totalLevel: number;
  buildingCountsByType: Record<string, number>;
}

function emptyStats(): ChunkStat {
  return { totalBuildings: 0, totalLevel: 0, buildingCountsByType: {} };
}

function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

export class ChunkStatsCache {
  private cache = new Map<string, ChunkStat>();

  onBuildingAdded(b: BuildingInfo): void {
    const key = chunkKey(b.chunkX, b.chunkZ);
    let stat = this.cache.get(key);
    if (!stat) {
      stat = emptyStats();
      this.cache.set(key, stat);
    }
    stat.totalBuildings++;
    stat.totalLevel += b.level;
    stat.buildingCountsByType[b.assetKey] = (stat.buildingCountsByType[b.assetKey] ?? 0) + 1;
  }

  onBuildingRemoved(b: BuildingInfo): void {
    const key = chunkKey(b.chunkX, b.chunkZ);
    const stat = this.cache.get(key);
    if (!stat) return;
    stat.totalBuildings = Math.max(0, stat.totalBuildings - 1);
    stat.totalLevel = Math.max(0, stat.totalLevel - b.level);
    const count = (stat.buildingCountsByType[b.assetKey] ?? 0) - 1;
    if (count <= 0) {
      delete stat.buildingCountsByType[b.assetKey];
    } else {
      stat.buildingCountsByType[b.assetKey] = count;
    }
    if (stat.totalBuildings === 0) {
      this.cache.delete(key);
    }
  }

  reset(): void {
    this.cache.clear();
  }

  getStats(chunkX: number, chunkZ: number): ChunkStat {
    return this.cache.get(chunkKey(chunkX, chunkZ)) ?? emptyStats();
  }

  getNeighborhood(chunkX: number, chunkZ: number): ChunkStat {
    const agg = emptyStats();
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const stat = this.cache.get(chunkKey(chunkX + dx, chunkZ + dz));
        if (!stat) continue;
        agg.totalBuildings += stat.totalBuildings;
        agg.totalLevel += stat.totalLevel;
        for (const [type, count] of Object.entries(stat.buildingCountsByType)) {
          agg.buildingCountsByType[type] = (agg.buildingCountsByType[type] ?? 0) + count;
        }
      }
    }
    return agg;
  }
}
