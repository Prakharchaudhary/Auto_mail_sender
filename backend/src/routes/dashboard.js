import express from 'express';
import { Reply } from '../models/Reply.js';
import { EmailLog } from '../models/EmailLog.js';
import { getDashboardOverview } from '../services/campaignService.js';

const router = express.Router();

router.get('/overview', async (_req, res, next) => {
  try {
    const overview = await getDashboardOverview();
    return res.json({ overview });
  } catch (error) {
    return next(error);
  }
});

router.get('/replies', async (_req, res, next) => {
  try {
    const replies = await Reply.find().sort({ receivedAt: -1 }).lean();
    return res.json({ replies });
  } catch (error) {
    return next(error);
  }
});

router.get('/jobs', async (_req, res, next) => {
  try {
    const jobs = await EmailLog.find().sort({ createdAt: -1 }).lean();
    return res.json({ jobs });
  } catch (error) {
    return next(error);
  }
});

export default router;
