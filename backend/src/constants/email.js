export const CAMPAIGN_STATUS = {
  DRAFT: 'draft',
  QUEUED: 'queued',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
};

export const EMAIL_STATUS = {
  QUEUED: 'queued',
  SENT: 'sent',
  FAILED: 'failed',
  RETRYING: 'retrying',
  SKIPPED: 'skipped',
};

// Maximum number of recipients a single campaign can hold.
export const MAX_CAMPAIGN_CONTACTS = 3000;
