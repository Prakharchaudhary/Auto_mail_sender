import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

// Local development reads .env files; on Vercel the variables come from the project settings.
dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config({ path: path.resolve(projectRoot, 'backend', '.env') });

const isProduction = (process.env.NODE_ENV || 'development') === 'production' || Boolean(process.env.VERCEL);

export const env = {
  PORT: Number(process.env.PORT || 5000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: isProduction,
  IS_VERCEL: Boolean(process.env.VERCEL),
  APP_NAME: process.env.APP_NAME || 'email-sender',

  // Secrets: never hardcode real values here. Set them in backend/.env locally and in Vercel settings.
  JWT_SECRET: process.env.JWT_SECRET || '',
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  CRON_SECRET: process.env.CRON_SECRET || '',
  MONGODB_URI: process.env.MONGODB_URI || '',

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: (process.env.SMTP_SECURE || 'false') === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || '',
  GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || '',
  GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/auth/gmail/callback',
  GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN || '',

  // Vercel functions accept request bodies up to 4.5 MB, so uploads are capped at 4 MB.
  MAX_FILE_SIZE: Number(process.env.MAX_FILE_SIZE || 4 * 1024 * 1024),
  DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  DEFAULT_DAILY_LIMIT: Number(process.env.DEFAULT_DAILY_LIMIT || 30),
  DEFAULT_BATCH_SIZE: Number(process.env.DEFAULT_BATCH_SIZE || 5),
  DEFAULT_DELAY_MS: Number(process.env.DEFAULT_DELAY_MS || 30000),

  // Hard cap on emails sent per day across ALL campaigns (protects the Gmail account).
  GLOBAL_DAILY_SEND_LIMIT: Number(process.env.GLOBAL_DAILY_SEND_LIMIT || 30),

  // Local scheduler only sends inside this window (DEFAULT_TIMEZONE). Set both to the same
  // value to disable. The Vercel daily cron already runs at 09:30 IST and ignores this.
  SEND_WINDOW_START: process.env.SEND_WINDOW_START || '09:30',
  SEND_WINDOW_END: process.env.SEND_WINDOW_END || '18:00',

  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 300),
};

/** Fail fast with a clear message when a required setting is missing. */
export function assertRequiredEnv() {
  const missing = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. See backend/.env.example.`);
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }
}
