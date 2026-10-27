import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'queued', 'running', 'paused', 'completed', 'cancelled', 'failed'],
      default: 'draft',
      index: true,
    },
    subject: { type: String, required: true },
    body: { type: String, required: true },
    resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    dailyLimit: { type: Number, default: 20 },
    batchSize: { type: Number, default: 5 },
    delayMs: { type: Number, default: 30000 },
    startDateTime: { type: Date },
    allowedDays: [{ type: Number }],
    allowedHours: { type: [Number], default: [9, 17] },
    contactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    totalContacts: { type: Number, default: 0 },
    lastScheduledAt: { type: Date },
    lastRunAt: { type: Date },
    issueMessages: [{ type: String }],
    isTestMode: { type: Boolean, default: false },
    approvalRequired: { type: Boolean, default: true },
    scheduleLocked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

campaignSchema.index({ status: 1, startDateTime: 1 });
campaignSchema.index({ createdAt: -1 });

export const Campaign = mongoose.model('Campaign', campaignSchema);
