import { google } from 'googleapis';
import { GmailAccount } from '../models/GmailAccount.js';
import { Reply } from '../models/Reply.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export function buildGmailAuthUrl() {
  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    env.GMAIL_REDIRECT_URI,
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify'],
  });
}

export async function saveGmailTokens({ userEmail, code, oauth2Client }) {
  const { tokens } = await oauth2Client.getToken(code);

  await GmailAccount.findOneAndUpdate(
    { userEmail },
    {
      userEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600000),
      scope: tokens.scope,
      tokenType: tokens.token_type,
    },
    { upsert: true, new: true },
  );

  return tokens;
}

export async function syncReplies() {
  const gmailAccount = await GmailAccount.findOne().lean();

  if (!gmailAccount || !gmailAccount.accessToken) {
    logger.warn('No Gmail OAuth account connected for reply sync.');
    return { syncedCount: 0, message: 'No Gmail account connected.' };
  }

  const oauth2Client = new google.auth.OAuth2(
    env.GMAIL_CLIENT_ID,
    env.GMAIL_CLIENT_SECRET,
    env.GMAIL_REDIRECT_URI,
  );

  oauth2Client.setCredentials({
    access_token: gmailAccount.accessToken,
    refresh_token: gmailAccount.refreshToken,
    expiry_date: gmailAccount.expiryDate?.getTime(),
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const { data } = await gmail.users.messages.list({ userId: 'me', labelIds: ['INBOX'], maxResults: 20 });

  const messageList = data.messages || [];

  let syncedCount = 0;
  for (const item of messageList) {
    const message = await gmail.users.messages.get({ userId: 'me', id: item.id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Message-ID', 'In-Reply-To'] });
    const headers = message.data.payload?.headers || [];
    const filter = Object.fromEntries(headers.map((header) => [header.name, header.value]));

    const reply = {
      fromEmail: (filter.From || '').split('<')[1]?.replace('>', '') || filter.From || '',
      gmailMessageId: message.data.id,
      gmailThreadId: message.data.threadId,
      subject: filter.Subject || 'No subject',
      snippet: message.data.snippet || '',
      receivedAt: new Date(),
      status: 'new',
    };

    const existing = await Reply.findOne({ gmailMessageId: reply.gmailMessageId });
    if (!existing) {
      await Reply.create(reply);
      syncedCount += 1;
    }
  }

  return { syncedCount, message: 'Gmail replies synchronized successfully.' };
}
