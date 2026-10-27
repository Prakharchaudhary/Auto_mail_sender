import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

// Reuse one connection across requests. On Vercel the same function instance serves
// many requests, so connecting once per instance avoids exhausting Atlas connections.
let connectionPromise = null;

export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add your MongoDB Atlas connection string to the environment.');
  }

  if (!connectionPromise) {
    mongoose.set('strictQuery', true);
    connectionPromise = mongoose
      .connect(env.MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 })
      .then(() => {
        logger.info('MongoDB connected');
        return mongoose.connection;
      })
      .catch((error) => {
        connectionPromise = null; // allow a retry on the next request
        throw error;
      });
  }

  return connectionPromise;
}
