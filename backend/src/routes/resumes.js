import express from 'express';
import mongoose from 'mongoose';
import { Resume } from '../models/Resume.js';
import { Campaign } from '../models/Campaign.js';
import { resumeUpload } from '../middleware/upload.js';

const router = express.Router();

const isPdf = (buffer) => buffer && buffer.length > 4 && buffer.subarray(0, 4).toString('latin1') === '%PDF';

router.param('id', (_req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid resume id.' });
  }
  return next();
});

router.post('/upload', resumeUpload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'A resume PDF is required.' });
    }

    // Check the file content, not just the extension.
    if (!isPdf(req.file.buffer)) {
      return res.status(400).json({ message: 'The file is not a valid PDF.' });
    }

    const created = await Resume.create({
      name: req.file.originalname,
      originalName: req.file.originalname,
      data: req.file.buffer,
      mimeType: 'application/pdf',
      size: req.file.size,
    });

    const { data: _data, ...resume } = created.toObject();
    return res.status(201).json({ resume });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const resumes = await Resume.find().sort({ createdAt: -1 }).lean();
    return res.json({ resumes });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const resume = await Resume.findById(req.params.id).lean();
    if (!resume) {
      return res.status(404).json({ message: 'Resume not found.' });
    }
    return res.json({ resume });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // Don't break campaigns that still need this resume as an attachment.
    const inUse = await Campaign.countDocuments({
      resumeId: req.params.id,
      status: { $in: ['draft', 'queued', 'running', 'paused'] },
    });
    if (inUse > 0) {
      return res.status(409).json({ message: `This resume is attached to ${inUse} active campaign(s). Remove it from those campaigns first.` });
    }

    const resume = await Resume.findByIdAndDelete(req.params.id);
    if (!resume) {
      return res.status(404).json({ message: 'Resume not found.' });
    }

    return res.json({ message: 'Resume deleted successfully.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
