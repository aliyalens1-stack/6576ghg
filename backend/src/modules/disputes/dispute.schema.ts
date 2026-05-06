import { Schema } from 'mongoose';

export enum DisputeStatus {
  OPEN = 'open',
  REVIEWING = 'reviewing',
  RESOLVED = 'resolved',
  REJECTED = 'rejected',
}

export enum DisputeReason {
  SERVICE_NOT_PROVIDED = 'service_not_provided',
  POOR_QUALITY = 'poor_quality',
  OVERCHARGED = 'overcharged',
  RUDE_SERVICE = 'rude_service',
  OTHER = 'other',
}

const DisputeMessageSchema = new Schema(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
    message: { type: String, required: true },
    attachments: [{ type: String }],
  },
  { timestamps: true },
);

export const DisputeSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    // Dispute details
    reason: {
      type: String,
      enum: Object.values(DisputeReason),
      required: true,
    },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(DisputeStatus),
      default: DisputeStatus.OPEN,
      index: true,
    },
    // Messages
    messages: [DisputeMessageSchema],
    // Resolution
    resolution: { type: String, default: '' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    // Snapshot
    snapshot: {
      serviceName: { type: String, default: '' },
      orgName: { type: String, default: '' },
      userName: { type: String, default: '' },
      amount: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

DisputeSchema.index({ status: 1, createdAt: -1 });
