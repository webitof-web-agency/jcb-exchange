'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Loader2, Search, X } from 'lucide-react';

/**
 * A dropdown that searches the server as you type (debounced; an older answer never replaces a newer one) instead of
 * loading a fixed first batch. The chosen item stays shown even when it is not in the current results.
 */
export default function RemoteSearchPicker<T>({
  selectedId,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  search,
  itemId,
  itemLabel,
  onSelect,
  onClear,
  disabled = false,
  pageSize = 20,
  buttonClassName,
}: {
  selectedId: string;
  /** What the button shows for the current choice ('' = nothing chosen). */
  selectedLabel: string;
  placeholder: string;
  searchPlaceholder: string;
  search: (query: string) => Promise<T[]>;
  itemId: (item: T) => string;
  itemLabel: (item: T) => string;
  onSelect: (item: T) => void;
  /** When given, a "clear" control resets the choice (for filters such as "All positions"). */
  onClear?: () => void;
  disabled?: boolean;
  pageSize?: number;
  buttonClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef(search);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const close = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const ticket = latest.current + 1;
    latest.current = ticket;
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchRef.current(query.trim())
        .then((items) => {
          if (latest.current !== ticket) return;
          setResults(items);
          setFailed(false);
        })
        .catch(() => { if (latest.current === ticket) setFailed(true); })
        .finally(() => { if (latest.current === ticket) setSearching(false); });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, query]);

  return (
    <div className="relative inline-block w-full text-left" ref={rootRef} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={buttonClassName ?? `flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-900 shadow-sm transition-all hover:border-gray-300 focus:outline-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
        >
          <span className={selectedLabel ? 'truncate font-semibold text-gray-900' : 'truncate font-medium text-gray-400'}>{selectedLabel || placeholder}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {onClear && selectedId ? (
          <button type="button" onClick={onClear} disabled={disabled} aria-label="Clear" title="Clear" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full z-[100] mt-1.5 w-full min-w-[240px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)]">
          <div className="mb-1.5 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3">
            <Search size={14} className="shrink-0 text-gray-400" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                if (query) setQuery('');
                else setIsOpen(false);
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent py-2 text-xs text-gray-900 outline-none"
            />
            {searching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />}
          </div>
          <div role="listbox" className="max-h-60 space-y-0.5 overflow-y-auto">
            {failed ? (
              <div className="px-3 py-2.5 text-xs text-rose-600">Could not load the list. Type again to retry.</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2.5 text-xs italic text-gray-400">{searching ? 'Searching…' : 'Nothing found'}</div>
            ) : (
              results.map((item) => {
                const id = itemId(item);
                const isSelected = id === selectedId;
                return (
                  <button
                    key={id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onSelect(item); setIsOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-xs transition-colors ${isSelected ? 'bg-amber-50/80 font-bold text-gray-950' : 'font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900'}`}
                  >
                    <span className="truncate text-[13px] leading-tight">{itemLabel(item)}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 stroke-[2.5] text-[#E5A700]" />}
                  </button>
                );
              })
            )}
          </div>
          {results.length >= pageSize && <p className="px-3 pt-1.5 text-[11px] text-gray-400">Showing the first {pageSize} matches. Type to narrow the list.</p>}
        </div>
      )}
    </div>
  );
}
