import { Campaign } from '../models/Campaign.js';
import { Contact } from '../models/Contact.js';
import { EmailLog } from '../models/EmailLog.js';
import { Resume } from '../models/Resume.js';
import { env } from '../config/env.js';
import { buildResumeAttachments } from '../utils/emailAttachments.js';
import { localDayInfo } from '../utils/campaignRules.js';
import { sendMail, textToHtml } from './emailService.js';

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

/** Per-campaign delivery counts computed from the email logs (source of truth). */
export async function getCampaignStatusCounts(campaignIds = []) {
  if (!campaignIds.length) return new Map();

  const rows = await EmailLog.aggregate([
    { $match: { campaignId: { $in: campaignIds } } },
    { $group: { _id: { campaignId: '$campaignId', status: '$status' }, count: { $sum: 1 } } },
  ]);

  const counts = new Map();
  for (const row of rows) {
    const key = String(row._id.campaignId);
    if (!counts.has(key)) counts.set(key, {});
    counts.get(key)[row._id.status] = row.count;
  }
  return counts;
}

export async function listCampaignsWithCounts() {
  const campaigns = await Campaign.find({}, { contactIds: 0 }).sort({ createdAt: -1 }).lean();
  const counts = await getCampaignStatusCounts(campaigns.map((campaign) => campaign._id));

  return campaigns.map((campaign) => {
    const byStatus = counts.get(String(campaign._id)) || {};
    return {
      ...campaign,
      sentCount: byStatus.sent || 0,
      failedCount: byStatus.failed || 0,
      queuedCount: (byStatus.queued || 0) + (byStatus.retrying || 0),
    };
  });
}

export async function createCampaign(payload) {
  const contactIds = payload.contactIds || [];

  const campaign = await Campaign.create({
    name: payload.name,
    role: payload.role || '',
    subject: payload.subject,
    body: payload.body,
    resumeId: payload.resumeId,
    timezone: payload.timezone || env.DEFAULT_TIMEZONE,
    dailyLimit: payload.dailyLimit || env.DEFAULT_DAILY_LIMIT,
    batchSize: payload.batchSize || env.DEFAULT_BATCH_SIZE,
    delayMs: payload.delayMs || env.DEFAULT_DELAY_MS,
    startDateTime: payload.startDateTime ? new Date(payload.startDateTime) : new Date(),
    approvalRequired: payload.approvalRequired ?? true,
    sendFirst: Boolean(payload.sendFirst),
    contactIds,
    totalContacts: contactIds.length,
    status: 'draft',
  });

  return campaign;
}

export async function getDashboardOverview() {
  const { startOfDay } = localDayInfo(new Date(), env.DEFAULT_TIMEZONE);
  const sentToday = await EmailLog.countDocuments({ status: 'sent', sentAt: { $gte: startOfDay } });

  const [totalContacts, queuedJobs, sentEmails, failedEmails, replies] = await Promise.all([
    Contact.countDocuments(),
    EmailLog.countDocuments({ status: 'queued' }),
    EmailLog.countDocuments({ status: 'sent' }),
    EmailLog.countDocuments({ status: 'failed' }),
    (await import('../models/Reply.js')).Reply.countDocuments(),
  ]);

  return {
    totalContacts,
    queuedEmails: queuedJobs,
    sentEmails: sentEmails,
    failures: failedEmails,
    replies,
    sentToday,
    dailySendLimit: env.GLOBAL_DAILY_SEND_LIMIT,
  };
}

export async function sendCampaignTestEmail(campaignId, targetEmail) {
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) throw notFound('Campaign not found');

  const resume = campaign.resumeId ? await Resume.findById(campaign.resumeId).select('+data').lean() : null;
  const attachments = buildResumeAttachments(resume);
  // Send to the given address, or to your own Gmail when none is given.
  const to = targetEmail || env.SMTP_USER;
  if (!to) throw Object.assign(new Error('No test recipient: set SMTP_USER or pass an email.'), { statusCode: 400 });

  await sendMail({
    to,
    subject: `[TEST] ${campaign.subject}`,
    text: campaign.body,
    html: textToHtml(campaign.body),
    attachments,
  });

  return {
    message: `Test email sent to ${to}.${resume && attachments.length === 0 ? ' Warning: the resume file is missing - re-upload it.' : ''}`,
  };
}

export async function startCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw notFound('Campaign not found');

  const contacts = await Contact.find({ _id: { $in: campaign.contactIds } }, { email: 1 }).lean();
  const existingLogs = await EmailLog.find({ campaignId: campaign._id }, { contactId: 1 }).lean();
  const queuedContactIds = new Set(existingLogs.map((log) => String(log.contactId)));
  const scheduledFor = campaign.startDateTime || new Date();

  const newLogs = contacts
    .filter((contact) => !queuedContactIds.has(String(contact._id)))
    .map((contact) => ({
      campaignId: campaign._id,
      contactId: contact._id,
      email: contact.email,
      status: 'queued',
      scheduledFor,
      idempotencyKey: `${campaign._id}:${contact._id}`,
    }));

  if (newLogs.length > 0) {
    try {
      await EmailLog.insertMany(newLogs, { ordered: false });
    } catch (error) {
      // Duplicate keys mean a log already exists for that recipient; safe to ignore.
      const writeErrors = error?.writeErrors || [];
      const onlyDuplicates = writeErrors.length > 0 && writeErrors.every((item) => (item.code ?? item.err?.code) === 11000);
      if (!onlyDuplicates && error?.code !== 11000) throw error;
    }
  }

  campaign.status = 'queued';
  campaign.lastScheduledAt = new Date();
  await campaign.save();

  return campaign;
}

