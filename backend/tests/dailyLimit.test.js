import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllowedDailyBatchSize, isBusinessDay } from '../src/utils/campaignRules.js';
import { isCampaignDueForProcessing } from '../src/services/schedulerService.js';

test('getAllowedDailyBatchSize returns the remaining slot count within the daily cap', () => {
  const allowed = getAllowedDailyBatchSize({ dailyLimit: 10, batchSize: 10 }, 8, new Date('2026-10-19T12:00:00Z'));

  assert.equal(allowed, 2);
});

test('isCampaignDueForProcessing returns true once the scheduled time has passed', () => {
  const due = isCampaignDueForProcessing({ startDateTime: '2026-10-18T09:00:00Z' }, new Date('2026-10-18T09:05:00Z'));

  assert.equal(due, true);
});

test('isCampaignDueForProcessing waits for future scheduled times', () => {
  const due = isCampaignDueForProcessing({ startDateTime: '2026-10-18T09:00:00Z' }, new Date('2026-10-18T08:59:00Z'));

  assert.equal(due, false);
});

test('getAllowedDailyBatchSize is zero when the daily cap is already reached', () => {
  const allowed = getAllowedDailyBatchSize({ dailyLimit: 10, batchSize: 10 }, 10);

  assert.equal(allowed, 0);
});

test('isBusinessDay allows all days by default when no restriction is configured', () => {
  assert.equal(isBusinessDay(new Date('2026-10-17T12:00:00Z')), true);
  assert.equal(isBusinessDay(new Date('2026-10-19T12:00:00Z')), true);
});

test('getAllowedDailyBatchSize is zero on blocked days when allowedDays is set', () => {
  const allowed = getAllowedDailyBatchSize({ dailyLimit: 10, batchSize: 10, allowedDays: [1, 2, 3, 4, 5] }, 0, new Date('2026-10-17T12:00:00Z'));

  assert.equal(allowed, 0);
});
