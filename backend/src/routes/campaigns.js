import express from 'express';
import mongoose from 'mongoose';
import { Campaign } from '../models/Campaign.js';
import { Contact } from '../models/Contact.js';
import { MAX_CAMPAIGN_CONTACTS } from '../constants/email.js';
import { EmailLog } from '../models/EmailLog.js';
import { validateCampaignInput, validateTestEmail } from '../utils/validators.js';
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

const router = express.Router();

router.param('id', (_req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({ message: 'Invalid campaign id.' });
  }
  return next();
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

    const updatableFields = ['subject', 'body', 'timezone', 'dailyLimit', 'batchSize', 'delayMs', 'startDateTime', 'name'];
    for (const field of updatableFields) {
      if (field in req.body) {
        campaign[field] = req.body[field];
      }
    }

    if (req.body.startDateTime) {
      campaign.startDateTime = new Date(req.body.startDateTime);
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
    const { email, subject, body } = req.body || {};
    const parsed = validateTestEmail({ email, subject: subject || 'Test email', body: body || 'This is a test email body.' });
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues.map((issue) => issue.message) });
    }

    const response = await sendCampaignTestEmail(req.params.id, parsed.data.email);
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
    const recipients = detail.recipients
      .filter((recipient) => status === 'all' || recipient.status === status)
      .filter((recipient) => !recipient.contactDeleted);

    const slug = detail.campaign.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'campaign';
    return await sendWorkbook(res, {
      filename: `${slug}-${status === 'all' ? 'recipients' : status.replace('_', '-')}.xlsx`,
      sheets: [{
        name: 'Recipients',
        columns: [
          { header: 'Name', key: 'name', width: 24 },
          { header: 'Email', key: 'email', width: 34 },
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
