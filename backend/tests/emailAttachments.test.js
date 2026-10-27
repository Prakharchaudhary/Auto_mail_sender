import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeAttachments } from '../src/utils/emailAttachments.js';

test('buildResumeAttachments creates a valid PDF attachment object', () => {
  const attachments = buildResumeAttachments({
    originalName: 'resume.pdf',
    path: '/tmp/resume.pdf',
    mimeType: 'application/pdf',
  });

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].filename, 'resume.pdf');
  assert.equal(attachments[0].path, '/tmp/resume.pdf');
  assert.equal(attachments[0].contentType, 'application/pdf');
});

test('buildResumeAttachments returns empty array when no resume is supplied', () => {
  assert.deepEqual(buildResumeAttachments(), []);
});
