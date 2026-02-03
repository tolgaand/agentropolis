import mongoose, { Schema, Document, Types } from 'mongoose';
import type { Profession, CareerPath, Qualification, AgentStats, AgentStatus, AgentNeeds } from '@agentropolis/shared';

export interface IAgent extends Document {
  name: string;
  aiModel: string;
  profession: Profession;
  career: CareerPath;
  status: AgentStatus;
  accountId: Types.ObjectId;
  cityId: string;
  stats: AgentStats;
  needs: AgentNeeds;
  jailedAtTick: number;
  employedAt?: Types.ObjectId;
  homeId?: Types.ObjectId;
  homeDistrictId?: Types.ObjectId;
  reputation: number;
  qualifications: Qualification[];
  lastActiveTick: number;
  apiKeyHash: string;
}

const AgentStatsSchema = new Schema<AgentStats>(
  {
    workHours: { type: Number, default: 0 },
    crimeCount: { type: Number, default: 0 },
    successfulThefts: { type: Number, default: 0 },
    taxPaidTotal: { type: Number, default: 0 },
    lastCrimeTick: { type: Number, default: 0 },
  },
  { _id: false }
);

const AgentNeedsSchema = new Schema<AgentNeeds>(
  {
    hunger: { type: Number, default: 80 },
    rest: { type: Number, default: 80 },
    fun: { type: Number, default: 50 },
  },
  { _id: false }
);

const AgentSchema = new Schema<IAgent>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    aiModel: { type: String, required: true },
    profession: { type: String, default: 'worker' },
    career: { type: String, enum: ['business', 'law'], default: 'business' },
    status: { type: String, enum: ['active', 'jailed'], default: 'active' },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    cityId: { type: String, required: true },
    stats: { type: AgentStatsSchema, default: () => ({}) },
    needs: { type: AgentNeedsSchema, default: () => ({ hunger: 80, rest: 80, fun: 50 }) },
    jailedAtTick: { type: Number, default: 0 },
    employedAt: { type: Schema.Types.ObjectId, ref: 'Building', default: null },
    homeId: { type: Schema.Types.ObjectId, ref: 'Building', default: null },
    homeDistrictId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    reputation: { type: Number, default: 0 },
    qualifications: [{ type: String }],
    lastActiveTick: { type: Number, default: 0 },
    apiKeyHash: { type: String, required: true, select: false },
  },
  { timestamps: true }
);

AgentSchema.index({ cityId: 1, profession: 1 });
AgentSchema.index({ cityId: 1, status: 1 });
AgentSchema.index({ cityId: 1, employedAt: 1 });
AgentSchema.index({ cityId: 1, career: 1 });

export const AgentModel = mongoose.model<IAgent>('Agent', AgentSchema);
