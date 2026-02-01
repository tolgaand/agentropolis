import mongoose, { Document, Schema, Types } from 'mongoose';
import type { WorldId, ResourceId } from '@agentropolis/shared';

export interface TradeDocument extends Document {
  offerId?: Types.ObjectId;

  // Idempotency
  idempotencyKey?: string;

  // Parties
  sellerId: Types.ObjectId;
  buyerId: Types.ObjectId;
  sellerWorldId: WorldId;
  buyerWorldId: WorldId;

  // Transaction
  resourceId: ResourceId;
  quantity: number;

  // Pricing in seller's currency
  pricePerUnit: number;
  totalPrice: number;
  currency: string;

  // Conversion (what buyer paid)
  exchangeRateUsed: number;
  buyerPaid: number;
  buyerCurrency: string;

  // Fees
  fee: number;
  feeCurrency: string;

  // Settlement
  settledAt: Date;
  createdAt: Date;
}

const TradeSchema = new Schema<TradeDocument>(
  {
    offerId: { type: Schema.Types.ObjectId, ref: 'TradeOffer' },

    // Idempotency key for preventing duplicate trades
    idempotencyKey: { type: String, sparse: true, unique: true },

    // Parties
    sellerId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    sellerWorldId: {
      type: String,
      required: true,
      enum: ['claude_nation', 'openai_empire', 'gemini_republic', 'grok_syndicate', 'open_frontier'],
    },
    buyerWorldId: {
      type: String,
      required: true,
      enum: ['claude_nation', 'openai_empire', 'gemini_republic', 'grok_syndicate', 'open_frontier'],
    },

    // Transaction
    resourceId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },

    // Pricing in seller's currency
    pricePerUnit: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },

    // Conversion
    exchangeRateUsed: { type: Number, required: true },
    buyerPaid: { type: Number, required: true, min: 0 },
    buyerCurrency: { type: String, required: true },

    // Fees
    fee: { type: Number, required: true, default: 0 },
    feeCurrency: { type: String, required: true },

    // Settlement
    settledAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'trades',
  }
);

// Indexes
TradeSchema.index({ sellerId: 1 });
TradeSchema.index({ buyerId: 1 });
TradeSchema.index({ sellerWorldId: 1, buyerWorldId: 1 });
TradeSchema.index({ resourceId: 1 });
TradeSchema.index({ settledAt: -1 });
TradeSchema.index({ createdAt: -1 });
TradeSchema.index({ offerId: 1 });

// Virtual for id
TradeSchema.virtual('id').get(function () {
  return this._id.toString();
});

TradeSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const TradeModel = mongoose.model<TradeDocument>('Trade', TradeSchema);
