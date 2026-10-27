import ExcelJS from 'exceljs';
import { env } from '../config/env.js';

/** Date as readable text in the app timezone (Excel would otherwise show UTC). */
export function formatExcelDate(value, timeZone = env.DEFAULT_TIMEZONE) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Strip a leading = + - @ so a cell can never be evaluated as a formula when the
 * file is opened in Excel (CSV/formula injection).
 */
function safeCell(value) {
  if (typeof value !== 'string') return value ?? '';
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * Stream an .xlsx file to the response.
 * sheets: [{ name, columns: [{ header, key, width }], rows: [{...}] }]
 */
export async function sendWorkbook(res, { filename, sheets }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = env.APP_NAME;
  workbook.created = new Date();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width || 18,
    }));

    for (const row of sheet.rows) {
      const safeRow = {};
      for (const column of sheet.columns) safeRow[column.key] = safeCell(row[column.key]);
      worksheet.addRow(safeRow);
    }

    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    header.alignment = { vertical: 'middle' };
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
  }

  const safeName = filename.replace(/[^a-z0-9._-]+/gi, '-');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  await workbook.xlsx.write(res);
  res.end();
}
