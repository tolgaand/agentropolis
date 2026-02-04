import mongoose, { Schema, Document, Types } from 'mongoose';
import type { AccountOwnerType, AccountStatus } from '@agentropolis/shared';
import { CURRENCY } from '@agentropolis/shared';

export interface IAccount extends Document {
  ownerType: AccountOwnerType;
  ownerId: Types.ObjectId;
  currency: string;
  balance: number;
  reserved: number;
  status: AccountStatus;
}

const AccountSchema = new Schema<IAccount>(
  {
    ownerType: { type: String, enum: ['agent', 'city', 'building', 'district', 'npc_pool', 'demand_budget'], required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    currency: { type: String, default: CURRENCY },
    balance: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'frozen'], default: 'active' },
  },
  { timestamps: true }
);

AccountSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });
AccountSchema.index({ status: 1 });

export const AccountModel = mongoose.model<IAccount>('Account', AccountSchema);
