import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJobApplicationEmail } from '../src/utils/emailTemplate.js';

test('buildJobApplicationEmail produces a personalized subject and body', () => {
  const result = buildJobApplicationEmail({
    name: 'Sam',
    company: 'Northwind Labs',
    jobTitle: 'Backend Engineer',
    role: 'Node.js Developer',
  });

  assert.match(result.subject, /Backend Engineer/i);
  assert.match(result.body, /Hi Sam/i);
  assert.match(result.body, /Northwind Labs/i);
});
