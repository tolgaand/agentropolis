import mongoose, { Schema, Document } from 'mongoose';
import type { TimePhase } from '@agentropolis/shared';

export interface TimeStateDocument extends Document {
  key: string;
  dayIndex: number;
  minuteOfDay: number;
  phase: TimePhase;
  hourDisplay: string;
  isNewPhase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const timeStateSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    dayIndex: { type: Number, required: true, min: 0 },
    minuteOfDay: { type: Number, required: true, min: 0, max: 1439 },
    phase: {
      type: String,
      required: true,
      enum: ['morning', 'day', 'evening', 'night'],
    },
    hourDisplay: { type: String, required: true },
    isNewPhase: { type: Boolean, default: false },
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

timeStateSchema.index({ key: 1 }, { unique: true });

export const TimeStateModel = mongoose.model<TimeStateDocument>('TimeState', timeStateSchema);
