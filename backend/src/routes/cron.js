import crypto from 'crypto';
import express from 'express';
import { env } from '../config/env.js';
import { processScheduledCampaigns } from '../services/schedulerService.js';

const router = express.Router();

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Anyone else is rejected. */
function isAuthorizedCron(req) {
  if (!env.CRON_SECRET) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const received = Buffer.from(String(req.headers.authorization || ''));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

// Scheduled in vercel.json for weekday mornings (IST). Sends up to the daily limit.
router.get('/send-daily', async (req, res, next) => {
  if (!env.CRON_SECRET) {
    return res.status(500).json({ message: 'CRON_SECRET is not configured.' });
  }
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    const summary = await processScheduledCampaigns({ mode: 'daily' });
    return res.json({ ok: true, summary });
  } catch (error) {
    return next(error);
  }
});

export default router;
