import { Contact } from '../models/Contact.js';
import { Campaign } from '../models/Campaign.js';
import { EmailLog } from '../models/EmailLog.js';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function toPositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

/** Mongo filter for the contacts list: free-text search + used/unused in any campaign. */
async function buildContactFilter({ search = '', used = 'all' } = {}) {
  const filter = {};

  const term = String(search || '').trim();
  if (term) {
    const pattern = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ email: pattern }, { name: pattern }, { company: pattern }, { job_title: pattern }];
  }

  const usedIds = await Campaign.distinct('contactIds');
  if (used === 'used') filter._id = { $in: usedIds };
  if (used === 'unused') filter._id = { $nin: usedIds };

  return { filter, usedIds };
}

/**
 * Adds to each contact the campaigns it was added to, when it was added, and the
 * delivery status / sent time for that campaign.
 */
async function attachUsage(contacts) {
  const ids = contacts.map((contact) => contact._id);
  if (!ids.length) return [];

  const [campaigns, logs] = await Promise.all([
    Campaign.find(
      { contactIds: { $in: ids } },
      { name: 1, status: 1, createdAt: 1, startDateTime: 1, contactIds: 1 },
    ).sort({ createdAt: -1 }).lean(),
    EmailLog.find(
      { contactId: { $in: ids } },
      { campaignId: 1, contactId: 1, status: 1, sentAt: 1, scheduledFor: 1, attempts: 1 },
    ).lean(),
  ]);

  const logByKey = new Map(logs.map((log) => [`${log.campaignId}:${log.contactId}`, log]));
  const idSet = new Set(ids.map(String));
  const usageByContact = new Map();

  for (const campaign of campaigns) {
    for (const contactId of campaign.contactIds || []) {
      const id = String(contactId);
      if (!idSet.has(id)) continue;

      const log = logByKey.get(`${campaign._id}:${id}`);
      const entry = {
        campaignId: campaign._id,
        campaignName: campaign.name,
        campaignStatus: campaign.status,
        addedAt: campaign.createdAt,
        scheduledFor: log?.scheduledFor || campaign.startDateTime || null,
        emailStatus: log?.status || 'not_started',
        sentAt: log?.sentAt || null,
        attempts: log?.attempts || 0,
      };

      if (!usageByContact.has(id)) usageByContact.set(id, []);
      usageByContact.get(id).push(entry);
    }
  }

  return contacts.map((contact) => {
    const usage = usageByContact.get(String(contact._id)) || [];
    const lastUsedAt = usage.reduce((latest, entry) => {
      const time = new Date(entry.sentAt || entry.addedAt || 0).getTime();
      return time > latest ? time : latest;
    }, 0);
    const lastSentAt = usage.reduce((latest, entry) => {
      const time = entry.sentAt ? new Date(entry.sentAt).getTime() : 0;
      return time > latest ? time : latest;
    }, 0);

    return {
      _id: contact._id,
      name: contact.name || '',
      email: contact.email,
      company: contact.company || '',
      job_title: contact.job_title || '',
      notes: contact.notes || '',
      source: contact.source,
      isOptedOut: Boolean(contact.isOptedOut),
      createdAt: contact.createdAt,
      campaignCount: usage.length,
      sentCount: usage.filter((entry) => entry.emailStatus === 'sent').length,
      lastUsedAt: lastUsedAt ? new Date(lastUsedAt) : null,
      lastSentAt: lastSentAt ? new Date(lastSentAt) : null,
      usage,
    };
  });
}

export async function getContactUsagePage({ search = '', used = 'all', page = 1, limit = 25 } = {}) {
  const pageNumber = toPositiveInt(page, 1, 100000);
  const pageSize = toPositiveInt(limit, 25, 100);
  const { filter, usedIds } = await buildContactFilter({ search, used });

  const [total, totalContacts, usedContacts, contacts] = await Promise.all([
    Contact.countDocuments(filter),
    Contact.countDocuments({}),
    Contact.countDocuments({ _id: { $in: usedIds } }),
    Contact.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  return {
    contacts: await attachUsage(contacts),
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    summary: {
      totalContacts,
      usedContacts,
      unusedContacts: Math.max(totalContacts - usedContacts, 0),
    },
  };
}

/** Every contact matching the filters (no pagination), with usage, for Excel export. */
export async function getContactsForExport({ search = '', used = 'all', excludeOptedOut = false } = {}) {
  const { filter } = await buildContactFilter({ search, used });
  if (excludeOptedOut) filter.isOptedOut = { $ne: true };

  const contacts = await Contact.find(filter).sort({ createdAt: -1, _id: -1 }).lean();
  return attachUsage(contacts);
}
