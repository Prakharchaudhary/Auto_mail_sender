import express from 'express';
import mongoose from 'mongoose';
import { Campaign } from '../models/Campaign.js';
import { Contact } from '../models/Contact.js';
import { MAX_CAMPAIGN_CONTACTS } from '../constants/email.js';
import { EmailLog } from '../models/EmailLog.js';
import { validateCampaignInput } from '../utils/validators.js';
import {
  createCampaign,
  exportCampaignResults,
  getCampaignProgressDetail,
  getCampaignWithContacts,
  listCampaignsWithCounts,
  sendCampaignTestEmail,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
} from '../services/campaignService.js';

import { formatExcelDate, sendWorkbook } from '../utils/excelExport.js';
import { campaignAppliedRole, localDateRange } from '../utils/campaignRules.js';
import { env } from '../config/env.js';

const router = express.Router();

router.param('id', (_req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid campaign id.' });
  }
  return next();
});

// Every email sent across all campaigns in a date range (dates in the app timezone),
// with the job role each one applied for. Must stay above the '/:id/...' routes.
router.get('/sent-emails/export', async (req, res, next) => {
  try {
    const tz = env.DEFAULT_TIMEZONE;
    const { start, end } = localDateRange(req.query.from, req.query.to, tz);
    const sentAt = {};
    if (start) sentAt.$gte = start;
    if (end) sentAt.$lt = end;

    const logs = await EmailLog.find(
      { status: 'sent', ...(start || end ? { sentAt } : { sentAt: { $ne: null } }) },
      { campaignId: 1, contactId: 1, email: 1, sentAt: 1 },
    ).sort({ sentAt: 1 }).lean();

    const [campaigns, contacts] = await Promise.all([
      Campaign.find({ _id: { $in: [...new Set(logs.map((log) => String(log.campaignId)))] } },
        { name: 1, role: 1, subject: 1 }).lean(),
      Contact.find({ _id: { $in: logs.map((log) => log.contactId) } },
        { name: 1, company: 1, job_title: 1 }).lean(),
    ]);
    const campaignById = new Map(campaigns.map((campaign) => [String(campaign._id), campaign]));
    const contactById = new Map(contacts.map((contact) => [String(contact._id), contact]));

    const label = [req.query.from, req.query.to].filter(Boolean).join('-to-') || 'all-dates';
    return await sendWorkbook(res, {
      filename: `sent-emails-${label}.xlsx`,
      sheets: [{
        name: 'Sent emails',
        columns: [
          { header: `Sent At (${tz})`, key: 'sentAt', width: 22 },
          { header: 'Email', key: 'email', width: 34 },
          { header: 'Applied For', key: 'role', width: 26 },
          { header: 'Company', key: 'company', width: 24 },
          { header: 'Contact Name', key: 'name', width: 22 },
          { header: 'Contact Title', key: 'title', width: 22 },
          { header: 'Campaign', key: 'campaign', width: 30 },
        ],
        rows: logs.map((log) => {
          const campaign = campaignById.get(String(log.campaignId)) || {};
          const contact = contactById.get(String(log.contactId)) || {};
          return {
            sentAt: formatExcelDate(log.sentAt, tz),
            email: log.email,
            role: campaignAppliedRole(campaign),
            company: contact.company || '',
            name: contact.name || '',
            title: contact.job_title || '',
            campaign: campaign.name || '(deleted campaign)',
          };
        }),
      }],
    });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ message: error.message });
    return next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = validateCampaignInput(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues.map((issue) => issue.message) });
    }

    const contactIds = parsed.data.contactIds;
    if (!contactIds || contactIds.length === 0) {
      return res.status(400).json({ message: 'Campaign requires at least one uploaded contact.' });
    }

    const campaign = await createCampaign({ ...parsed.data, contactIds });
    return res.status(201).json({ campaign });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const campaigns = await listCampaignsWithCounts();
    return res.json({ campaigns });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await getCampaignWithContacts(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }
    return res.json({ campaign });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/detail', async (req, res, next) => {
  try {
    const detail = await getCampaignProgressDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }

    return res.json({ detail });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }

    const updatableFields = ['role', 'subject', 'body', 'timezone', 'dailyLimit', 'batchSize', 'delayMs', 'startDateTime', 'name'];
    for (const field of updatableFields) {
      if (field in req.body) {
        campaign[field] = req.body[field];
      }
    }

    if (req.body.startDateTime) {
      campaign.startDateTime = new Date(req.body.startDateTime);
    }

    // Priority can be changed at any time, even while the campaign is sending.
    if ('sendFirst' in req.body) {
      campaign.sendFirst = Boolean(req.body.sendFirst);
    }

    // Recipients and resume can only change before sending starts.
    const editable = campaign.status === 'draft';
    if (Array.isArray(req.body.contactIds) && editable) {
      const ids = [...new Set(req.body.contactIds.map(String))];
      if (ids.length === 0) {
        return res.status(400).json({ message: 'Campaign requires at least one contact.' });
      }
      if (ids.length > MAX_CAMPAIGN_CONTACTS) {
        return res.status(400).json({ message: `A campaign can have at most ${MAX_CAMPAIGN_CONTACTS} contacts.` });
      }
      if (!ids.every((id) => mongoose.isValidObjectId(id))) {
        return res.status(400).json({ message: 'One or more contact ids are invalid.' });
      }
      const existingCount = await Contact.countDocuments({ _id: { $in: ids } });
      if (existingCount !== ids.length) {
        return res.status(400).json({ message: 'One or more contacts no longer exist. Re-upload the contact list.' });
      }
      campaign.contactIds = ids;
      campaign.totalContacts = ids.length;
    }

    if ('resumeId' in req.body && editable) {
      const { resumeId } = req.body;
      if (resumeId && !mongoose.isValidObjectId(resumeId)) {
        return res.status(400).json({ message: 'Invalid resume id.' });
      }
      campaign.resumeId = resumeId || undefined;
    }

    await campaign.save();
    return res.json({ campaign });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }

    await EmailLog.deleteMany({ campaignId: req.params.id });
    return res.json({ message: 'Campaign deleted successfully.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/test-email', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Invalid test email address.' });
    }

    const response = await sendCampaignTestEmail(req.params.id, email || null);
    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/start', async (req, res, next) => {
  try {
    const campaign = await startCampaign(req.params.id);
    return res.json({ campaign });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await pauseCampaign(req.params.id);
    return res.json({ campaign });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/resume', async (req, res, next) => {
  try {
    const campaign = await resumeCampaign(req.params.id);
    return res.json({ campaign });
  } catch (error) {
    return next(error);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const campaign = await cancelCampaign(req.params.id);
    return res.json({ campaign });
  } catch (error) {
    return next(error);
  }
});

