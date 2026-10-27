import multer from 'multer';
import { env } from '../config/env.js';

const SPREADSHEET_EXTENSIONS = ['.csv', '.xlsx', '.xls'];

const hasExtension = (name, extensions) => extensions.some((ext) => String(name || '').toLowerCase().endsWith(ext));

// Files are kept in memory (never written to disk): Vercel functions have no persistent
// filesystem. Contact sheets are parsed straight from the buffer; resume PDFs are stored
// in MongoDB.
const storage = multer.memoryStorage();

export const contactUpload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (hasExtension(file.originalname, SPREADSHEET_EXTENSIONS)) return cb(null, true);
    return cb(Object.assign(new Error('Unsupported file type. Upload a CSV, XLSX, or XLS file.'), { statusCode: 400 }));
  },
});

export const resumeUpload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || hasExtension(file.originalname, ['.pdf'])) return cb(null, true);
    return cb(Object.assign(new Error('Only PDF resumes are allowed.'), { statusCode: 400 }));
  },
});
