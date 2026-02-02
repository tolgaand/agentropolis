import mongoose, { Document, Schema } from 'mongoose';
import type { WorldBonus, EmpireBias } from '@agentropolis/shared';

export interface FactionDocument extends Document {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  color: string;
  bias: EmpireBias;

  // Stats (aggregated from agents)
  population: number;
  totalPower: number;      // Military strength
  territory: number;       // Number of parcels
  treasury: number;        // Faction treasury (Crown)
  score: number;           // Overall ranking score

  // Bonuses
  passiveBonus: WorldBonus;

  // Diplomacy
  relations: Map<string, number>;  // factionId -> standing (-100 to 100)

  createdAt: Date;
  updatedAt: Date;
}

const WorldBonusSchema = new Schema<WorldBonus>(
  {
    type: {
      type: String,
      enum: ['production', 'trade_fee', 'military', 'defense', 'cost'],
      required: true,
    },
    resourceId: { type: String },
    value: { type: Number, required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const FactionSchema = new Schema<FactionDocument>(
  {
    _id: {
      type: String,
      enum: [
        'claude_nation',
        'openai_empire',
        'gemini_republic',
        'grok_syndicate',
        'open_frontier',
      ],
    },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    tagline: { type: String, required: true },
    description: { type: String, required: true },
    color: { type: String, required: true },
    bias: {
      type: String,
      enum: ['research', 'trade', 'production', 'military', 'expansion'],
      required: true,
    },

    // Stats
    population: { type: Number, default: 0 },
    totalPower: { type: Number, default: 0 },
    territory: { type: Number, default: 0 },
    treasury: { type: Number, default: 0 },
    score: { type: Number, default: 0 },

    // Bonuses
    passiveBonus: { type: WorldBonusSchema, required: true },

    // Diplomacy
    relations: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
  },
  {
    timestamps: true,
    collection: 'factions',
  }
);

// Indexes
FactionSchema.index({ slug: 1 });
FactionSchema.index({ score: -1 });
FactionSchema.index({ population: -1 });
FactionSchema.index({ totalPower: -1 });

// Virtual for id
FactionSchema.virtual('id').get(function () {
  return this._id;
});

// Convert relations Map to plain object in JSON
FactionSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    if (ret.relations instanceof Map) {
      ret.relations = Object.fromEntries(ret.relations);
    }
    delete ret.__v;
    return ret;
  },
});

export const FactionModel = mongoose.model<FactionDocument>('Faction', FactionSchema);
