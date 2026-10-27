import cron from 'node-cron';
import { Campaign } from '../models/Campaign.js';
import { EmailLog } from '../models/EmailLog.js';
import { Contact } from '../models/Contact.js';
import { Resume } from '../models/Resume.js';
import { buildResumeAttachments } from '../utils/emailAttachments.js';
import { sendMail } from './emailService.js';
import { logger } from '../config/logger.js';
import { getAllowedDailyBatchSize, isBusinessDay } from '../utils/campaignRules.js';

const schedule = cron.schedule('* * * * *', async () => {
  await processScheduledCampaigns();
});

let schedulerStarted = false;

export function isCampaignDueForProcessing(campaign, referenceDate = new Date()) {
  if (!campaign?.startDateTime) {
    return false;
  }

  return new Date(campaign.startDateTime).getTime() <= new Date(referenceDate).getTime();
}

export function startScheduler() {
  if (schedulerStarted) {
    return schedule;
  }

  schedule.start();
  schedulerStarted = true;
  logger.info('Email scheduler started.');
  return schedule;
}

export async function processScheduledCampaigns() {
  const campaigns = await Campaign.find({ status: { $in: ['queued', 'running'] } }).lean();

  for (const campaign of campaigns) {
    const now = new Date();

    if (!isCampaignDueForProcessing(campaign, now)) {
      continue;
    }

    await Campaign.findByIdAndUpdate(campaign._id, {
      status: 'running',
      lastRunAt: now,
    });

    const allowedDays = Array.isArray(campaign.allowedDays) ? campaign.allowedDays : [];
    if (!isBusinessDay(now, allowedDays)) {
      continue;
    }

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const sentTodayCount = await EmailLog.countDocuments({
      campaignId: campaign._id,
      status: 'sent',
      sentAt: {
        $gte: todayStart,
        $lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    const allowedInThisRun = getAllowedDailyBatchSize(campaign, sentTodayCount, now);
    if (allowedInThisRun <= 0) {
      continue;
    }

    await Campaign.findByIdAndUpdate(campaign._id, {
      status: 'running',
      lastRunAt: now,
    });

    const logs = await EmailLog.find({ campaignId: campaign._id, status: { $in: ['queued', 'retrying'] } })
      .sort({ scheduledFor: 1 })
      .limit(Math.min(allowedInThisRun, campaign.batchSize || 5))
      .lean();

    const resume = campaign.resumeId ? await Resume.findById(campaign.resumeId).lean() : null;
    const attachments = buildResumeAttachments(resume);

    for (const log of logs) {
      const contact = await Contact.findById(log.contactId).lean();
      if (!contact || contact.isOptedOut) continue;

      try {
        await sendMail({
          to: contact.email,
          subject: campaign.subject,
          text: campaign.body,
          html: `<pre>${campaign.body.replace(/\n/g, '<br/>')}</pre>`,
          attachments,
        });

        await EmailLog.findByIdAndUpdate(log._id, {
          status: 'sent',
          attempts: (log.attempts || 0) + 1,
          sentAt: new Date(),
          lastError: '',
        });
      } catch (error) {
        await EmailLog.findByIdAndUpdate(log._id, {
          status: 'failed',
          attempts: (log.attempts || 0) + 1,
          lastError: error.message,
        });
      }
    }

    const remainingQueued = await EmailLog.countDocuments({ campaignId: campaign._id, status: 'queued' });
    const remainingUnsent = await EmailLog.countDocuments({ campaignId: campaign._id, status: { $in: ['queued', 'retrying'] } });
    if (remainingQueued === 0 && remainingUnsent === 0) {
      await Campaign.findByIdAndUpdate(campaign._id, { status: 'completed' });
    }
  }
}
