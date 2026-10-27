import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

export async function parseUploadFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('File not found during parsing.');
  }

  const ext = path.extname(filePath).toLowerCase();
  let rows = [];

  if (ext === '.csv') {
    const workbook = xlsx.readFile(filePath, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  } else if (['.xlsx', '.xls'].includes(ext)) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  } else {
    throw new Error('Unsupported file type for parsing.');
  }

  return rows.map((row) => ({
    name: String(row.name || row.Name || '').trim(),
    email: String(row.email || row.Email || '').trim().toLowerCase(),
    company: String(row.company || row.Company || '').trim(),
    job_title: String(
      row.job_title || row.jobTitle || row['Job Title'] || row['Job title']
      || row.title || row.Title || row.designation || row.Designation || '',
    ).trim(),
    notes: String(row.notes || row.Notes || '').trim(),
  }));
}
