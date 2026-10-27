import express from 'express';
import mongoose from 'mongoose';
import { Contact } from '../models/Contact.js';
import { contactUpload } from '../middleware/upload.js';
import { logger } from '../config/logger.js';
import { parseManualEmailList, normalizeContactRow, validateContactRow } from '../utils/validators.js';
import { parseUploadBuffer } from '../utils/fileParser.js';
import { getContactsForExport, getContactUsagePage } from '../services/contactService.js';
import { formatExcelDate, sendWorkbook } from '../utils/excelExport.js';
import { env } from '../config/env.js';

const router = express.Router();

/**
 * Insert contacts that do not exist yet, then return the stored documents for every
 * requested email. Re-reading from the database (instead of trusting insertMany's return
 * value) guarantees that every valid email maps to a contact id, even if some inserts
 * fail with duplicate-key errors because of concurrent uploads.
 */
async function upsertContacts(rows, source) {
  const emails = rows.map((row) => row.email);
  const existing = await Contact.find({ email: { $in: emails } }, { email: 1 }).lean();
  const existingEmails = new Set(existing.map((contact) => contact.email));
  const newRows = rows.filter((row) => !existingEmails.has(row.email));

  if (newRows.length > 0) {
    try {
      await Contact.insertMany(newRows.map((row) => ({
        email: row.email,
        name: row.name || '',
        company: row.company || '',
        job_title: row.job_title || '',
        notes: row.notes || '',
        source,
      })), { ordered: false });
    } catch (error) {
      // 11000 = duplicate key; anything else is a real failure worth logging.
      const writeErrors = error?.writeErrors || [];
      const onlyDuplicates = writeErrors.length > 0 && writeErrors.every((item) => (item.code ?? item.err?.code) === 11000);
      if (!onlyDuplicates && error?.code !== 11000) {
        logger.error({ err: error }, 'Contact insert failed');
        throw error;
      }
    }
  }

  const stored = await Contact.find({ email: { $in: emails } }, { email: 1 }).lean();
  return { stored, existingCount: existingEmails.size };
}

router.post('/upload', contactUpload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ message: 'A contact file is required.' });
  }

  try {
    const rows = parseUploadBuffer(req.file.buffer, req.file.originalname);
    const validRows = [];
    const invalidRows = [];
    const inFileDuplicates = [];
    const seen = new Set();

    for (const row of rows) {
      const normalized = normalizeContactRow(row);
      const validation = validateContactRow(normalized);

      if (!validation.success || !normalized.email) {
        invalidRows.push({
          row: normalized,
          errors: validation.success ? ['Email is required.'] : validation.error.issues.map((issue) => issue.message),
        });
        continue;
      }

      if (seen.has(normalized.email)) {
        inFileDuplicates.push(normalized.email);
        continue;
      }

      seen.add(normalized.email);
      validRows.push(normalized);
    }

    const { stored, existingCount } = validRows.length > 0
      ? await upsertContacts(validRows, 'upload')
      : { stored: [], existingCount: 0 };

    return res.json({
      message: 'Contact file processed successfully.',
      summary: {
        total: rows.length,
        valid: stored.length,
        invalid: invalidRows.length,
        duplicate: inFileDuplicates.length,
        alreadyExisting: existingCount,
        imported: stored.length,
      },
      invalidRows: invalidRows.slice(0, 100),
      duplicates: inFileDuplicates.slice(0, 100),
      imported: stored.map((contact) => ({ id: contact._id, email: contact.email })),
      contacts: stored.map((contact) => ({ _id: contact._id, email: contact.email })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/manual', async (req, res, next) => {
  try {
    const rawEmails = req.body?.emails ?? '';
    const parsed = parseManualEmailList(rawEmails, 20);

    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error });
    }

    const { stored, existingCount } = await upsertContacts(parsed.emails.map((email) => ({ email })), 'manual');

    return res.json({
      message: 'Manual email list processed successfully.',
      summary: {
        total: parsed.emails.length,
        valid: stored.length,
        invalid: 0,
        duplicate: existingCount,
        imported: stored.length,
      },
      contacts: stored.map((contact) => ({ _id: contact._id, email: contact.email })),
      duplicates: existingCount,
    });
  } catch (error) {
    return next(error);
  }
});

