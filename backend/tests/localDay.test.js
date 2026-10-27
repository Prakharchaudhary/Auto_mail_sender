import test from 'node:test';
import assert from 'node:assert/strict';
import { localDayInfo } from '../src/utils/campaignRules.js';

test('localDayInfo returns IST midnight even when the server runs in UTC', () => {
  // 27 Oct 2026, 02:00 IST is still 26 Oct in UTC.
  const { startOfDay, weekday } = localDayInfo(new Date('2026-10-26T20:30:00Z'), 'Asia/Kolkata');
  assert.equal(startOfDay.toISOString(), '2026-10-26T18:30:00.000Z'); // 27 Oct 00:00 IST
  assert.equal(weekday, 2); // Tuesday
});

test('localDayInfo late evening IST stays on the same IST day', () => {
  const { startOfDay } = localDayInfo(new Date('2026-10-27T18:00:00Z'), 'Asia/Kolkata'); // 23:30 IST
  assert.equal(startOfDay.toISOString(), '2026-10-26T18:30:00.000Z');
});
