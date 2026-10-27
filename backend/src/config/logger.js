import pino from 'pino';

// Pretty logs only for local development; Vercel and production get plain JSON logs.
const usePretty = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: undefined,
  },
  usePretty
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } })
    : undefined,
);
