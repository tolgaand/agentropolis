/**
 * V2DataSource - Abstraction layer for city data persistence
 *
 * CityDataSource interface defines the contract for reading/writing
 * override data. This phase only implements OfflineDataSource
 * (in-memory + localStorage). Future phases will add SocketDataSource
 * for real backend integration.
 */

import { type BuildingInfo } from './V2Stores';

// ============ INTERFACES ============

export interface ParcelOverride {
  worldX: number;
  worldZ: number;
  ownerId?: string;
  ownerName?: string;
}

export interface CityDataSource {
  getChunkOverrides(chunkX: number, chunkZ: number): Promise<BuildingInfo[]>;
  setBuilding(b: BuildingInfo): Promise<void>;
  removeBuilding(id: string): Promise<void>;
  getParcel(worldX: number, worldZ: number): Promise<ParcelOverride | null>;
  setParcel(p: ParcelOverride): Promise<void>;
  loadAll(): Promise<{ buildings: BuildingInfo[]; parcels: ParcelOverride[] }>;
}

// ============ OFFLINE DATA SOURCE ============

const STORAGE_VERSION = 1;
const STORAGE_KEY_VERSION = 'agentropolis_v2_version';
const STORAGE_KEY_BUILDINGS = 'agentropolis_v2_buildings';
const STORAGE_KEY_PARCELS = 'agentropolis_v2_parcels';

export class OfflineDataSource implements CityDataSource {
  private buildings = new Map<string, BuildingInfo>();
  private chunkIndex = new Map<string, Set<string>>();
  private parcels = new Map<string, ParcelOverride>();

  constructor() {
    this.loadFromStorage();
  }

  async getChunkOverrides(chunkX: number, chunkZ: number): Promise<BuildingInfo[]> {
    const ck = `${chunkX},${chunkZ}`;
    const ids = this.chunkIndex.get(ck);
    if (!ids) return [];
    const result: BuildingInfo[] = [];
    for (const id of ids) {
      const b = this.buildings.get(id);
      if (b) result.push(b);
    }
    return result;
  }

  async setBuilding(b: BuildingInfo): Promise<void> {
    this.buildings.set(b.id, b);
    const ck = `${b.chunkX},${b.chunkZ}`;
    let set = this.chunkIndex.get(ck);
    if (!set) {
      set = new Set();
      this.chunkIndex.set(ck, set);
    }
    set.add(b.id);
    this.saveToStorage();
  }

  async removeBuilding(id: string): Promise<void> {
    const b = this.buildings.get(id);
    if (!b) return;
    this.buildings.delete(id);
    const ck = `${b.chunkX},${b.chunkZ}`;
    const set = this.chunkIndex.get(ck);
    if (set) {
      set.delete(id);
      if (set.size === 0) this.chunkIndex.delete(ck);
    }
    this.saveToStorage();
  }

  async getParcel(worldX: number, worldZ: number): Promise<ParcelOverride | null> {
    return this.parcels.get(`${worldX},${worldZ}`) ?? null;
  }

  async setParcel(p: ParcelOverride): Promise<void> {
    this.parcels.set(`${p.worldX},${p.worldZ}`, p);
    this.saveToStorage();
  }

  async loadAll(): Promise<{ buildings: BuildingInfo[]; parcels: ParcelOverride[] }> {
    return {
      buildings: Array.from(this.buildings.values()),
      parcels: Array.from(this.parcels.values()),
    };
  }

  // ============ localStorage ============

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY_VERSION, String(STORAGE_VERSION));
      const buildings = Array.from(this.buildings.values());
      localStorage.setItem(STORAGE_KEY_BUILDINGS, JSON.stringify(buildings));

      const parcels = Array.from(this.parcels.values());
      localStorage.setItem(STORAGE_KEY_PARCELS, JSON.stringify(parcels));
    } catch {
      // localStorage may be full or unavailable
    }
  }

  private loadFromStorage(): void {
    try {
      // Version check — discard stale data on schema change
      const storedVersion = localStorage.getItem(STORAGE_KEY_VERSION);
      if (storedVersion !== String(STORAGE_VERSION)) {
        localStorage.removeItem(STORAGE_KEY_BUILDINGS);
        localStorage.removeItem(STORAGE_KEY_PARCELS);
        localStorage.removeItem(STORAGE_KEY_VERSION);
        return;
      }

      const buildingsJson = localStorage.getItem(STORAGE_KEY_BUILDINGS);
      if (buildingsJson) {
        const buildings: BuildingInfo[] = JSON.parse(buildingsJson);
        for (const b of buildings) {
          this.buildings.set(b.id, b);
          const ck = `${b.chunkX},${b.chunkZ}`;
          let set = this.chunkIndex.get(ck);
          if (!set) {
            set = new Set();
            this.chunkIndex.set(ck, set);
          }
          set.add(b.id);
        }
      }

      const parcelsJson = localStorage.getItem(STORAGE_KEY_PARCELS);
      if (parcelsJson) {
        const parcels: ParcelOverride[] = JSON.parse(parcelsJson);
        for (const p of parcels) {
          this.parcels.set(`${p.worldX},${p.worldZ}`, p);
        }
      }
    } catch {
      // Corrupted data — start fresh
    }
  }

  clearAll(): void {
    this.buildings.clear();
    this.chunkIndex.clear();
    this.parcels.clear();
    try {
      localStorage.removeItem(STORAGE_KEY_VERSION);
      localStorage.removeItem(STORAGE_KEY_BUILDINGS);
      localStorage.removeItem(STORAGE_KEY_PARCELS);
    } catch {
      // Ignore
    }
  }
}
