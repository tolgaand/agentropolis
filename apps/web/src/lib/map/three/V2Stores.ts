/**
 * V2Stores - Sparse in-memory stores for parcels and buildings
 *
 * These stores are empty by default (pure procedural rendering).
 * When backend connects, data flows into these stores and
 * V2Composer merges them with procedural placements.
 */

// ============ TYPES ============

export interface ParcelInfo {
  worldX: number;
  worldZ: number;
  ownerId?: string;
  ownerName?: string;
}

export interface BuildingInfo {
  id: string;
  worldX: number;
  worldZ: number;
  chunkX: number;
  chunkZ: number;
  localX: number;
  localZ: number;
  type: string;         // building catalog key
  level: number;
  assetKey: string;     // ASSET_REGISTRY key for rendering
  tileW: number;
  tileD: number;
  rotation?: number;
}

// ============ PARCEL STORE ============

export class ParcelStore {
  private parcels = new Map<string, ParcelInfo>();

  private key(worldX: number, worldZ: number): string {
    return `${worldX},${worldZ}`;
  }

  get(worldX: number, worldZ: number): ParcelInfo | undefined {
    return this.parcels.get(this.key(worldX, worldZ));
  }

  set(worldX: number, worldZ: number, info: ParcelInfo): void {
    this.parcels.set(this.key(worldX, worldZ), info);
  }

  has(worldX: number, worldZ: number): boolean {
    return this.parcels.has(this.key(worldX, worldZ));
  }

  delete(worldX: number, worldZ: number): boolean {
    return this.parcels.delete(this.key(worldX, worldZ));
  }

  clear(): void {
    this.parcels.clear();
  }

  getAll(): ParcelInfo[] {
    return Array.from(this.parcels.values());
  }

  get size(): number {
    return this.parcels.size;
  }
}

// ============ BUILDING STORE ============

export class BuildingStore {
  private buildings = new Map<string, BuildingInfo>();
  private chunkIndex = new Map<string, Set<string>>();

  private chunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX},${chunkZ}`;
  }

  add(building: BuildingInfo): void {
    this.buildings.set(building.id, building);

    const ck = this.chunkKey(building.chunkX, building.chunkZ);
    let set = this.chunkIndex.get(ck);
    if (!set) {
      set = new Set();
      this.chunkIndex.set(ck, set);
    }
    set.add(building.id);
  }

  get(id: string): BuildingInfo | undefined {
    return this.buildings.get(id);
  }

  remove(id: string): boolean {
    const building = this.buildings.get(id);
    if (!building) return false;

    this.buildings.delete(id);
    const ck = this.chunkKey(building.chunkX, building.chunkZ);
    const set = this.chunkIndex.get(ck);
    if (set) {
      set.delete(id);
      if (set.size === 0) this.chunkIndex.delete(ck);
    }
    return true;
  }

  getBuildingsInChunk(chunkX: number, chunkZ: number): BuildingInfo[] {
    const ck = this.chunkKey(chunkX, chunkZ);
    const set = this.chunkIndex.get(ck);
    if (!set) return [];

    const result: BuildingInfo[] = [];
    for (const id of set) {
      const b = this.buildings.get(id);
      if (b) result.push(b);
    }
    return result;
  }

  getAll(): BuildingInfo[] {
    return Array.from(this.buildings.values());
  }

  clear(): void {
    this.buildings.clear();
    this.chunkIndex.clear();
  }

  get size(): number {
    return this.buildings.size;
  }
}
