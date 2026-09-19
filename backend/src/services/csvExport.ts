/** Build an Excel-friendly, RFC 4180-compatible CSV document. */
export const escapeCsvCell = (value: unknown): string => {
  const raw = value === null || value === undefined ? '' : String(value);
  // Prevent spreadsheet formula execution when a user-controlled text value is opened.
  const safe = typeof value === 'string' && /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const buildCsv = (rows: readonly (readonly unknown[])[]): string => {
  const body = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  // UTF-8 BOM keeps Hindi/Indian text readable in Microsoft Excel.
  return `\uFEFF${body}\r\n`;
};
