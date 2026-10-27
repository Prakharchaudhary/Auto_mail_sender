import mongoose from 'mongoose';
import { logger } from './logger.js';

export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/email_sender');
  logger.info('MongoDB connected');

  return mongoose.connection;
}
