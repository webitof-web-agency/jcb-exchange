import { toast } from 'react-toastify';
import { downloadTableFile } from '@/lib/tabularExport';
import { apiErrorMessage } from '@/lib/financeWorkspaceClient';

const PAGE = 200; // the finance-hub list APIs cap pageSize at 200
const MAX_ROWS = 10000;

/**
 * Loads every page of a register with the current filters and saves it as CSV.
 * `load(page, pageSize)` returns that page's rows and the total count.
 */
export async function exportAllPages<T>(
  load: (page: number, pageSize: number) => Promise<{ rows: T[]; total: number }>,
  columns: Array<{ header: string; value: (row: T) => string | number | null | undefined }>,
  fileName: string,
) {
  try {
    const first = await load(1, PAGE);
    const rows = [...first.rows];
    const pages = Math.ceil(Math.min(first.total, MAX_ROWS) / PAGE);
    for (let page = 2; page <= pages; page += 1) rows.push(...(await load(page, PAGE)).rows);
    if (!rows.length) {
      toast.info('Nothing to export for these filters.');
      return;
    }
    downloadTableFile({ columns, rows, fileName: `${fileName}-${new Date().toISOString().slice(0, 10)}`, format: 'csv' });
    if (first.total > MAX_ROWS) toast.warn(`Exported the first ${MAX_ROWS} rows. Narrow the dates to export the rest.`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Could not export.'));
  }
}
