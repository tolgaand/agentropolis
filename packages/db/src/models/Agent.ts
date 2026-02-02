import mongoose, { Schema, Document } from 'mongoose';
import type { AgentType, AgentSoul, WorldId, CompactParcelDNA } from '@agentropolis/shared';
import { ECONOMY } from '@agentropolis/shared';

export interface AgentDocument extends Document {
  name: string;
  type: AgentType;
  aiModel: string;                  // Full model name (e.g., "claude-3-opus")
  worldId: WorldId;                 // Auto-assigned based on aiModel
  factionId: WorldId;               // V2: Same value as worldId, for faction-based queries
  description: string;
  apiKeyHash: string;
  walletBalance: number;            // Legacy: primary currency balance
  balances: Map<string, number>;    // Multi-currency: { CLD: 100, GPT: 50, ... }
  inventory: Map<string, number>;   // Resource inventory: { food: 100, wood: 50, ... }
  reputation: number;
  honor: number;                    // Honor score (0-100, starts at 100)
  parcelId?: string;
  parcelDNA?: CompactParcelDNA;
  legacyMessage?: string;
  registeredAt: Date;
  soul?: AgentSoul;
  stats: {
    totalContributions: number;
    totalEarned: number;
    totalSpent: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const agentSoulSchema = new Schema(
  {
    archetype: { type: String },
    tone: { type: String },
    goals: [{ type: String }],
  },
  { _id: false }
);

const agentSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 50 },
    type: {
      type: String,
      required: true,
      enum: ['Claude', 'Codex', 'Gemini', 'Grok', 'OpenAI', 'Other'],
    },
    aiModel: { type: String, required: true },
    worldId: {
      type: String,
      required: true,
      enum: ['claude_nation', 'openai_empire', 'gemini_republic', 'grok_syndicate', 'open_frontier'],
    },
    factionId: {
      type: String,
      required: true,
      enum: ['claude_nation', 'openai_empire', 'gemini_republic', 'grok_syndicate', 'open_frontier'],
    },
    description: { type: String, required: true, maxlength: 500 },
    apiKeyHash: { type: String, required: true, select: false },
    walletBalance: { type: Number, required: true, default: ECONOMY.STARTING_GOLD, min: 0 },
    balances: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    inventory: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    reputation: { type: Number, required: true, default: 0, min: 0 },
    honor: { type: Number, required: true, default: 100, min: 0, max: 100 },
    parcelId: { type: String },
    // Parcel DNA — CompactParcelDNA format (~80 bytes)
    parcelDNA: {
      v: { type: Number },               // DNA version
      s: { type: String },               // layoutSeed (16 char hex)
      t: { type: String },               // theme
      tr: { type: String },              // terrain type (plains/forest/mountain/mine/river/volcanic)
      fs: { type: Number },              // fertility stars (1-5)
      sb: { type: String },              // starting building
      ro: { type: Number },              // registration order
    },
    legacyMessage: { type: String, maxlength: 280 },
    registeredAt: { type: Date, default: Date.now },
    soul: { type: agentSoulSchema },
    stats: {
      totalContributions: { type: Number, default: 0 },
      totalEarned: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      transform: (_doc: any, ret: any) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.apiKeyHash;
        // Convert balances Map to plain object
        if (ret.balances instanceof Map) {
          ret.balances = Object.fromEntries(ret.balances);
        }
        // Convert inventory Map to plain object
        if (ret.inventory instanceof Map) {
          ret.inventory = Object.fromEntries(ret.inventory);
        }
        return ret;
      },
    },
  }
);

// Indexes for common queries
agentSchema.index({ type: 1 });
agentSchema.index({ worldId: 1 });
agentSchema.index({ factionId: 1 });
agentSchema.index({ aiModel: 1 });
agentSchema.index({ reputation: -1 });
agentSchema.index({ 'stats.totalContributions': -1 });
agentSchema.index({ createdAt: -1 });
agentSchema.index({ registeredAt: -1 });

export const AgentModel = mongoose.model<AgentDocument>('Agent', agentSchema);
