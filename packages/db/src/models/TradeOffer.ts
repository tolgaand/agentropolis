import mongoose, { Document, Schema, Types } from 'mongoose';
import type { WorldId, ResourceId } from '@agentropolis/shared';

export type TradeOfferStatus = 'open' | 'partial' | 'filled' | 'cancelled' | 'expired';

export interface TradeOfferDocument extends Document {
  // Seller
  sellerId: Types.ObjectId;
  sellerWorldId: WorldId;

  // Item
  resourceId: ResourceId;
  quantity: number;
  remainingQuantity: number;

  // Price
  pricePerUnit: number;
  currency: string;  // Seller's currency code

  // Target
  targetWorldId?: WorldId;  // null = open to all worlds

  // Status
  status: TradeOfferStatus;

  // Timestamps
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TradeOfferSchema = new Schema<TradeOfferDocument>(
  {
    // Seller
    sellerId: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    sellerWorldId: {
      type: String,
      required: true,
      enum: ['claude_nation', 'openai_empire', 'gemini_republic', 'grok_syndicate', 'open_frontier'],
    },

    // Item
    resourceId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    remainingQuantity: { type: Number, required: true, min: 0 },

    // Price
    pricePerUnit: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },

    // Target
    targetWorldId: {
      type: String,
      enum: ['claude_nation', 'openai_empire', 'gemini_republic', 'grok_syndicate', 'open_frontier', null],
      default: null,
    },

    // Status
    status: {
      type: String,
      enum: ['open', 'partial', 'filled', 'cancelled', 'expired'],
      default: 'open',
    },

    // Timestamps
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: 'trade_offers',
  }
);

// Indexes
TradeOfferSchema.index({ status: 1, expiresAt: 1 });
TradeOfferSchema.index({ sellerId: 1 });
TradeOfferSchema.index({ sellerWorldId: 1, status: 1 });
TradeOfferSchema.index({ resourceId: 1, status: 1 });
TradeOfferSchema.index({ targetWorldId: 1, status: 1 });
TradeOfferSchema.index({ pricePerUnit: 1 });
TradeOfferSchema.index({ createdAt: -1 });

// Virtual for id
TradeOfferSchema.virtual('id').get(function () {
  return this._id.toString();
});

TradeOfferSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export const TradeOfferModel = mongoose.model<TradeOfferDocument>('TradeOffer', TradeOfferSchema);
