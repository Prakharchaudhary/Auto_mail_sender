import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignAppliedRole, isWithinSendWindow, localDateRange } from '../src/utils/campaignRules.js';

const IST = 'Asia/Kolkata';

test('send window blocks the midnight IST run that caused 12 AM sends', () => {
  // 31 Oct 2026 00:03 IST = 30 Oct 18:33 UTC
  assert.equal(isWithinSendWindow(new Date('2026-10-30T18:33:00Z'), IST, '09:30', '18:00'), false);
});

test('send window opens at 09:30 IST and closes at 18:00 IST', () => {
  assert.equal(isWithinSendWindow(new Date('2026-10-31T03:59:00Z'), IST, '09:30', '18:00'), false); // 09:29
  assert.equal(isWithinSendWindow(new Date('2026-10-31T04:00:00Z'), IST, '09:30', '18:00'), true); // 09:30
  assert.equal(isWithinSendWindow(new Date('2026-10-31T12:29:00Z'), IST, '09:30', '18:00'), true); // 17:59
  assert.equal(isWithinSendWindow(new Date('2026-10-31T12:30:00Z'), IST, '09:30', '18:00'), false); // 18:00
});

test('equal or invalid window means no restriction', () => {
  assert.equal(isWithinSendWindow(new Date('2026-10-30T18:33:00Z'), IST, '00:00', '00:00'), true);
  assert.equal(isWithinSendWindow(new Date('2026-10-30T18:33:00Z'), IST, 'bad', '18:00'), true);
});

test('localDateRange covers whole IST days', () => {
  const { start, end } = localDateRange('2026-10-30', '2026-10-31', IST);
  assert.equal(start.toISOString(), '2026-10-29T18:30:00.000Z');
  assert.equal(end.toISOString(), '2026-10-31T18:30:00.000Z');
});

test('localDateRange rejects bad and reversed dates', () => {
  assert.throws(() => localDateRange('30-10-2026', '', IST), /YYYY-MM-DD/);
  assert.throws(() => localDateRange('2026-11-02', '2026-11-01', IST), /on or before/);
});

test('campaignAppliedRole prefers saved role, then subject, then name', () => {
  assert.equal(campaignAppliedRole({ role: 'AI Engineer', subject: 'Application for Backend Developer Role' }), 'AI Engineer');
  assert.equal(campaignAppliedRole({ subject: 'Application for Backend Developer Role' }), 'Backend Developer');
  assert.equal(campaignAppliedRole({ subject: 'Hello', name: 'Frontend Developer Applications' }), 'Frontend Developer');
});
