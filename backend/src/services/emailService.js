import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Plain-text email body -> simple HTML with line breaks (escaped, no <pre>). */
export function textToHtml(text = '') {
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5;">${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>`;
}

let transporter = null;

export function createTransporter() {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP credentials are not configured. Set SMTP_USER and SMTP_PASS (Gmail App Password).');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendMail({ to, subject, text, html, attachments = [] }) {
  const info = await createTransporter().sendMail({
    from: env.SMTP_FROM || env.SMTP_USER,
    to,
    subject,
    text,
    html,
    attachments,
  });
  logger.info({ to, messageId: info.messageId }, 'Email sent');
  return info;
}
