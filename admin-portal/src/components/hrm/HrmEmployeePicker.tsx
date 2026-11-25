'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, Search, X } from 'lucide-react';
import { hrmApi, type HrmEmployee } from '@/lib/hrmApi';
import { getAssignmentLocation, getEmployeeDisplayName, getInitials } from '@/lib/hrmDirectory';
import { getHrmErrorMessage } from '@/lib/hrmUi';

/** What the dialogs need to know about a chosen person. officeUnitId tells whether they already work in a given office. */
export interface PickedEmployee {
  id: string;
  name: string;
  employeeCode: string;
  designation: string | null;
  location: string;
  officeUnitId: string | null;
  isOfficeManager: boolean;
}

export const toPickedEmployee = (employee: HrmEmployee): PickedEmployee => ({
  id: employee.id,
  name: getEmployeeDisplayName(employee),
  employeeCode: employee.employeeCode,
  designation: employee.currentAssignment?.designation ?? null,
  location: getAssignmentLocation(employee.currentAssignment),
  officeUnitId: employee.currentAssignment?.officeUnit?.id ?? null,
  isOfficeManager: Boolean(employee.currentAssignment?.isOfficeManager),
});

/** Only people who can work and manage are offered. */
const PICKABLE_STATUSES = 'ACTIVE,ONBOARDING,ON_LEAVE,NOTICE_PERIOD';

const subtitleOf = (employee: PickedEmployee) => [employee.employeeCode, employee.designation, employee.location].filter(Boolean).join(' · ');

/**
 * Search-as-you-type employee selector (server side search, debounced). The list opens under the field instead of
 * floating, so it works inside a scrolling dialog and on a phone. `value` is the chosen person; null shows the search box.
 */
export default function HrmEmployeePicker({
  id,
  value,
  onChange,
  excludeIds,
  placeholder = 'Search by name, code, email or mobile',
  disabled = false,
  invalid = false,
  ariaLabel,
}: {
  id?: string;
  value: PickedEmployee | null;
  onChange: (employee: PickedEmployee | null) => void;
  excludeIds?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? `hrm-picker-${generatedId}`;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickedEmployee[]>([]);
  // The search text the current `results` belong to. While it differs from what is typed, the list is stale.
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const changeButtonRef = useRef<HTMLButtonElement | null>(null);
  const refocusInput = useRef(false);

  // Debounced server search while the list is open. The first page (no text) loads at once.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const text = query.trim();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await hrmApi.listEmployees({ limit: 20, status: PICKABLE_STATUSES, ...(text ? { search: text } : {}) });
        if (cancelled) return;
        setResults(response.data.employees.map(toPickedEmployee));
        setResultsFor(text);
        setActiveIndex(0);
      } catch (loadError) {
        if (!cancelled) setError(getHrmErrorMessage(loadError, 'Unable to search employees.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, text ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, query, reloadKey]);

  // After "Change" clears the choice, put the cursor back in the search box.
  useEffect(() => {
    if (!value && refocusInput.current) {
      refocusInput.current = false;
      inputRef.current?.focus();
    }
  }, [value]);

  const visible = results.filter((employee) => !excludeIds?.includes(employee.id));
  // Results of an older search must never be picked by Enter while the new search is still on its way.
  const resultsAreCurrent = !loading && resultsFor === query.trim();

  const choose = (employee: PickedEmployee) => {
    onChange(employee);
    setOpen(false);
    setQuery('');
    window.setTimeout(() => changeButtonRef.current?.focus(), 0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      else setActiveIndex((current) => Math.min(current + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      // Enter in the search box must never submit the dialog form behind it.
      event.preventDefault();
      const picked = visible[activeIndex];
      if (open && picked && resultsAreCurrent) choose(picked);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  if (value) {
    return (
      <div className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 ${invalid ? 'border-rose-300' : 'border-slate-200'}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-800" aria-hidden="true">{getInitials(value.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{value.name}</span>
          <span className="block truncate text-xs text-slate-500">{subtitleOf(value)}</span>
        </span>
        {disabled ? null : (
          <button
            ref={changeButtonRef}
            type="button"
            onClick={() => { refocusInput.current = true; onChange(null); }}
            aria-label={`Change ${value.name}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" />Change
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      onBlur={(event) => { if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={invalid}
          aria-label={ariaLabel}
          aria-activedescendant={open && visible[activeIndex] ? `${listId}-${visible[activeIndex]!.id}` : undefined}
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`h-10 w-full rounded-lg border bg-white pl-9 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 ${invalid ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`}
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-label="Searching" /> : null}
      </div>
      {open ? (
        <div className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <ul id={listId} role="listbox" aria-label={ariaLabel ?? 'Employees'} className="max-h-56 overflow-y-auto py-1">
            {error ? (
              <li role="presentation" className="flex items-start gap-2 px-3 py-2.5 text-xs font-medium text-rose-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{error}</span>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setReloadKey((current) => current + 1)} className="shrink-0 font-semibold underline">Retry</button>
              </li>
            ) : null}
              {visible.map((employee, index) => (
                <li
                  key={employee.id}
                  id={`${listId}-${employee.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(employee)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${index === activeIndex ? 'bg-amber-50' : ''}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600" aria-hidden="true">{getInitials(employee.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{employee.name}{employee.isOfficeManager ? <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Manager</span> : null}</span>
                    <span className="block truncate text-xs text-slate-500">{subtitleOf(employee)}</span>
                  </span>
                  {index === activeIndex ? <Check className="h-4 w-4 shrink-0 text-amber-600" /> : null}
                </li>
              ))}
              {!visible.length && !loading && !error ? <li role="presentation" className="px-3 py-3 text-center text-xs text-slate-500">{query.trim() ? 'No matching employees.' : 'No employees to show.'}</li> : null}
              {!visible.length && loading ? <li role="presentation" className="px-3 py-3 text-center text-xs text-slate-500">Searching…</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
