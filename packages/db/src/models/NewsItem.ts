import mongoose, { Schema, Document, Types } from 'mongoose';
import type { EventType, NewsSeverity } from '@agentropolis/shared';

export interface INewsItem extends Document {
  cityId: string;
  type: EventType;
  headline: string;
  body?: string;
  severity: NewsSeverity;
  tick: number;
  districtId?: Types.ObjectId;
  buildingId?: Types.ObjectId;
  agentIds: Types.ObjectId[];
  tags: string[];
  expiresAtTick?: number;
  isPublic: boolean;
}

const NewsItemSchema = new Schema<INewsItem>(
  {
    cityId: { type: String, required: true },
    type: { type: String, required: true },
    headline: { type: String, required: true },
    body: { type: String, default: null },
    severity: { type: String, enum: ['breaking', 'major', 'minor', 'routine'], default: 'routine' },
    tick: { type: Number, required: true },
    districtId: { type: Schema.Types.ObjectId, ref: 'District', default: null },
    buildingId: { type: Schema.Types.ObjectId, ref: 'Building', default: null },
    agentIds: [{ type: Schema.Types.ObjectId, ref: 'Agent' }],
    tags: [{ type: String }],
    expiresAtTick: { type: Number, default: null },
    isPublic: { type: Boolean, default: true },
  },
  { timestamps: true }
);

NewsItemSchema.index({ cityId: 1, tick: -1 });
NewsItemSchema.index({ cityId: 1, type: 1, tick: -1 });
NewsItemSchema.index({ cityId: 1, severity: 1, tick: -1 });
NewsItemSchema.index({ cityId: 1, expiresAtTick: 1 });

export const NewsItemModel = mongoose.model<INewsItem>('NewsItem', NewsItemSchema);
