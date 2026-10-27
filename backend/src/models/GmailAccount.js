import mongoose from 'mongoose';

const gmailAccountSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: true },
    accessToken: { type: String },
    refreshToken: { type: String },
    expiryDate: { type: Date },
    scope: { type: String },
    tokenType: { type: String },
    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export const GmailAccount = mongoose.model('GmailAccount', gmailAccountSchema);
