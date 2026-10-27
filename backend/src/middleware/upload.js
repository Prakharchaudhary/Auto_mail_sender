import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env.js';

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-');
    const timestamp = Date.now();
    cb(null, `${timestamp}-${safeName}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.toLowerCase().endsWith('.csv') || file.originalname.toLowerCase().endsWith('.xlsx') || file.originalname.toLowerCase().endsWith('.xls') || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
      return;
    }
    cb(new Error('Unsupported file type. Please upload CSV, Excel, or PDF files only.'));
  },
});
