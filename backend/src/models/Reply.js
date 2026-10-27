import mongoose from 'mongoose';

const replySchema = new mongoose.Schema(
  {
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    fromEmail: { type: String, lowercase: true },
    gmailMessageId: { type: String },
    gmailThreadId: { type: String },
    subject: { type: String },
    snippet: { type: String },
    receivedAt: { type: Date },
    status: { type: String, default: 'new' },
    followUpDueDate: { type: Date },
  },
  { timestamps: true },
);

replySchema.index({ gmailThreadId: 1, gmailMessageId: 1 });

export const Reply = mongoose.model('Reply', replySchema);
