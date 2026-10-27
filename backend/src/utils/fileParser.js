import path from 'path';
import xlsx from 'xlsx';

/** Parse an uploaded CSV/XLSX/XLS buffer into normalized contact rows. */
export function parseUploadBuffer(buffer, originalName) {
  if (!buffer || !buffer.length) {
    throw Object.assign(new Error('The uploaded file is empty.'), { statusCode: 400 });
  }

  const ext = path.extname(String(originalName || '')).toLowerCase();
  if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
    throw Object.assign(new Error('Unsupported file type for parsing.'), { statusCode: 400 });
  }

  const workbook = ext === '.csv'
    ? xlsx.read(buffer.toString('utf8'), { type: 'string' })
    : xlsx.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet ? xlsx.utils.sheet_to_json(sheet, { defval: '' }) : [];

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
