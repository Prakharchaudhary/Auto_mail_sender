import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    company: { type: String, trim: true },
    job_title: { type: String, trim: true },
    notes: { type: String, trim: true },
    isOptedOut: { type: Boolean, default: false },
    source: { type: String, default: 'upload' },
    lastContactedAt: { type: Date },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

contactSchema.index({ email: 1 }, { unique: true });
contactSchema.index({ company: 1, job_title: 1 });

export const Contact = mongoose.model('Contact', contactSchema);
