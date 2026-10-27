import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const maxRequests = env.NODE_ENV === 'development'
  ? Math.max(env.RATE_LIMIT_MAX, 2000)
  : env.RATE_LIMIT_MAX;

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
});
