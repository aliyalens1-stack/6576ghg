import { Schema } from 'mongoose';

export const ReviewSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '' },
    // Snapshot for historical data
    snapshot: {
      serviceName: { type: String, default: '' },
      userName: { type: String, default: '' },
      vehicleInfo: { type: String, default: '' },
    },
    // Provider response
    response: {
      text: { type: String, default: '' },
      respondedAt: { type: Date, default: null },
    },
    status: { type: String, enum: ['active', 'hidden', 'flagged'], default: 'active', index: true },
  },
  { timestamps: true },
);

ReviewSchema.index({ organizationId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, createdAt: -1 });
