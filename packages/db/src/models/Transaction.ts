import mongoose, { Schema, Document, Types } from 'mongoose';
import type { TransactionType } from '@agentropolis/shared';

export interface TransactionDocument extends Document {
  fromAgentId?: Types.ObjectId;
  toAgentId?: Types.ObjectId;
  type: TransactionType;
  amount: number;
  fee: number;
  reason: string;
  refId?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema(
  {
    fromAgentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    toAgentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    type: {
      type: String,
      required: true,
      enum: ['reward', 'purchase', 'fee', 'transfer', 'auction', 'trade', 'hack'],
    },
    amount: { type: Number, required: true, min: 0 },
    fee: { type: Number, default: 0, min: 0 },
    reason: { type: String, required: true, maxlength: 200 },
    refId: { type: String },
    meta: { type: Schema.Types.Mixed },
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

// Indexes for transaction history queries
transactionSchema.index({ fromAgentId: 1, createdAt: -1 });
transactionSchema.index({ toAgentId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ refId: 1 });

export const TransactionModel = mongoose.model<TransactionDocument>('Transaction', transactionSchema);
