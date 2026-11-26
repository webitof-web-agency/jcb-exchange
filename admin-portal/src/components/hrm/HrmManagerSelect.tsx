'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Lock, Search, X } from 'lucide-react';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import { getInitials } from '@/lib/hrmDirectory';
import { managerDetail, managerLabels, managerWarning, type ManagerCandidate, type ManagerOptions, type ManagerPick } from '@/lib/hrmManagers';
import { useCloseAfterClick } from './useCloseAfterClick';

type Loaded = { key: string; text: string; data: ManagerOptions };

/** Name, job and permission role side by side, then the identifying line. */
function Person({ person, current, showSuggestion }: { person: ManagerPick; current?: boolean; showSuggestion?: boolean }) {
  const labels = managerLabels(person);
  const detail = managerDetail(person);
  return (
    <span className="block min-w-0">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="break-words text-sm font-semibold text-slate-900">{person.name}</span>
        {labels.designation ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{labels.designation}</span> : null}
        {labels.role ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800">{labels.role}</span> : null}
        {current ? <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">Current</span> : null}
        {showSuggestion && person.suggestedAs ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{person.suggestedAs}</span> : null}
      </span>
      {detail ? <span className="mt-0.5 block break-words text-xs text-slate-500">{detail}</span> : null}
    </span>
  );
}

const Avatar = ({ name }: { name: string }) => <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600" aria-hidden="true">{getInitials(name)}</span>;

/**
 * The "Reporting manager" dropdown used everywhere a manager is chosen. It lists the suggestion first, then that
 * office's team and the head office; typing searches further. Nothing is chosen for HR here: the caller decides what
 * to do with the suggestion (`onLoaded`).
 */
export default function HrmManagerSelect({
  id,
  ariaLabel = 'Reporting manager',
  value,
  onChange,
  load,
  loadKey,
  onLoadStart,
  onLoaded,
  currentId,
  auto = false,
  autoHint,
  invalid = false,
  disabled = false,
  allowRemove = true,
}: {
  id?: string;
  ariaLabel?: string;
  value: ManagerPick | null;
  onChange: (manager: ManagerPick | null) => void;
  /** The list for a search text ('' = the default list). */
  load: (search: string) => Promise<ManagerOptions>;
  /** Changes when the person or the place changes: the list is read again. */
  loadKey: string;
  onLoadStart?: () => void;
  onLoaded?: (options: ManagerOptions) => void;
  currentId?: string | null;
  /** `value` was filled in from the suggestion. */
  auto?: boolean;
  /** Said after "Filled in for you …". */
  autoHint?: string;
  invalid?: boolean;
  disabled?: boolean;
  allowRemove?: boolean;
}) {
  const generatedId = useId();
  const inputId = id ?? `hrm-manager-${generatedId}`;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState<Loaded | null>(null);
  const [found, setFound] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState('');
  const [reload, setReload] = useState(0);
  const [activeId, setActiveId] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const changeRef = useRef<HTMLButtonElement | null>(null);
  const focusSearch = useRef(false);
  const leave = useCloseAfterClick(wrapperRef);

  // The callers pass new functions on every render; the effects below always call the latest ones.
  const calls = useRef({ load, onLoadStart, onLoaded });
  useEffect(() => { calls.current = { load, onLoadStart, onLoaded }; });

  // The default list: read when the field appears and again when the person or place changes.
  useEffect(() => {
    if (disabled) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFailed('');
      calls.current.onLoadStart?.();
      try {
        const data = await calls.current.load('');
        if (cancelled) return;
        setBase({ key: loadKey, text: '', data });
        calls.current.onLoaded?.(data);
      } catch (error) {
        if (!cancelled) setFailed(getHrmErrorMessage(error, 'The list of managers could not be loaded.'));
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [loadKey, reload, disabled]);

  const text = query.trim();
  useEffect(() => {
    if (disabled || !open || !text) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setFailed('');
      try {
        const data = await calls.current.load(text);
        if (!cancelled) setFound({ key: loadKey, text, data });
      } catch (error) {
        if (!cancelled) setFailed(getHrmErrorMessage(error, 'Unable to search employees.'));
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, text, loadKey, reload, disabled]);

  useEffect(() => {
    if (open && focusSearch.current) {
      focusSearch.current = false;
      inputRef.current?.focus();
    }
  }, [open]);

  // Inside a dialog or a long form the whole list is brought into view once it has its rows.
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const hasRows = Boolean(base || found);
  useEffect(() => {
    if (!open || !hasRows) return undefined;
    const timer = window.setTimeout(() => dropdownRef.current?.scrollIntoView({ block: 'nearest' }), 0);
    return () => window.clearTimeout(timer);
  }, [open, hasRows]);

  const baseData = base?.key === loadKey ? base.data : null;
  // Only the answer to what is typed now (an older search must never be picked).
  const shown = text ? (found?.key === loadKey && found.text === text ? found.data : null) : baseData;
  const people = shown?.groups.flatMap((group) => group.people) ?? [];
  const selectable = people.filter((person) => !person.blocked);
  const active = selectable.find((person) => person.id === activeId) ?? selectable[0] ?? null;
  const loading = !shown && !failed;
  // A stored manager is only an id and a name: the list fills in the rest when it has them.
  const listed = value ? baseData?.groups.flatMap((group) => group.people).find((person) => person.id === value.id) : undefined;
  const chosen: ManagerPick | null = value ? { ...listed, ...value } : null;
  const warning = chosen ? managerWarning(chosen, baseData?.target) : null;
  const showCard = Boolean(chosen) && !open;

  const close = () => { setOpen(false); setQuery(''); };
  const choose = (person: ManagerCandidate) => {
    onChange(person);
    close();
    window.setTimeout(() => changeRef.current?.focus(), 0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const index = selectable.findIndex((person) => person.id === active?.id);
      const next = selectable[Math.min(Math.max(index + (event.key === 'ArrowDown' ? 1 : -1), 0), selectable.length - 1)];
      if (next) {
        setActiveId(next.id);
        document.getElementById(`${listId}-${next.id}`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Enter') {
      // Enter in the search box must never submit the form around it.
      event.preventDefault();
      if (open && active) choose(active);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  if (disabled && !chosen) return <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-500">Not set</p>;

  if (showCard && chosen) {
    return (
      <div className="font-normal">
        <div className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2 ${invalid ? 'border-rose-300' : 'border-slate-200'}`}>
          <Avatar name={chosen.name} />
          <span className="min-w-0 flex-1"><Person person={chosen} current={chosen.id === currentId} /></span>
          {disabled ? null : (
            <span className="flex shrink-0 items-center gap-1">
              <button ref={changeRef} id={inputId} type="button" onClick={() => { focusSearch.current = true; setOpen(true); }} aria-label={`Change ${ariaLabel.toLowerCase()}`} className="rounded-md px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50">Change</button>
              {allowRemove ? <button type="button" onClick={() => onChange(null)} aria-label={`Remove ${ariaLabel.toLowerCase()}`} title="Remove" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button> : null}
            </span>
          )}
        </div>
        {warning ? <p className="mt-1 flex items-start gap-1.5 text-xs font-medium text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{warning}</p> : null}
        {auto && chosen.suggestedAs ? <p className="mt-1 flex items-start gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Filled in for you: {chosen.suggestedAs}. {autoHint ?? 'Change it if needed.'}</span></p> : null}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="font-normal" onBlur={(event) => { if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) leave(close); }}>
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
          aria-activedescendant={open && active ? `${listId}-${active.id}` : undefined}
          autoComplete="off"
          value={query}
          placeholder="Select or search by name or code"
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={`h-10 w-full rounded-lg border bg-white pl-9 pr-9 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${invalid ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`}
        />
        {open && loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-label="Loading" /> : null}
      </div>
      {!open && !value && baseData?.note ? <p className="mt-1 text-xs text-slate-600">{baseData.note}</p> : null}
      {!open && failed ? <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{failed} <button type="button" onClick={() => setReload((current) => current + 1)} className="font-semibold underline">Try again</button></p> : null}
      {/* Focusable, so a click on a heading or the scrollbar keeps the list open. */}
      {open ? (
        <div ref={dropdownRef} tabIndex={-1} className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg outline-none">
          {shown?.note ? <p className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">{shown.note}</p> : null}
          <div id={listId} role="listbox" aria-label={ariaLabel} className="custom-scrollbar max-h-72 overflow-y-auto">
            {failed ? (
              <div role="presentation" className="flex items-start gap-2 px-3 py-2.5 text-xs font-medium text-rose-700">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{failed}</span>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setReload((current) => current + 1)} className="shrink-0 font-semibold underline">Try again</button>
              </div>
            ) : null}
            {shown?.groups.map((group) => (
              <div key={group.id} role="group" aria-label={group.title}>
                <p className="sticky top-0 z-10 border-y border-slate-100 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500" aria-hidden="true">{group.title}</p>
                {group.people.map((person) => {
                  const other = managerWarning(person, shown.target);
                  const highlighted = person.id === active?.id;
                  return (
                    <div
                      key={person.id}
                      id={`${listId}-${person.id}`}
                      role="option"
                      aria-selected={person.id === value?.id}
                      aria-disabled={Boolean(person.blocked)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => { if (!person.blocked) choose(person); }}
                      onMouseEnter={() => { if (!person.blocked) setActiveId(person.id); }}
                      className={`flex items-start gap-3 px-3 py-2 ${person.blocked ? 'cursor-not-allowed bg-slate-50 opacity-70' : highlighted ? 'cursor-pointer bg-amber-50' : 'cursor-pointer'}`}
                    >
                      <Avatar name={person.name} />
                      <span className="min-w-0 flex-1">
                        <Person person={person} current={person.id === currentId} showSuggestion={group.id === 'SUGGESTED'} />
                        {person.blocked ? <span className="mt-0.5 flex items-start gap-1.5 text-xs font-medium text-slate-700"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />{person.blocked}</span> : null}
                        {!person.blocked && other ? <span className="mt-0.5 flex items-start gap-1.5 text-xs font-medium text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{other}</span> : null}
                      </span>
                    </div>
                  );
                })}
                {group.more ? <p className="px-3 py-1.5 text-xs text-slate-500">More people here: type a name or code.</p> : null}
              </div>
            ))}
            {shown && !people.length ? <p className="px-3 py-3 text-center text-xs text-slate-500">{text ? 'No working employee matches.' : 'No working employee to show.'}</p> : null}
            {loading ? <p className="px-3 py-3 text-center text-xs text-slate-500">{text ? 'Searching…' : 'Loading…'}</p> : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5">
            <p className="text-[11px] text-slate-500">Only working employees are listed. Typing searches {shown && !shown.searchesEveryone ? 'everyone you have access to' : 'all offices'}.</p>
            {value ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={close} className="shrink-0 text-xs font-semibold text-slate-700 hover:underline">Keep {value.name}</button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
