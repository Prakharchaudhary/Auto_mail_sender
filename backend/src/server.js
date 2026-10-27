import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { startScheduler } from './services/schedulerService.js';

async function bootstrap() {
  try {
    await connectDB();
    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info(`Server started on http://localhost:${env.PORT}`);
    });

    startScheduler();

    const shutdown = async () => {
      logger.info('Received shutdown signal. Closing server.');
      server.close(() => process.exit(0));
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error(error, 'Failed to start backend');
    process.exit(1);
  }
}

bootstrap();
