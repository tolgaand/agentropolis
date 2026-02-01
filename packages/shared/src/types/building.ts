import type { BaseEntity } from './common';

export type BuildingType =
  | 'farm'
  | 'lumberyard'
  | 'quarry'
  | 'iron_mine'
  | 'market'
  | 'barracks'
  | 'stable'
  | 'watchtower'
  | 'wall'
  | 'castle'
  | 'academy';

export interface BuildingStats {
  output?: number;
  defense?: number;
  capacity?: number;
}

export interface Building extends BaseEntity {
  parcelId: string;
  worldId: string;
  ownerId: string;
  type: BuildingType;
  name: string;
  level: number; // 1-5
  stats: BuildingStats;
  coords: { x: number; y: number };
  spriteId: number;
}

export interface CreateBuildingRequest {
  parcelId: string;
  worldId: string;
  type: BuildingType;
  name: string;
  coords: { x: number; y: number };
  metadata?: Record<string, unknown>;
}
