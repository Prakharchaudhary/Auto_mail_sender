import cron from 'node-cron';
import { Campaign } from '../models/Campaign.js';
import { EmailLog } from '../models/EmailLog.js';
import { Contact } from '../models/Contact.js';
import { Resume } from '../models/Resume.js';
import { buildResumeAttachments } from '../utils/emailAttachments.js';
import { localDayInfo } from '../utils/campaignRules.js';
import { sendMail, textToHtml } from './emailService.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

const MAX_ATTEMPTS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let task = null;
let isProcessing = false;

export function isCampaignDueForProcessing(campaign, referenceDate = new Date()) {
  if (!campaign?.startDateTime) {
    return false;
  }
  return new Date(campaign.startDateTime).getTime() <= new Date(referenceDate).getTime();
}

/** Local/self-hosted only: run the sender every minute. Not used on Vercel. */
export function startScheduler() {
  if (task) return task;
  task = cron.schedule('* * * * *', () => {
    processScheduledCampaigns({ mode: 'minute' }).catch((error) => logger.error({ err: error }, 'Scheduler run failed'));
  });
  logger.info(`Email scheduler started (max ${env.GLOBAL_DAILY_SEND_LIMIT} emails/day across all campaigns).`);
  return task;
}

export function stopScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}

/** How a failed send should be recorded. */
function classifySendError(error) {
  const code = error?.code;
  const responseCode = Number(error?.responseCode || 0);
  const message = String(error?.message || '');

  // Bad/missing SMTP login: every email would fail, so stop the run and keep them queued.
  if (code === 'EAUTH' || message.includes('SMTP credentials are not configured')) return 'abort';
  // Temporary problems (network, 4xx SMTP replies): try again on a later run.
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNRESET'].includes(code)) return 'retry';
  if (responseCode >= 400 && responseCode < 500) return 'retry';
  return 'fail';
}

/**
 * Send due emails.
 *
 * mode 'daily'  - Vercel Cron, once per weekday: send up to the daily limits in one run,
 *                 with a short gap between emails and a time budget under the 300s limit.
 * mode 'minute' - local node-cron, every minute: at most `batchSize` per campaign per run,
 *                 waiting `delayMs` between emails.
 *
 * Never sends more than GLOBAL_DAILY_SEND_LIMIT emails per calendar day (DEFAULT_TIMEZONE),
 * counted across all campaigns.
 */
