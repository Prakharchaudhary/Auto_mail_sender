import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeAttachments } from '../src/utils/emailAttachments.js';

test('buildResumeAttachments uses the PDF stored in MongoDB', () => {
  const data = Buffer.from('%PDF-1.4 test');
  const attachments = buildResumeAttachments({ originalName: 'resume.pdf', data, mimeType: 'application/pdf' });

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].filename, 'resume.pdf');
  assert.deepEqual(attachments[0].content, data);
  assert.equal(attachments[0].contentType, 'application/pdf');
});

test('buildResumeAttachments returns nothing when a legacy file path no longer exists', () => {
  assert.deepEqual(buildResumeAttachments({ originalName: 'old.pdf', path: '/nonexistent/old.pdf' }), []);
});

test('buildResumeAttachments returns empty array when no resume is supplied', () => {
  assert.deepEqual(buildResumeAttachments(), []);
});
