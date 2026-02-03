import mongoose, { Schema, Document, Types } from 'mongoose';
import type { EventType } from '@agentropolis/shared';

export interface IEvent extends Document {
  type: EventType;
  involvedAgents: Types.ObjectId[];
  districtId?: Types.ObjectId;
  buildingId?: Types.ObjectId;
  cityId: string;
  severity: number;
  resolved: boolean;
  description: string;
  tick: number;
}

const EventSchema = new Schema<IEvent>(
  {
    type: { type: String, required: true },
    involvedAgents: [{ type: Schema.Types.ObjectId, ref: 'Agent' }],
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', default: null },
    cityId: { type: String, required: true },
    severity: { type: Number, default: 1 },
    resolved: { type: Boolean, default: false },
    description: { type: String, required: true },
    tick: { type: Number, required: true },
  },
  { timestamps: true }
);

EventSchema.index({ cityId: 1, tick: -1 });
EventSchema.index({ cityId: 1, type: 1 });
EventSchema.index({ cityId: 1, resolved: 1 });

export const EventModel = mongoose.model<IEvent>('Event', EventSchema);