export async function processScheduledCampaigns(options = {}) {
  const {
    mode = 'minute',
    now = new Date(),
    timeBudgetMs = Number(process.env.CRON_TIME_BUDGET_MS || 240000),
    sendGapMs,
  } = options;

  if (isProcessing) {
    return { skipped: true, reason: 'A sending run is already in progress.' };
  }
  isProcessing = true;

  const startedAt = Date.now();
  const summary = {
    mode,
    globalDailyLimit: env.GLOBAL_DAILY_SEND_LIMIT,
    sentBeforeRun: 0,
    sent: 0,
    failed: 0,
    retrying: 0,
    skipped: 0,
    stoppedReason: null,
    campaigns: [],
  };

  try {
    const { startOfDay, weekday } = localDayInfo(now, env.DEFAULT_TIMEZONE);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    summary.sentBeforeRun = await EmailLog.countDocuments({
      status: 'sent',
      sentAt: { $gte: startOfDay, $lt: endOfDay },
    });
    let globalRemaining = Math.max(env.GLOBAL_DAILY_SEND_LIMIT - summary.sentBeforeRun, 0);

    if (globalRemaining === 0) {
      summary.stoppedReason = 'Daily limit already reached.';
      return summary;
    }

    const campaigns = await Campaign.find({ status: { $in: ['queued', 'running'] } }, { contactIds: 0 })
      .sort({ createdAt: 1 })
      .lean();

    for (const campaign of campaigns) {
      if (globalRemaining <= 0 || summary.stoppedReason) break;
      if (!isCampaignDueForProcessing(campaign, now)) continue;

      const allowedDays = Array.isArray(campaign.allowedDays) ? campaign.allowedDays : [];
      if (allowedDays.length && !allowedDays.includes(weekday)) continue;

      const sentTodayForCampaign = await EmailLog.countDocuments({
        campaignId: campaign._id,
        status: 'sent',
        sentAt: { $gte: startOfDay, $lt: endOfDay },
      });

      let allowed = Math.max(Number(campaign.dailyLimit || env.DEFAULT_DAILY_LIMIT) - sentTodayForCampaign, 0);
      if (mode === 'minute') allowed = Math.min(allowed, Number(campaign.batchSize || env.DEFAULT_BATCH_SIZE));
      allowed = Math.min(allowed, globalRemaining);
      if (allowed <= 0) continue;

      await Campaign.updateOne({ _id: campaign._id }, { status: 'running', lastRunAt: new Date() });

      const logs = await EmailLog.find({ campaignId: campaign._id, status: { $in: ['queued', 'retrying'] } })
        .sort({ scheduledFor: 1, _id: 1 })
        .limit(allowed)
        .lean();

      const resume = campaign.resumeId ? await Resume.findById(campaign.resumeId).select('+data').lean() : null;
      const attachments = buildResumeAttachments(resume);
      if (resume && attachments.length === 0) {
        // Don't send applications without the resume the campaign promises.
        summary.campaigns.push({ campaignId: campaign._id, name: campaign.name, error: 'Resume file missing. Re-upload the resume and edit the campaign.' });
        await Campaign.updateOne({ _id: campaign._id }, { $addToSet: { issueMessages: 'Resume file missing. Re-upload the resume.' } });
        continue;
      }

      const campaignResult = { campaignId: campaign._id, name: campaign.name, sent: 0, failed: 0 };
      summary.campaigns.push(campaignResult);

      for (const [index, log] of logs.entries()) {
        if (Date.now() - startedAt > timeBudgetMs) {
          summary.stoppedReason = 'Time budget reached; remaining emails stay queued for the next run.';
          break;
        }

        // Respect Pause/Cancel clicked while this run is in progress.
        const current = await Campaign.findById(campaign._id, { status: 1 }).lean();
        if (!current || !['queued', 'running'].includes(current.status)) break;

        const contact = await Contact.findById(log.contactId).lean();
        if (!contact || contact.isOptedOut) {
          await EmailLog.updateOne({ _id: log._id }, {
            status: 'skipped',
            lastError: contact ? 'Contact opted out.' : 'Contact was deleted.',
          });
          summary.skipped += 1;
          continue;
        }

        if (index > 0) {
          const gap = sendGapMs ?? (mode === 'daily'
            ? 2000 + Math.floor(Math.random() * 2000)
            : Math.min(Number(campaign.delayMs || env.DEFAULT_DELAY_MS), 60000));
          await sleep(gap);
        }

        const attempts = (log.attempts || 0) + 1;
        try {
          const info = await sendMail({
            to: contact.email,
            subject: campaign.subject,
            text: campaign.body,
            html: textToHtml(campaign.body),
            attachments,
          });

          await EmailLog.updateOne({ _id: log._id }, {
            status: 'sent',
            attempts,
            sentAt: new Date(),
            lastError: '',
            providerMessageId: info?.messageId || '',
          });
          await Contact.updateOne({ _id: contact._id }, { lastContactedAt: new Date() });
          summary.sent += 1;
          campaignResult.sent += 1;
          globalRemaining -= 1;
        } catch (error) {
          const outcome = classifySendError(error);
          logger.warn({ to: contact.email, code: error?.code, outcome }, 'Email send failed');

          if (outcome === 'abort') {
            await EmailLog.updateOne({ _id: log._id }, { lastError: error.message });
            summary.stoppedReason = `Sending stopped: ${error.message}`;
            break;
          }

          const status = outcome === 'retry' && attempts < MAX_ATTEMPTS ? 'retrying' : 'failed';
          await EmailLog.updateOne({ _id: log._id }, { status, attempts, lastError: error.message });
          if (status === 'retrying') summary.retrying += 1;
          else {
            summary.failed += 1;
            campaignResult.failed += 1;
          }
        }
      }

      const remaining = await EmailLog.countDocuments({ campaignId: campaign._id, status: { $in: ['queued', 'retrying'] } });
      if (remaining === 0) {
        await Campaign.updateOne({ _id: campaign._id, status: { $in: ['queued', 'running'] } }, { status: 'completed' });
      }
    }

    if (!summary.stoppedReason && globalRemaining <= 0) {
      summary.stoppedReason = 'Daily limit reached.';
    }

    return summary;
  } finally {
    isProcessing = false;
    if (summary.sent || summary.failed || summary.stoppedReason) {
      logger.info({ ...summary, campaigns: summary.campaigns.length }, 'Sending run finished');
    }
  }
}
