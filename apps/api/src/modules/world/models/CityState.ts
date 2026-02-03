import mongoose, { Schema, type Document } from 'mongoose';

export interface ICityState {
  cityId: string;
  seed: number;
  activeRadiusChunks: number;
}

export type CityStateDocument = ICityState & Document;

const CityStateSchema = new Schema<ICityState>(
  {
    cityId: { type: String, required: true },
    seed: { type: Number, required: true, default: 42 },
    activeRadiusChunks: { type: Number, required: true, default: 3 },
  },
  { timestamps: true },
);

CityStateSchema.index({ cityId: 1 }, { unique: true });

export const CityState = mongoose.model<ICityState>('CityState', CityStateSchema);
