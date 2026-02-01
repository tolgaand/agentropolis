import mongoose, { Schema, Document, Types } from 'mongoose';
import type { BuildingType, BuildingStats } from '@agentropolis/shared';

export interface BuildingDocument extends Document {
  parcelId: string;
  worldId: string;
  ownerId: Types.ObjectId;
  type: BuildingType;
  name: string;
  level: number;
  stats: BuildingStats;
  coords: { x: number; y: number };
  spriteId: number;
  createdAt: Date;
  updatedAt: Date;
}

const buildingStatsSchema = new Schema(
  {
    capacity: { type: Number, min: 0 },
    feeModifier: { type: Number, min: 0, max: 2 },
    visitorBoost: { type: Number, min: 0 },
  },
  { _id: false }
);

const buildingSchema = new Schema(
  {
    parcelId: { type: String, required: true, index: true },
    worldId: { type: String, required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    type: {
      type: String,
      required: true,
      enum: ['farm', 'lumberyard', 'quarry', 'iron_mine', 'market', 'barracks', 'stable', 'watchtower', 'wall', 'castle', 'academy'],
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    level: { type: Number, default: 1, min: 1, max: 5 },
    stats: { type: buildingStatsSchema, default: {} },
    coords: {
      x: { type: Number, required: true },
      y: { type: Number, required: true },
    },
    spriteId: { type: Number, required: true, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index to ensure unique position per parcel
buildingSchema.index({ parcelId: 1, 'coords.x': 1, 'coords.y': 1 }, { unique: true });

// Query indexes
buildingSchema.index({ ownerId: 1 });
buildingSchema.index({ type: 1 });
buildingSchema.index({ level: -1 });

export const BuildingModel = mongoose.model<BuildingDocument>('Building', buildingSchema);
