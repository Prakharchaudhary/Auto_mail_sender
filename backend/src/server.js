// Local development / self-hosted entry point. On Vercel, src/app.js is used instead
// and sending is triggered by the Vercel Cron Job (see vercel.json).
import app from './app.js';
import { connectDB } from './config/db.js';
import { assertRequiredEnv, env } from './config/env.js';
import { logger } from './config/logger.js';
import { startScheduler, stopScheduler } from './services/schedulerService.js';

async function bootstrap() {
  try {
    assertRequiredEnv();
    await connectDB();
    const server = app.listen(env.PORT, () => {
      logger.info(`Server started on http://localhost:${env.PORT}`);
    });

    if (process.env.DISABLE_LOCAL_SCHEDULER === 'true' || env.IS_VERCEL) {
      logger.info('Local scheduler disabled (emails are sent by the daily cron).');
    } else {
      startScheduler();
    }

    const shutdown = async () => {
      logger.info('Received shutdown signal. Closing server.');
      stopScheduler();
      server.close(async () => {
        const mongoose = (await import('mongoose')).default;
        await mongoose.disconnect().catch(() => {});
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error(error, 'Failed to start backend');
    process.exit(1);
  }
}

bootstrap();
