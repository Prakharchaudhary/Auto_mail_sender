import { logger } from '../config/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';

  if (err.name === 'MulterError') {
    statusCode = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large. Maximum size is 4 MB.' : err.message;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid id.';
  } else if (err.name === 'ValidationError') {
    statusCode = 400;
  }

  if (statusCode >= 500) {
    logger.error({ err, path: req.originalUrl }, 'Request failed');
    // Don't leak internal details (connection strings, stack traces) to the client.
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) message = 'Internal server error';
  }

  return res.status(statusCode).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && !process.env.VERCEL && statusCode >= 500 && { stack: err.stack }),
  });
}
