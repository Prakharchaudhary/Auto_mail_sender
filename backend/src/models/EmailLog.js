import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    email: { type: String, required: true, lowercase: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'retrying', 'skipped'],
      default: 'queued',
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    provider: { type: String, default: 'gmail-smtp' },
    lastError: { type: String },
    sentAt: { type: Date },
    scheduledFor: { type: Date },
    providerMessageId: { type: String },
    gmailThreadId: { type: String },
    idempotencyKey: { type: String, unique: true, index: true },
  },
  { timestamps: true },
);

emailLogSchema.index({ campaignId: 1, email: 1 }, { unique: true });

export const EmailLog = mongoose.model('EmailLog', emailLogSchema);
