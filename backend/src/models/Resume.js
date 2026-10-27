import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    mimeType: { type: String, default: 'application/pdf' },
    size: { type: Number, required: true },
    uploadedBy: { type: String, default: 'system' },
  },
  { timestamps: true },
);

export const Resume = mongoose.model('Resume', resumeSchema);
