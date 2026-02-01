import mongoose, { Document, Schema } from 'mongoose';
import type { Currency, WorldBonus } from '@agentropolis/shared';

export interface WorldDocument extends Document {
  name: string;
  slug: string;
  tagline: string;
  description: string;

  // Identity
  modelPatterns: string[];
  currency: Currency;
  specializations: string[];
  aesthetic: string;

  // Economy
  gdp: number;
  gdpPerCapita: number;
  population: number;
  tradeBalance: number;
  prosperityIndex: number;

  // Resources
  inventory: Map<string, number>;
  productionRates: Map<string, number>;
  demand: Map<string, number>;

  // Trade stats
  totalExports: number;
  totalImports: number;
  exportRevenue: number;
  importCost: number;

  // Config
  passiveBonus: WorldBonus;
  currencyVolatility: number;
  baseExchangeRate: number;
  currentExchangeRate: number;

  // Meta
  createdAt: Date;
  updatedAt: Date;
  lastTickAt: Date;
}

const CurrencySchema = new Schema<Currency>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    symbol: { type: String, required: true },
  },
  { _id: false }
);

const WorldBonusSchema = new Schema<WorldBonus>(
  {
    type: {
      type: String,
      enum: ['production', 'trade_fee', 'multimodal', 'realtime', 'cost'],
      required: true,
    },
    resourceId: { type: String },
    value: { type: Number, required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const WorldSchema = new Schema<WorldDocument>(
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

    // Identity
    modelPatterns: [{ type: String }],
    currency: { type: CurrencySchema, required: true },
    specializations: [{ type: String }],
    aesthetic: { type: String },

    // Economy
    gdp: { type: Number, default: 0 },
    gdpPerCapita: { type: Number, default: 0 },
    population: { type: Number, default: 0 },
    tradeBalance: { type: Number, default: 0 },
    prosperityIndex: { type: Number, default: 50, min: 0, max: 100 },

    // Resources (stored as Map for dynamic keys)
    inventory: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    productionRates: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
    demand: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    // Trade stats
    totalExports: { type: Number, default: 0 },
    totalImports: { type: Number, default: 0 },
    exportRevenue: { type: Number, default: 0 },
    importCost: { type: Number, default: 0 },

    // Config
    passiveBonus: { type: WorldBonusSchema, default: null },
    currencyVolatility: { type: Number, default: 0.15, min: 0, max: 1 },
    baseExchangeRate: { type: Number, default: 1.0 },
    currentExchangeRate: { type: Number, default: 1.0 },

    // Meta
    lastTickAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: 'worlds',
  }
);

// Indexes
WorldSchema.index({ slug: 1 });
WorldSchema.index({ prosperityIndex: -1 });
WorldSchema.index({ gdp: -1 });
WorldSchema.index({ population: -1 });

// Virtual for id
WorldSchema.virtual('id').get(function () {
  return this._id;
});

// Convert inventory/productionRates/demand Maps to plain objects in JSON
WorldSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    if (ret.inventory instanceof Map) {
      ret.inventory = Object.fromEntries(ret.inventory);
    }
    if (ret.productionRates instanceof Map) {
      ret.productionRates = Object.fromEntries(ret.productionRates);
    }
    if (ret.demand instanceof Map) {
      ret.demand = Object.fromEntries(ret.demand);
    }
    delete ret.__v;
    return ret;
  },
});

export const WorldModel = mongoose.model<WorldDocument>('World', WorldSchema);
