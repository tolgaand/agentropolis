import mongoose, { Schema, Document } from 'mongoose';
import type { ZoneType } from '@agentropolis/shared';

export interface IDistrictBounds {
  minChunkX: number;
  minChunkZ: number;
  maxChunkX: number;
  maxChunkZ: number;
}

export interface IDistrict extends Document {
  name: string;
  zone: ZoneType;
  prosperity: number;
  population: number;
  cityId: string;
  bounds: IDistrictBounds;
}

const BoundsSchema = new Schema<IDistrictBounds>(
  {
    minChunkX: { type: Number, default: 0 },
    minChunkZ: { type: Number, default: 0 },
    maxChunkX: { type: Number, default: 0 },
    maxChunkZ: { type: Number, default: 0 },
  },
  { _id: false }
);

const DistrictSchema = new Schema<IDistrict>(
  {
    name: { type: String, required: true },
    zone: { type: String, enum: ['residential', 'commercial', 'park', 'civic'], required: true },
    prosperity: { type: Number, default: 50 },
    population: { type: Number, default: 0 },
    cityId: { type: String, required: true },
    bounds: { type: BoundsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

DistrictSchema.index({ cityId: 1 });
DistrictSchema.index({ cityId: 1, zone: 1 });

export const DistrictModel = mongoose.model<IDistrict>('District', DistrictSchema);
