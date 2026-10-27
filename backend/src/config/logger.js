import pino from 'pino';

const transport =
  process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: undefined,
  },
  transport ? pino.transport({ target: transport.target, options: transport.options }) : undefined,
);