// Contacts with the campaigns they were used in. Must be declared before '/:id'.
router.get('/usage', async (req, res, next) => {
  try {
    const result = await getContactUsagePage({
      search: req.query.search,
      used: req.query.used,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

// Excel export of all contacts matching the filters. The first four columns
// (Name, Email, Company, Title) match the upload format, so the file can be re-uploaded.
router.get('/export', async (req, res, next) => {
  try {
    const contacts = await getContactsForExport({
      search: req.query.search,
      used: req.query.used,
      excludeOptedOut: req.query.excludeOptedOut === 'true',
    });
    const tz = env.DEFAULT_TIMEZONE;

    const rows = contacts.map((contact) => ({
      name: contact.name,
      email: contact.email,
      company: contact.company,
      title: contact.job_title,
      notes: contact.notes,
      addedOn: formatExcelDate(contact.createdAt),
      campaignCount: contact.campaignCount,
      campaigns: contact.usage.map((entry) => entry.campaignName).join(', '),
      timesSent: contact.sentCount,
      lastSentAt: formatExcelDate(contact.lastSentAt),
      optedOut: contact.isOptedOut ? 'Yes' : 'No',
    }));

    const usageRows = contacts.flatMap((contact) => contact.usage.map((entry) => ({
      name: contact.name,
      email: contact.email,
      company: contact.company,
      campaign: entry.campaignName,
      campaignStatus: entry.campaignStatus,
      emailStatus: entry.emailStatus === 'not_started' ? 'not started' : entry.emailStatus,
      addedAt: formatExcelDate(entry.addedAt),
      sentAt: formatExcelDate(entry.sentAt),
    })));

    const stamp = new Date().toISOString().slice(0, 10);
    return await sendWorkbook(res, {
      filename: `contacts-${req.query.used && req.query.used !== 'all' ? `${req.query.used}-` : ''}${stamp}.xlsx`,
      sheets: [
        {
          name: 'Contacts',
          columns: [
            { header: 'Name', key: 'name', width: 24 },
            { header: 'Email', key: 'email', width: 34 },
            { header: 'Company', key: 'company', width: 24 },
            { header: 'Title', key: 'title', width: 22 },
            { header: 'Notes', key: 'notes', width: 24 },
            { header: `Added On (${tz})`, key: 'addedOn', width: 24 },
            { header: 'Campaigns Used', key: 'campaignCount', width: 16 },
            { header: 'Campaign Names', key: 'campaigns', width: 40 },
            { header: 'Times Sent', key: 'timesSent', width: 12 },
            { header: `Last Sent At (${tz})`, key: 'lastSentAt', width: 24 },
            { header: 'Opted Out', key: 'optedOut', width: 11 },
          ],
          rows,
        },
        {
          name: 'Campaign History',
          columns: [
            { header: 'Name', key: 'name', width: 24 },
            { header: 'Email', key: 'email', width: 34 },
            { header: 'Company', key: 'company', width: 24 },
            { header: 'Campaign', key: 'campaign', width: 32 },
            { header: 'Campaign Status', key: 'campaignStatus', width: 16 },
            { header: 'Email Status', key: 'emailStatus', width: 14 },
            { header: `Added To Campaign (${tz})`, key: 'addedAt', width: 26 },
            { header: `Sent At (${tz})`, key: 'sentAt', width: 24 },
          ],
          rows: usageRows,
        },
      ],
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 }).lean();
    return res.json({ contacts });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid contact id.' });
    }
    const contact = await Contact.findById(req.params.id).lean();
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }
    return res.json({ contact });
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid contact id.' });
    }
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: 'Contact not found.' });
    }
    return res.json({ message: 'Contact deleted successfully.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
