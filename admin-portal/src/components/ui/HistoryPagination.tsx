'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Page numbers to show: first, last, the current page and its neighbours, with gaps as null. */
const pageItems = (page: number, totalPages: number): Array<number | null> => {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((value) => value >= 1 && value <= totalPages));
  const sorted = Array.from(pages).sort((a, b) => a - b);
  return sorted.flatMap((value, index) => (index > 0 && value - sorted[index - 1]! > 1 ? [null, value] : [value]));
};

/** "Showing 21–40 of 340", page numbers, Prev/Next and a page-size picker. */
export default function HistoryPagination({
  page,
  pageSize,
  total,
  totalPages,
  pageSizes = [20, 50, 100],
  disabled = false,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  pageSizes?: number[];
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  if (total <= 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const buttonClass = 'inline-flex h-7 min-w-[28px] items-center justify-center rounded-lg border px-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <span>Showing <span className="font-bold text-slate-900">{first}–{last}</span> of <span className="font-bold text-slate-900">{total}</span></span>
        {onPageSizeChange ? (
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            disabled={disabled}
            aria-label="Rows per page"
            className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-amber-500"
          >
            {pageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
        ) : null}
      </div>
      {totalPages > 1 ? (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1} className={`${buttonClass} border-slate-200 text-slate-600 hover:bg-slate-50`} aria-label="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {pageItems(page, totalPages).map((item, index) => item === null ? (
            <span key={`gap-${index}`} className="px-1 text-slate-400">…</span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={disabled}
              aria-current={item === page ? 'page' : undefined}
              className={`${buttonClass} ${item === page ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {item}
            </button>
          ))}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={disabled || page >= totalPages} className={`${buttonClass} border-slate-200 text-slate-600 hover:bg-slate-50`} aria-label="Next page">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
