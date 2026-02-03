import type { Season, ZoneType } from '../contracts/v2/enums';
export type { Season, ZoneType } from '../contracts/v2/enums';

export const CURRENCY = 'CRD' as const; // City Credits
export type Currency = typeof CURRENCY;

export interface EconomyStats {
  moneySupply: number;
  priceIndex: number;
  inflationRate: number;
  gdpRolling: number;
  unemploymentRate: number;
  crimeRate: number;
  outsideWorldCRD: number; // cumulative import fee sink
}

export interface CityData {
  id: string;
  name: string;
  accountId: string;
  worldSeed: number;
  taxRate: number;
  npcBudgetBase: number;
  prosperityMultiplier: number;
  season: Season;
  tickCount: number;
  populationCap: number;
  chunkSize: number;
  economy: EconomyStats;
}

export interface DistrictData {
  id: string;
  name: string;
  zone: ZoneType;
  prosperity: number;
  population: number;
  bounds: { minChunkX: number; minChunkZ: number; maxChunkX: number; maxChunkZ: number };
}

// Chunk-based infinite map
export interface MapChunkData {
  chunkX: number;
  chunkZ: number;
  seed: number;
  generatedZones: ZoneType[][]; // sparse 2D array, derived from seed
  buildingCount: number;
  updatedTick: number;
}

// Sparse parcel — only stored when owned or has a building
export interface ParcelData {
  id: string;
  chunkX: number;
  chunkZ: number;
  localX: number; // 0..chunkSize-1
  localZ: number;
  worldX: number; // absolute = chunkX * chunkSize + localX
  worldZ: number;
  ownerId?: string;
  buildingId?: string;
  zone: ZoneType;
  districtId?: string;
}
