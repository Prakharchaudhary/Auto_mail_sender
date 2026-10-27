import fs from 'fs';

/**
 * Nodemailer attachment for a resume. Prefers the PDF stored in MongoDB; falls back to
 * a legacy file path only if that file still exists (it won't on Vercel).
 */
export function buildResumeAttachments(resume) {
  if (!resume || !resume.originalName) {
    return [];
  }

  const contentType = resume.mimeType || 'application/pdf';

  if (resume.data && resume.data.length) {
    const content = Buffer.isBuffer(resume.data) ? resume.data : Buffer.from(resume.data.buffer || resume.data);
    return [{ filename: resume.originalName, content, contentType }];
  }

  if (resume.path && fs.existsSync(resume.path)) {
    return [{ filename: resume.originalName, path: resume.path, contentType }];
  }

  return [];
}

/** True when the campaign has a resume configured but its file can't be attached. */
export function isResumeMissing(resume, attachments) {
  return Boolean(resume) && attachments.length === 0;
}
