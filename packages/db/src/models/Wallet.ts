import mongoose, { Schema, Document, Types } from 'mongoose';
import { ECONOMY } from '@agentropolis/shared';

export interface WalletDocument extends Document {
  agentId: Types.ObjectId | string;
  balance: number;
  dailyEarned: number;
  dailyEarnedCap: number;
  dailyResetAt: string;
  lifetimeEarned: number;
  lifetimeSpent: number;
  createdAt: Date;
  updatedAt: Date;
  checkDailyReset(): boolean;
  canEarnToday(amount: number): boolean;
}

const DAILY_EARN_CAP_DEFAULT = ECONOMY.DAILY_EARNING_CAP;

const walletSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true, unique: true },
    balance: { type: Number, default: ECONOMY.STARTING_GOLD, min: 0 },
    dailyEarned: { type: Number, default: 0, min: 0 },
    dailyEarnedCap: { type: Number, default: DAILY_EARN_CAP_DEFAULT },
    dailyResetAt: { type: String, required: true },
    lifetimeEarned: { type: Number, default: 0, min: 0 },
    lifetimeSpent: { type: Number, default: 0, min: 0 },
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

// Check and reset daily earnings if needed
walletSchema.methods.checkDailyReset = function(this: WalletDocument): boolean {
  const now = new Date();
  const resetAt = new Date(this.dailyResetAt);

  if (now >= resetAt) {
    this.dailyEarned = 0;
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    this.dailyResetAt = tomorrow.toISOString();
    return true;
  }
  return false;
};

// Check if agent can earn more today
walletSchema.methods.canEarnToday = function(this: WalletDocument, amount: number): boolean {
  this.checkDailyReset();
  return this.dailyEarned + amount <= this.dailyEarnedCap;
};

walletSchema.index({ agentId: 1 });
walletSchema.index({ balance: -1 });

export const WalletModel = mongoose.model<WalletDocument>('Wallet', walletSchema);
