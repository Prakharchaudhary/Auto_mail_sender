export function buildResumeAttachments(resume) {
  if (!resume || !resume.path || !resume.originalName) {
    return [];
  }

  return [{
    filename: resume.originalName,
    path: resume.path,
    contentType: resume.mimeType || 'application/pdf',
  }];
}
