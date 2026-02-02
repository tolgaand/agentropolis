import mongoose, { Schema, Document } from 'mongoose';

export interface ArmyDocument extends Document {
  ownerId: string;
  factionId: string;
  units: {
    infantry: number;
    archer: number;
    cavalry: number;
    siege: number;
  };
  totalAttack: number;
  totalDefense: number;
  position: { x: number; y: number };
  target?: { x: number; y: number };
  state: 'idle' | 'marching' | 'attacking' | 'returning' | 'disbanded';
  departedAt?: Date;
  estimatedArrival?: Date;
  warFatigue: number; // +3% per capture, -1%/day decay

  // March progress tracking
  marchProgress: number; // 0.0 to 1.0 (for client interpolation)
  marchStartPosition: { x: number; y: number }; // Where march started
  marchSpeed: number; // Tiles per second (calculated)

  // Home defense tracking
  homePosition: { x: number; y: number }; // Army's home city
  isHomeCityDefenseless: boolean; // True when army is away

  // March state
  canRecall: boolean; // Can abort march mid-way
  recallRequested: boolean; // Player requested recall

  createdAt: Date;
  updatedAt: Date;
}

const ArmySchema = new Schema<ArmyDocument>({
  _id: { type: String, required: true },
  ownerId: { type: String, required: true, index: true },
  factionId: { type: String, required: true, index: true },
  units: {
    infantry: { type: Number, default: 0 },
    archer: { type: Number, default: 0 },
    cavalry: { type: Number, default: 0 },
    siege: { type: Number, default: 0 },
  },
  totalAttack: { type: Number, default: 0 },
  totalDefense: { type: Number, default: 0 },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  target: {
    x: { type: Number },
    y: { type: Number },
  },
  state: {
    type: String,
    enum: ['idle', 'marching', 'attacking', 'returning', 'disbanded'],
    default: 'idle',
    index: true,
  },
  departedAt: { type: Date },
  estimatedArrival: { type: Date },
  warFatigue: { type: Number, default: 0 },

  // March progress tracking
  marchProgress: { type: Number, default: 0, min: 0, max: 1 },
  marchStartPosition: {
    x: { type: Number },
    y: { type: Number },
  },
  marchSpeed: { type: Number, default: 0 },

  // Home defense tracking
  homePosition: {
    x: { type: Number },
    y: { type: Number },
  },
  isHomeCityDefenseless: { type: Boolean, default: false },

  // March state
  canRecall: { type: Boolean, default: true },
  recallRequested: { type: Boolean, default: false },
}, { timestamps: true });

// Indexes for efficient queries
ArmySchema.index({ state: 1, estimatedArrival: 1 }); // For march tick queries
ArmySchema.index({ ownerId: 1, state: 1 }); // For owner queries
ArmySchema.index({ factionId: 1, state: 1 }); // For faction queries
ArmySchema.index({ state: 1, marchProgress: 1 }); // For march progress queries
ArmySchema.index({ homePosition: 1, isHomeCityDefenseless: 1 }); // For defenseless city queries

// Virtual for id
ArmySchema.virtual('id').get(function () {
  return this._id;
});

// JSON serialization
ArmySchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    delete ret.__v;
    return ret;
  },
});

export const ArmyModel = mongoose.model<ArmyDocument>('Army', ArmySchema);
