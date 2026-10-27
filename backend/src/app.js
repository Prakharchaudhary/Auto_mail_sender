import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import contactsRoutes from './routes/contacts.js';
import resumeRoutes from './routes/resumes.js';
import campaignRoutes from './routes/campaigns.js';
import dashboardRoutes from './routes/dashboard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
  app.use(apiRateLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Email sender backend is running.' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/contacts', authenticate, contactsRoutes);
  app.use('/api/resumes', authenticate, resumeRoutes);
  app.use('/api/campaigns', authenticate, campaignRoutes);
  app.use('/api/dashboard', authenticate, dashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
