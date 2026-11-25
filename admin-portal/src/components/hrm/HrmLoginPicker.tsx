'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import { hrmApi, type HrmLinkableUser } from '@/lib/hrmApi';
import { normaliseLoginSearch } from '@/lib/hrmOnboarding';
import { formatHrmStatus, getHrmErrorMessage } from '@/lib/hrmUi';

/** How many logins the server returns when no limit is sent; a full page means there may be more. */
const LOGIN_LIST_LIMIT = 25;

/** A reason a login cannot be (or should carefully be) picked; `blocked` disables the row. */
export type LoginNote = { text: string; blocked: boolean } | null;

type Props = {
  /** Prefix for the element ids (the search box is `${idPrefix}-search`). */
  idPrefix: string;
  selected: HrmLinkableUser | null;
  onSelect: (user: HrmLinkableUser) => void;
  onClear: () => void;
  /** Per-login note, for example "Already has HR record EMP-0004". */
  getNote?: (user: HrmLinkableUser) => LoginNote;
  disabled?: boolean;
  error?: string | undefined;
};

const statusChip = (status: string) => (status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600');

function LoginSummary({ user }: { user: HrmLinkableUser }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="truncate text-sm font-semibold text-slate-900">{user.name || 'Unnamed login'}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusChip(user.status)}`}>{formatHrmStatus(user.status)}</span>
        {user.role ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{user.role.name}</span> : null}
      </span>
      <span className="mt-0.5 block truncate text-xs text-slate-500">{[user.email, user.mobile].filter(Boolean).join(' · ') || 'No email or mobile on this login'}</span>
    </span>
  );
}

/**
 * Searchable list of employee logins that have no HR record yet (created earlier on the Users page).
 * The list is fetched from the server as the user types (debounced), so it works with any number of logins.
 */
export default function HrmLoginPicker({ idPrefix, selected, onSelect, onClear, getNote, disabled = false, error }: Props) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<HrmLinkableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (selected) return undefined;
    let cancelled = false;
    // A phone number typed with +91 / 91 / a leading 0 is searched by its plain digits.
    const search = normaliseLoginSearch(query);
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError('');
      try {
        const response = await hrmApi.listLinkableUsers(search || undefined);
        if (!cancelled) setUsers(response.data.users || []);
      } catch (requestError) {
        if (!cancelled) setLoadError(getHrmErrorMessage(requestError, 'Unable to load the employee logins.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, reloadKey, selected]);

  if (selected) {
    const note = getNote?.(selected) ?? null;
    return (
      <div>
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50/60 px-3 py-2.5">
          <LoginSummary user={selected} />
          <button type="button" onClick={onClear} disabled={disabled} className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Change</button>
        </div>
        {note ? <p className="mt-1 text-xs leading-5 text-amber-800">{note.text}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id={`${idPrefix}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          // With text in the box Escape only clears the search (the dialog around it stays open and keeps its form).
          data-escape-local={query ? '' : undefined}
          onKeyDown={(event) => { if (event.key === 'Escape' && query) { event.preventDefault(); setQuery(''); } }}
          placeholder="Search by name, email or mobile"
          aria-label="Search employee logins"
          aria-invalid={Boolean(error)}
          autoComplete="off"
          disabled={disabled}
          className={`h-10 w-full rounded-lg border bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 disabled:bg-slate-50 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`}
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-amber-500" aria-label="Searching" /> : null}
      </div>
      <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white" aria-busy={loading}>
        {loadError ? (
          <div role="alert" className="flex flex-col items-center gap-2 px-4 py-6 text-center text-xs text-rose-700">
            <AlertCircle className="h-5 w-5" /> {loadError}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">Try again</button>
          </div>
        ) : users.length ? (
          <ul>
            {users.map((user) => {
              const note = getNote?.(user) ?? null;
              const blocked = Boolean(note?.blocked);
              return (
                <li key={user.id} className="border-b border-slate-100 last:border-b-0">
                  <button type="button" disabled={blocked || disabled} onClick={() => onSelect(user)} className="flex w-full flex-col items-stretch gap-1 px-3 py-2.5 text-left hover:bg-amber-50/60 focus-visible:bg-amber-50/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70">
                    <span className="flex items-center gap-3"><LoginSummary user={user} /></span>
                    {note ? <span className={`text-xs leading-5 ${blocked ? 'text-slate-500' : 'text-amber-800'}`}>{note.text}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : loading ? (
          <p role="status" className="px-4 py-6 text-center text-xs text-slate-500">Loading employee logins…</p>
        ) : (
          <p role="status" className="px-4 py-6 text-center text-xs leading-5 text-slate-500">
            {query.trim() ? <>No login matches “{query.trim()}”.</> : 'No employee login is waiting for an HR record. Logins created on the Users page appear here until they get one.'}
          </p>
        )}
      </div>
      {error ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{error}</p> : users.length >= LOGIN_LIST_LIMIT && !loading && !loadError
        ? <p role="status" className="mt-1 text-xs leading-5 text-amber-800">Showing the first {LOGIN_LIST_LIMIT} logins – type a name, email or mobile number to narrow the list.</p>
        : <p className="mt-1 text-xs leading-5 text-slate-500">Only employee logins without an HR record are listed.</p>}
    </div>
  );
}
