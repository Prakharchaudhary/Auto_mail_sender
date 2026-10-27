import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config({ path: path.resolve(projectRoot, 'backend', '.env') });

export const env = {
  PORT: Number(process.env.PORT || 5000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  APP_NAME: process.env.APP_NAME || 'email-sender',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://workprakhar9805_db_user:u71WPXTaY6VMMU8I@cluster0.22jralg.mongodb.net/?retryWrites=true&w=majority',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  SMTP_HOST: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
  SMTP_PORT: Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587),
  SMTP_SECURE: (process.env.SMTP_SECURE || 'false') === 'true',
  SMTP_USER: process.env.SMTP_USER || process.env.EMAIL_USER || 'work.prakhar9805@gmail.com',
  SMTP_PASS: process.env.SMTP_PASS || process.env.EMAIL_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || process.env.EMAIL_FROM || 'work.prakhar9805@gmail.com',
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || '',
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || '',
  GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/auth/gmail/callback',
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN || '',
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || 5 * 1024 * 1024),
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  DEFAULT_DAILY_LIMIT: Number(process.env.DEFAULT_DAILY_LIMIT || 20),
  DEFAULT_BATCH_SIZE: Number(process.env.DEFAULT_BATCH_SIZE || 5),
  DEFAULT_DELAY_MS: Number(process.env.DEFAULT_DELAY_MS || 30000),
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 200),
};
