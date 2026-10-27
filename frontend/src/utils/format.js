export const MAX_CAMPAIGN_CONTACTS = 3000;

export const formatDateTime = (value, fallback = '—') => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const formatDuration = (ms) => {
  const value = Number(ms || 0);
  if (value <= 0) return '—';
  if (value < 60000) return `${Math.round(value / 1000)} sec`;
  const minutes = value / 60000;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
};

const EMAIL_STATUS_LABELS = {
  not_started: 'Not started',
  queued: 'Queued',
  retrying: 'Retrying',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
};

export const emailStatusLabel = (status) => EMAIL_STATUS_LABELS[status] || status || 'Unknown';

export const emailStatusClass = (status) => `email-status email-status--${status || 'not_started'}`;
