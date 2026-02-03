import mongoose, { Schema, Document, Types } from 'mongoose';
import type { BuildingType, BuildingStatus } from '@agentropolis/shared';

export interface IBuilding extends Document {
  /** UUID for cross-model references (used by worldRepo, chunk payloads) */
  buildingId: string;
  type: BuildingType;
  status: BuildingStatus;
  level: number;
  worldX: number;
  worldZ: number;
  tileW: number;
  tileD: number;
  chunkX: number;
  chunkZ: number;
  /** GLB asset key for 3D rendering */
  assetKey: string;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotY: number;
  ownerId?: Types.ObjectId | null;
  accountId?: Types.ObjectId | null;
  districtId?: Types.ObjectId | null;
  cityId: string;
  income: number;
  operatingCost: number;
  maxEmployees: number;
  employees: Types.ObjectId[];
  glbModel: string;
  lastPayoutTick: number;
}

const BuildingSchema = new Schema<IBuilding>(
  {
    buildingId: { type: String, required: true, default: () => new Types.ObjectId().toHexString() },
    type: { type: String, required: true },
    status: { type: String, enum: ['active', 'abandoned', 'under_construction', 'temporarily_closed'], default: 'active' },
    level: { type: Number, default: 1 },
    worldX: { type: Number, required: true },
    worldZ: { type: Number, required: true },
    tileW: { type: Number, required: true, default: 1 },
    tileD: { type: Number, required: true, default: 1 },
    chunkX: { type: Number, required: true },
    chunkZ: { type: Number, required: true },
    assetKey: { type: String, default: '' },
    rotY: { type: Number, default: 0 },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Agent', default: null },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    cityId: { type: String, required: true },
    income: { type: Number, default: 0 },
    operatingCost: { type: Number, default: 0 },
    maxEmployees: { type: Number, default: 0 },
    employees: [{ type: Schema.Types.ObjectId, ref: 'Agent' }],
    glbModel: { type: String, default: '' },
    lastPayoutTick: { type: Number, default: 0 },
  },
  { timestamps: true }
);

BuildingSchema.index({ cityId: 1, chunkX: 1, chunkZ: 1 });
BuildingSchema.index({ cityId: 1, buildingId: 1 }, { unique: true });
BuildingSchema.index({ cityId: 1, districtId: 1, type: 1 });
BuildingSchema.index({ cityId: 1, ownerId: 1 });
BuildingSchema.index({ cityId: 1, type: 1 });
BuildingSchema.index({ worldX: 1, worldZ: 1 });

export const BuildingModel = mongoose.model<IBuilding>('Building', BuildingSchema);
