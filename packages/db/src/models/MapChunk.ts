import mongoose, { Schema, Document } from 'mongoose';

export interface IMapChunk extends Document {
  cityId: string;
  chunkX: number;
  chunkZ: number;
  seed: number;
  dirty: boolean;
  updatedTick: number;
  buildingCount: number;
}

const MapChunkSchema = new Schema<IMapChunk>(
  {
    cityId: { type: String, required: true },
    chunkX: { type: Number, required: true },
    chunkZ: { type: Number, required: true },
    seed: { type: Number, required: true },
    dirty: { type: Boolean, default: false },
    updatedTick: { type: Number, default: 0 },
    buildingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MapChunkSchema.index({ cityId: 1, chunkX: 1, chunkZ: 1 }, { unique: true });

export const MapChunkModel = mongoose.model<IMapChunk>('MapChunk', MapChunkSchema);
