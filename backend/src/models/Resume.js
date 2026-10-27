import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    originalName: { type: String, required: true },
    // The PDF itself is stored in MongoDB (Vercel has no persistent disk).
    // select: false keeps it out of list/detail queries; load it with .select('+data').
    data: { type: Buffer, select: false },
    // Legacy: resumes uploaded before this change were saved on local disk.
    path: { type: String },
    mimeType: { type: String, default: 'application/pdf' },
    size: { type: Number, required: true },
    uploadedBy: { type: String, default: 'system' },
  },
  { timestamps: true },
);

export const Resume = mongoose.model('Resume', resumeSchema);