// Excel export of a campaign's recipients, optionally only one status (e.g. failed,
// to resend). Name/Email/Company/Title match the upload format for re-use.
const RECIPIENT_STATUSES = new Set(['not_started', 'queued', 'retrying', 'sent', 'failed', 'skipped']);

router.get('/:id/recipients/export', async (req, res, next) => {
  try {
    const detail = await getCampaignProgressDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ message: 'Campaign not found.' });
    }

    const status = String(req.query.status || 'all');
    if (status !== 'all' && !RECIPIENT_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Invalid status filter.' });
    }

    const tz = detail.campaign.timezone || undefined;
    let range;
    try {
      range = localDateRange(req.query.from, req.query.to, tz || env.DEFAULT_TIMEZONE);
    } catch (rangeError) {
      return res.status(400).json({ message: rangeError.message });
    }
    const inRange = (recipient) => {
      if (!range.start && !range.end) return true;
      if (!recipient.sentAt) return false;
      const sent = new Date(recipient.sentAt);
      return (!range.start || sent >= range.start) && (!range.end || sent < range.end);
    };
    const appliedFor = campaignAppliedRole(detail.campaign);
    const recipients = detail.recipients
      .filter((recipient) => status === 'all' || recipient.status === status)
      .filter((recipient) => !recipient.contactDeleted)
      .filter(inRange);

    const slug = detail.campaign.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'campaign';
    return await sendWorkbook(res, {
      filename: `${slug}-${status === 'all' ? 'recipients' : status.replace('_', '-')}${req.query.from || req.query.to ? `-${[req.query.from, req.query.to].filter(Boolean).join('-to-')}` : ''}.xlsx`,
      sheets: [{
        name: 'Recipients',
        columns: [
          { header: 'Name', key: 'name', width: 24 },
          { header: 'Email', key: 'email', width: 34 },
          { header: 'Applied For', key: 'appliedFor', width: 26 },
          { header: 'Company', key: 'company', width: 24 },
          { header: 'Title', key: 'title', width: 22 },
          { header: 'Status', key: 'status', width: 13 },
          { header: 'Attempts', key: 'attempts', width: 10 },
          { header: `Sent At (${tz || 'local'})`, key: 'sentAt', width: 24 },
          { header: 'Error', key: 'error', width: 40 },
          { header: 'Opted Out', key: 'optedOut', width: 11 },
        ],
        rows: recipients.map((recipient) => ({
          name: recipient.name,
          email: recipient.email,
          appliedFor,
          company: recipient.company,
          title: recipient.job_title,
          status: recipient.status === 'not_started' ? 'not started' : recipient.status,
          attempts: recipient.attempts,
          sentAt: formatExcelDate(recipient.sentAt, tz),
          error: recipient.lastError,
          optedOut: recipient.isOptedOut ? 'Yes' : 'No',
        })),
      }],
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/export', async (req, res, next) => {
  try {
    const { rows } = await exportCampaignResults(req.params.id);
    const csv = ['email,status,attempts,sentAt,providerMessageId,lastError'];
    for (const row of rows) {
      csv.push(`${row.email},${row.status},${row.attempts},${row.sentAt || ''},${row.providerMessageId || ''},${row.lastError || ''}`); 
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}.csv"`);
    return res.send(csv.join('\n'));
  } catch (error) {
    return next(error);
  }
});

export default router;