export async function pauseCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw notFound('Campaign not found');

  campaign.status = 'paused';
  await campaign.save();

  return campaign;
}

export async function resumeCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw notFound('Campaign not found');

  campaign.status = 'queued';
  await campaign.save();

  return campaign;
}

export async function cancelCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw notFound('Campaign not found');

  campaign.status = 'cancelled';
  await campaign.save();

  return campaign;
}

export async function exportCampaignResults(campaignId) {
  const logs = await EmailLog.find({ campaignId }).lean();

  const rows = logs.map((log) => ({
    email: log.email,
    status: log.status,
    attempts: log.attempts,
    sentAt: log.sentAt || '',
    providerMessageId: log.providerMessageId || '',
    lastError: log.lastError || '',
  }));

  return { rows };
}

export async function getCampaignProgressDetail(campaignId) {
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) return null;

  const [logs, contacts, resume] = await Promise.all([
    EmailLog.find({ campaignId }).lean(),
    Contact.find(
      { _id: { $in: campaign.contactIds || [] } },
      { name: 1, email: 1, company: 1, job_title: 1, isOptedOut: 1 },
    ).lean(),
    campaign.resumeId ? Resume.findById(campaign.resumeId, { originalName: 1, size: 1 }).lean() : null,
  ]);

  const logByContact = new Map(logs.map((log) => [String(log.contactId), log]));
  const contactById = new Map(contacts.map((contact) => [String(contact._id), contact]));

  // One row per recipient in the campaign, whether or not sending has started.
  const recipients = (campaign.contactIds || []).map((contactId) => {
    const id = String(contactId);
    const contact = contactById.get(id);
    const log = logByContact.get(id);

    return {
      contactId: id,
      logId: log?._id || null,
      name: contact?.name || '',
      email: contact?.email || log?.email || '(deleted contact)',
      company: contact?.company || '',
      job_title: contact?.job_title || '',
      contactDeleted: !contact,
      isOptedOut: Boolean(contact?.isOptedOut),
      status: log?.status || 'not_started',
      attempts: log?.attempts || 0,
      scheduledFor: log?.scheduledFor || null,
      sentAt: log?.sentAt || null,
      lastError: log?.lastError || '',
    };
  });

  const countBy = (status) => recipients.filter((recipient) => recipient.status === status).length;
  const sentCount = countBy('sent');
  const failedCount = countBy('failed');
  const queuedCount = countBy('queued');
  const retryingCount = countBy('retrying');
  const notStartedCount = countBy('not_started');
  const totalContacts = recipients.length;
  const batchSize = Number(campaign.batchSize || 10);

  const byScheduled = (left, right) => new Date(left.scheduledFor || 0) - new Date(right.scheduledFor || 0);
  const nextBatch = recipients.filter((r) => r.status === 'queued' || r.status === 'retrying').sort(byScheduled).slice(0, batchSize);
  const lastBatch = recipients.filter((r) => r.status === 'sent')
    .sort((left, right) => new Date(right.sentAt || 0) - new Date(left.sentAt || 0))
    .slice(0, batchSize);
  const lastSentAt = lastBatch[0]?.sentAt || null;

  return {
    campaignId: campaign._id,
    campaignName: campaign.name,
    subject: campaign.subject,
    campaign: {
      _id: campaign._id,
      name: campaign.name,
      role: campaign.role || '',
      status: campaign.status,
      sendFirst: Boolean(campaign.sendFirst),
      subject: campaign.subject,
      body: campaign.body,
      timezone: campaign.timezone,
      dailyLimit: campaign.dailyLimit,
      batchSize: campaign.batchSize,
      delayMs: campaign.delayMs,
      startDateTime: campaign.startDateTime,
      lastScheduledAt: campaign.lastScheduledAt,
      lastRunAt: campaign.lastRunAt,
      lastSentAt,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      resume: resume ? { _id: resume._id, originalName: resume.originalName, size: resume.size } : null,
    },
    totalContacts,
    sentCount,
    failedCount,
    queuedCount,
    retryingCount,
    notStartedCount,
    pendingCount: Math.max(totalContacts - sentCount - failedCount, 0),
    batchSize,
    nextBatch: nextBatch.map((r) => ({ ...r, id: r.contactId })),
    lastBatch: lastBatch.map((r) => ({ ...r, id: r.contactId })),
    recipients,
    // Kept for the existing editor audit panel.
    logs: recipients.filter((r) => r.logId).map((r) => ({
      id: r.logId,
      email: r.email,
      status: r.status,
      attempts: r.attempts,
      scheduledFor: r.scheduledFor,
      sentAt: r.sentAt,
      lastError: r.lastError,
    })),
  };
}

export async function getCampaignWithContacts(campaignId) {
  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign) return null;

  const contacts = await Contact.find({ _id: { $in: campaign.contactIds } }, { email: 1, name: 1 }).lean();
  return { ...campaign, contacts };
}

export async function getResumeById(resumeId) {
  if (!resumeId) return null;
  return Resume.findById(resumeId).lean();
}
