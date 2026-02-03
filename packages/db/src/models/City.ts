import mongoose, { Schema, Document, Types } from 'mongoose';
import type { Season, EconomyStats } from '@agentropolis/shared';

export interface ICity extends Document {
  cityId: string;
  name: string;
  accountId: Types.ObjectId;
  worldSeed: number;
  taxRate: number;
  npcBudgetBase: number;
  prosperityMultiplier: number;
  season: Season;
  tickCount: number;
  populationCap: number;
  chunkSize: number;
  economy: EconomyStats;
}

const EconomyStatsSchema = new Schema<EconomyStats>(
  {
    moneySupply: { type: Number, default: 0 },
    priceIndex: { type: Number, default: 100 },
    inflationRate: { type: Number, default: 0 },
    gdpRolling: { type: Number, default: 0 },
    unemploymentRate: { type: Number, default: 0 },
    crimeRate: { type: Number, default: 0 },
    outsideWorldCRD: { type: Number, default: 0 },
  },
  { _id: false }
);

const CitySchema = new Schema<ICity>(
  {
    cityId: { type: String, required: true, unique: true },
    name: { type: String, required: true, unique: true, default: 'Agentropolis' },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
    worldSeed: { type: Number, default: () => Math.floor(Math.random() * 2147483647) },
    taxRate: { type: Number, default: 0.1 },
    npcBudgetBase: { type: Number, default: 200 },
    prosperityMultiplier: { type: Number, default: 1.0 },
    season: { type: String, enum: ['spring', 'summer', 'autumn', 'winter'], default: 'spring' },
    tickCount: { type: Number, default: 0 },
    populationCap: { type: Number, default: 100 },
    chunkSize: { type: Number, default: 16 },
    economy: { type: EconomyStatsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

export const CityModel = mongoose.model<ICity>('City', CitySchema);
