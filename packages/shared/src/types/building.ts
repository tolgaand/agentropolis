import type { ZoneType } from './city';
import type { Profession } from './agent';

export type BuildingStatus = 'active' | 'abandoned' | 'under_construction' | 'temporarily_closed';

export type BuildingType =
  | 'police_station'
  | 'coffee_shop'
  | 'bar'
  | 'supermarket'
  | 'residential_small'
  | 'park';

export interface BuildingCatalogEntry {
  type: BuildingType;
  name: string;
  zone: ZoneType;
  tileW: number;
  tileD: number;
  baseIncome: number;
  baseOperatingCost: number;
  maxEmployees: number;
  professions: Profession[];
  constructionCost: number;
  glbModels: string[];
}

export interface BuildingData {
  id: string;
  type: BuildingType;
  status: BuildingStatus;
  level: number;
  worldX: number;
  worldZ: number;
  tileW: number;
  tileD: number;
  chunkX: number;
  chunkZ: number;
  ownerId?: string;
  ownerName?: string;
  accountId: string;
  districtId: string;
  cityId: string;
  income: number;
  operatingCost: number;
  maxEmployees: number;
  employees: string[];
  glbModel: string;
  lastPayoutTick: number;
}
