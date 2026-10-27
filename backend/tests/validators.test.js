import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeImportedContacts, parseManualEmailList, validateCampaignInput, validateContactRow, validateTestEmail } from '../src/utils/validators.js';

test('validateContactRow accepts valid contact data', () => {
  const result = validateContactRow({
    name: 'Jane Doe',
    email: 'jane@example.com',
    company: 'Acme Cloud',
    job_title: 'Backend Engineer',
    notes: 'Strong fit',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.email, 'jane@example.com');
});

test('validateContactRow rejects invalid email', () => {
  const result = validateContactRow({
    name: 'Jane Doe',
    email: 'not-an-email',
  });

  assert.equal(result.success, false);
});

test('validateTestEmail requires subject and body content', () => {
  const result = validateTestEmail({
    email: 'user@example.com',
    subject: 'Test email',
    body: 'This is a valid body message for the test email.',
  });

  assert.equal(result.success, true);
});

test('validateCampaignInput rejects empty contact list', () => {
  const result = validateCampaignInput({
    name: 'Job campaign',
    subject: 'Application for Backend Developer Role',
    body: 'Hello team, I would like to apply for the Node.js backend role.',
    contactIds: [],
  });

  assert.equal(result.success, false);
});

test('parseManualEmailList accepts a pasted email list with deduplication and max limit', () => {
  const result = parseManualEmailList('a@example.com, b@example.com\n a@example.com\nc@example.com\nd@example.com\ne@example.com\nf@example.com\ng@example.com\nh@example.com\ni@example.com\nj@example.com\nk@example.com\nl@example.com\nm@example.com\nn@example.com\no@example.com\np@example.com\nq@example.com\nr@example.com\ns@example.com\nt@example.com');

  assert.equal(result.success, true);
  assert.equal(result.emails.length, 20);
  assert.deepEqual(result.emails[0], 'a@example.com');
  assert.equal(result.invalid.length, 0);
});

test('parseManualEmailList accepts a name plus Gmail address format', () => {
  const result = parseManualEmailList('John Doe <john@gmail.com>');

  assert.equal(result.success, true);
  assert.deepEqual(result.emails, ['john@gmail.com']);
});

test('mergeImportedContacts keeps existing duplicate recipients as valid campaign contacts', () => {
  const existingContacts = [{ _id: 'existing-1', email: 'dup@example.com' }, { _id: 'existing-2', email: 'keep@example.com' }];
  const insertedContacts = [{ _id: 'new-1', email: 'new@example.com' }, { _id: 'new-2', email: 'dup@example.com' }];

  const merged = mergeImportedContacts(existingContacts, insertedContacts);

  assert.deepEqual(merged.map((contact) => contact.email), ['dup@example.com', 'keep@example.com', 'new@example.com']);
});

test('parseManualEmailList rejects invalid emails and over-limit lists', () => {
  const invalidResult = parseManualEmailList('a@example.com, bad-email, c@example.com');
  assert.equal(invalidResult.success, false);
  assert.equal(invalidResult.error.includes('invalid email'), true);

  const overLimitResult = parseManualEmailList(Array.from({ length: 25 }, (_, index) => `user${index + 1}@example.com`).join('\n'));
  assert.equal(overLimitResult.success, false);
  assert.equal(overLimitResult.error.includes('Maximum 20'), true);
});
