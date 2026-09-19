/**
 * @template T
 * @typedef {object} ExportColumn
 * @property {string} header
 * @property {(row: T) => string | number | null | undefined} value
 */

const MIME_BY_FORMAT = {
  csv: 'text/csv;charset=utf-8',
  xls: 'application/vnd.ms-excel;charset=utf-8',
};

const normalizeCell = (value) => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const escapeCsvCell = (value) => {
  const cell = normalizeCell(value);
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
};

const escapeHtmlCell = (value) => normalizeCell(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

/**
 * @template T
 * @param {ExportColumn<T>[]} columns
 * @param {T[]} rows
 * @returns {string}
 */
export function buildCsvContent(columns, rows) {
  const lines = [
    columns.map((column) => escapeCsvCell(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(column.value(row))).join(',')),
  ];

  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * @template T
 * @param {ExportColumn<T>[]} columns
 * @param {T[]} rows
 * @returns {string}
 */
export function buildExcelHtml(columns, rows) {
  const headerCells = columns.map((column) => `<th>${escapeHtmlCell(column.header)}</th>`).join('');
  const bodyRows = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtmlCell(column.value(row))}</td>`).join('')}</tr>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
}

/**
 * @param {string} fileName
 * @param {'csv' | 'xls'} extension
 * @returns {string}
 */
export function withFileExtension(fileName, extension) {
  const safeBaseName = fileName.trim().replace(/\.(csv|xls)$/i, '') || 'export';
  return `${safeBaseName}.${extension}`;
}

/**
 * @template T
 * @param {{ columns: ExportColumn<T>[], rows: T[], fileName: string, format: 'csv' | 'xls' }} input
 * @returns {{ content: string, fileName: string, mimeType: string }}
 */
export function createExportFile({ columns, rows, fileName, format }) {
  return {
    content: format === 'csv' ? buildCsvContent(columns, rows) : buildExcelHtml(columns, rows),
    fileName: withFileExtension(fileName, format),
    mimeType: MIME_BY_FORMAT[format],
  };
}

/**
 * @template T
 * @param {{ columns: ExportColumn<T>[], rows: T[], fileName: string, format: 'csv' | 'xls' }} input
 * @returns {boolean}
 */
export function downloadTableFile(input) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const { content, fileName, mimeType } = createExportFile(input);
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);

  return true;
}
