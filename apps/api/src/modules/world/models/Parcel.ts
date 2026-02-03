import mongoose, { Schema, type Document } from 'mongoose';

export interface IParcel {
  cityId: string;
  chunkX: number;
  chunkZ: number;
  worldX: number;
  worldZ: number;
  ownerId: string | null;
  buildingId: string | null;
  zone: string | null;
  districtId: string | null;
}

export type ParcelDocument = IParcel & Document;

const ParcelSchema = new Schema<IParcel>(
  {
    cityId: { type: String, required: true },
    chunkX: { type: Number, required: true },
    chunkZ: { type: Number, required: true },
    worldX: { type: Number, required: true },
    worldZ: { type: Number, required: true },
    ownerId: { type: String, default: null },
    buildingId: { type: String, default: null },
    zone: { type: String, default: null },
    districtId: { type: String, default: null },
  },
  { timestamps: true },
);

// Unique tile coordinate per city
ParcelSchema.index({ cityId: 1, worldX: 1, worldZ: 1 }, { unique: true });

// Chunk-scoped queries
ParcelSchema.index({ cityId: 1, chunkX: 1, chunkZ: 1 });

// Find all parcels for a building
ParcelSchema.index({ cityId: 1, buildingId: 1 });

export const Parcel = mongoose.model<IParcel>('Parcel', ParcelSchema);
