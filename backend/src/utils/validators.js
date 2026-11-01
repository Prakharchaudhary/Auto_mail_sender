import { z } from 'zod';
import { MAX_CAMPAIGN_CONTACTS } from '../constants/email.js';

export const contactUploadSchema = z.object({
  name: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email(),
  company: z.string().trim().optional().or(z.literal('')),
  job_title: z.string().trim().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
});

export const campaignInputSchema = z.object({
  name: z.string().min(2).max(120),
  role: z.string().trim().max(120).optional(),
  subject: z.string().min(3).max(200),
  body: z.string().min(20).max(5000),
  contactIds: z.array(z.string())
    .min(1, 'Campaign requires at least one contact.')
    .max(MAX_CAMPAIGN_CONTACTS, `A campaign can have at most ${MAX_CAMPAIGN_CONTACTS} contacts.`)
    .optional()
    .default([]),
  resumeId: z.string().optional(),
  timezone: z.string().default('Asia/Kolkata'),
  startDateTime: z.string().datetime().optional().or(z.string().optional()),
  dailyLimit: z.number().int().min(1).max(200).optional(),
  batchSize: z.number().int().min(1).max(50).optional(),
  delayMs: z.number().int().min(1000).max(600000).optional(),
  approvalRequired: z.boolean().optional().default(true),
  sendFirst: z.boolean().optional().default(false),
});

export const testEmailSchema = z.object({
  email: z.string().trim().email(),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(20).max(5000),
});

export function normalizeContactRow(raw = {}) {
  return {
    name: String(raw.name || '').trim(),
    email: String(raw.email || '').trim().toLowerCase(),
    company: String(raw.company || '').trim(),
    job_title: String(raw.job_title || raw.jobTitle || '').trim(),
    notes: String(raw.notes || '').trim(),
  };
}

export function validateContactRow(raw) {
  return contactUploadSchema.safeParse(normalizeContactRow(raw));
}

export function validateCampaignInput(payload) {
  return campaignInputSchema.safeParse(payload);
}

export function parseManualEmailList(input, maxEmails = 20) {
  const raw = String(input ?? '');
  const tokens = raw
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const parsedEmails = [];
  const invalid = [];

  for (const token of tokens) {
    const angleMatch = token.match(/<([^>]+)>/);
    const candidate = angleMatch ? angleMatch[1] : token;

    if (!candidate || candidate.includes(' ')) {
      if (token && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token) && !(/<[^>]+>/.test(token))) {
        invalid.push(token);
      }
      continue;
    }

    const normalized = candidate.trim().toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!isValid) {
      invalid.push(token);
      continue;
    }

    parsedEmails.push(normalized);
  }

  const uniqueEmails = [...new Set(parsedEmails)];

  if (uniqueEmails.length === 0) {
    return {
      success: false,
      error: 'Add at least one valid email address.',
      emails: [],
      invalid: invalid.length ? invalid : [],
    };
  }

  if (uniqueEmails.length > maxEmails) {
    return {
      success: false,
      error: `Maximum ${maxEmails} email addresses are allowed in a pasted list.`,
      emails: [],
      invalid: [],
    };
  }

  if (invalid.length > 0) {
    return {
      success: false,
      error: `Found invalid email address(es): ${[...new Set(invalid)].join(', ')}.`,
      emails: [],
      invalid: [...new Set(invalid)],
    };
  }

  return {
    success: true,
    error: '',
    emails: uniqueEmails,
    invalid: [],
  };
}

export function mergeImportedContacts(existingContacts = [], insertedContacts = []) {
  const seen = new Set();
  const merged = [];

  for (const contact of [...existingContacts, ...insertedContacts]) {
    const email = String(contact?.email || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    merged.push(contact);
  }

  return merged;
}

export function validateTestEmail(payload) {
  return testEmailSchema.safeParse(payload);
}
