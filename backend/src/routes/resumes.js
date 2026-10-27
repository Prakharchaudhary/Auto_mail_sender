import express from 'express';
import fs from 'fs';
import path from 'path';
import { Resume } from '../models/Resume.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

router.post('/upload', upload.single('resume'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'A resume PDF is required.' });
    }

    const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Only PDF resumes are allowed.' });
    }

    const resume = await Resume.create({
      name: path.basename(req.file.filename),
      originalName: req.file.originalname,
      path: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });

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
    const resume = await Resume.findByIdAndDelete(req.params.id);
    if (!resume) {
      return res.status(404).json({ message: 'Resume not found.' });
    }

    if (resume.path && fs.existsSync(resume.path)) {
      fs.unlinkSync(resume.path);
    }

    return res.json({ message: 'Resume deleted successfully.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
