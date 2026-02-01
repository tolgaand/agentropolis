import mongoose, { Document, Schema } from 'mongoose';
import type { ResourceCategory, ResourceRequirement } from '@agentropolis/shared';

export interface ResourceDocument extends Document {
  name: string;
  description: string;
  category: ResourceCategory;
  tier: 1 | 2 | 3 | 4;

  baseValue: number;
  volatility: number;

  // Production requirements
  requires: ResourceRequirement[];

  // World-based production multipliers
  worldAffinity: Map<string, number>;

  // Meta
  createdAt: Date;
  updatedAt: Date;
}

const ResourceRequirementSchema = new Schema<ResourceRequirement>(
  {
    resourceId: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

const ResourceSchema = new Schema<ResourceDocument>(
  {
    _id: { type: String },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['raw', 'industrial', 'data', 'finance', 'intellectual', 'tech', 'premium'],
      required: true,
    },
    tier: {
      type: Number,
      enum: [1, 2, 3, 4],
      required: true,
    },

    baseValue: { type: Number, required: true },
    volatility: { type: Number, default: 0.15, min: 0, max: 1 },

    requires: [ResourceRequirementSchema],

    worldAffinity: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
  },
  {
    timestamps: true,
    collection: 'resources',
  }
);

// Virtual for id
ResourceSchema.virtual('id').get(function () {
  return this._id;
});

// Convert worldAffinity Map to plain object in JSON
ResourceSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    if (ret.worldAffinity instanceof Map) {
      ret.worldAffinity = Object.fromEntries(ret.worldAffinity);
    }
    delete ret.__v;
    return ret;
  },
});

export const ResourceModel = mongoose.model<ResourceDocument>('Resource', ResourceSchema);
