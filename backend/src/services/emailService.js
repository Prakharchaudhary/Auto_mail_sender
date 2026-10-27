import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { buildJobApplicationEmail } from '../utils/emailTemplate.js';

export function createTransporter() {
  const smtpUser = env.SMTP_USER;
  const smtpPass = env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP credentials are not configured.');
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

export async function sendMail({ to, subject, text, html, attachments = [] }) {
  const transporter = createTransporter();

  const mailOptions = {
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html,
    attachments,
  };

  const info = await transporter.sendMail(mailOptions);
  logger.info({ to, messageId: info.messageId }, 'Email sent');

  return info;
}

export async function sendTestEmail({ to, subject, body }) {
  const message = buildJobApplicationEmail({
    name: 'Tester',
    company: 'Your Hiring Team',
    jobTitle: 'Node.js Developer',
    subject,
  });

  return sendMail({
    to,
    subject: subject || message.subject,
    text: body || message.body,
    html: `<pre>${(body || message.body).replace(/\n/g, '<br/>')}</pre>`,
  });
}
