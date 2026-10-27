import express from 'express';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import contactsRoutes from './routes/contacts.js';
import resumeRoutes from './routes/resumes.js';
import campaignRoutes from './routes/campaigns.js';
import dashboardRoutes from './routes/dashboard.js';
import cronRoutes from './routes/cron.js';

export function createApp() {
  const app = express();

  // Behind Vercel's proxy: use X-Forwarded-For for the client IP (rate limiting).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Email sender backend is running.' });
  });

  // Login doesn't need the database, so it is mounted before the DB connection step.
  app.use('/api/auth', apiRateLimiter, authRoutes);

  // Make sure MongoDB is connected before any route touches the database.
  // (On Vercel there is no startup step, so this runs on the first request.)
  app.use('/api', async (_req, _res, next) => {
    try {
      await connectDB();
      next();
    } catch (error) {
      next(error);
    }
  });

  // Cron is authenticated with CRON_SECRET (set by Vercel), not the admin token.
  app.use('/api/cron', cronRoutes);

  app.use(apiRateLimiter);
  app.use('/api/contacts', authenticate, contactsRoutes);
  app.use('/api/resumes', authenticate, resumeRoutes);
  app.use('/api/campaigns', authenticate, campaignRoutes);
  app.use('/api/dashboard', authenticate, dashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Default export is what Vercel runs as the serverless function.
const app = createApp();
export default app;
