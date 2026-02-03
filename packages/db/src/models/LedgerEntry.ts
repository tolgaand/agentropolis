import mongoose, { Schema, Document, Types } from 'mongoose';
import type { TransactionType } from '@agentropolis/shared';
import { CURRENCY } from '@agentropolis/shared';

export interface ILedgerMeta {
  buildingId?: Types.ObjectId;
  districtId?: Types.ObjectId;
  caseId?: Types.ObjectId;
  proposalId?: Types.ObjectId;
  reason?: string;
}

export interface ILedgerEntry extends Document {
  debitAccountId: Types.ObjectId;
  creditAccountId: Types.ObjectId;
  amount: number;
  currency: string;
  type: TransactionType;
  tick: number;
  meta?: ILedgerMeta;
}

const LedgerMetaSchema = new Schema<ILedgerMeta>(
  {
    buildingId: { type: Schema.Types.ObjectId, default: null },
    districtId: { type: Schema.Types.ObjectId, default: null },
    caseId: { type: Schema.Types.ObjectId, default: null },
    proposalId: { type: Schema.Types.ObjectId, default: null },
    reason: { type: String, default: null },
  },
  { _id: false }
);

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    debitAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    creditAccountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: CURRENCY },
    type: { type: String, required: true },
    tick: { type: Number, required: true },
    meta: { type: LedgerMetaSchema, default: null },
  },
  { timestamps: true }
);

LedgerEntrySchema.index({ tick: -1 });
LedgerEntrySchema.index({ debitAccountId: 1, tick: -1 });
LedgerEntrySchema.index({ creditAccountId: 1, tick: -1 });
LedgerEntrySchema.index({ type: 1, tick: -1 });

export const LedgerEntryModel = mongoose.model<ILedgerEntry>('LedgerEntry', LedgerEntrySchema);
