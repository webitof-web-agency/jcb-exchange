'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Pencil, Power, RefreshCw, Search, Trash2 } from 'lucide-react';
import { hrmApi } from '@/lib/hrmApi';
import { normaliseName, type ListChange, type ListKind } from '@/lib/hrmOnboarding';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';

/**
 * "Manage departments" and "Manage designations": rename, switch off / on and delete from one place, used from the Add
 * Employee form. Both lists behave the same way:
 *  - rename keeps history readable (a designation rename is applied to every assignment that used it);
 *  - switch off hides it from the pickers and keeps what already uses it;
 *  - delete is only offered when nothing ever used it, otherwise the reason is shown and switching off is the way.
 * The server decides every one of these and answers 409 with the reason, which is shown in the dialog.
 */

type ManageItem = {
  id: string;
  name: string;
  isActive: boolean;
  /** Built in (the HRM rules rely on it): no rename, switch off or delete. */
  isSystem: boolean;
  currentEmployees: number;
  totalAssignments: number;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  note: string | null;
};

type Adapter = {
  /** Tells the form which list a change belongs to. */
  kind: ListKind;
  noun: string;
  /** The longest name the server accepts for this list. */
  nameMaxLength: number;
  title: string;
  description: string;
  emptyText: string;
  load: () => Promise<ManageItem[]>;
  /** Resolves with how many assignments were rewritten by the rename (0 when that does not apply). */
  rename: (id: string, name: string) => Promise<number>;
  setActive: (id: string, isActive: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  renameWarning: (item: ManageItem) => string | null;
};

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

const departmentAdapter: Adapter = {
  kind: 'department',
  nameMaxLength: 160,
  noun: 'department',
  title: 'Manage departments',
  description: 'Rename, switch off or delete a department. One that people have been placed in cannot be deleted; switch it off instead.',
  emptyText: 'No departments yet.',
  load: async () => (await hrmApi.listDepartmentsForManagement()).data.departments.map((department) => ({
    id: department.id,
    name: department.name,
    isActive: department.isActive,
    isSystem: false,
    currentEmployees: department.currentEmployees,
    totalAssignments: department.totalAssignments,
    canDelete: department.canDelete,
    deleteBlockedReason: department.deleteBlockedReason,
    note: department.parent ? `Under ${department.parent.name}` : null,
  })),
  rename: async (id, name) => { await hrmApi.updateOrganisationUnit(id, { name }); return 0; },
  setActive: async (id, isActive) => { await hrmApi.updateOrganisationUnit(id, { isActive }); },
  remove: async (id) => { await hrmApi.deleteOrganisationUnit(id); },
  renameWarning: () => null,
};

const designationAdapter: Adapter = {
  kind: 'designation',
  nameMaxLength: 120,
  noun: 'designation',
  title: 'Manage designations',
  description: 'Rename, switch off or delete a designation. One that has been used cannot be deleted; switch it off instead.',
  emptyText: 'No designations yet.',
  load: async () => (await hrmApi.listDesignations()).data.designations.map((designation) => ({
    id: designation.id,
    name: designation.name,
    isActive: designation.isActive,
    isSystem: designation.isSystem,
    currentEmployees: designation.currentEmployees,
    totalAssignments: designation.totalAssignments,
    canDelete: designation.canDelete,
    deleteBlockedReason: designation.deleteBlockedReason,
    note: null,
  })),
  rename: async (id, name) => (await hrmApi.updateDesignation(id, { name })).data.assignmentsUpdated ?? 0,
  setActive: async (id, isActive) => { await hrmApi.updateDesignation(id, { isActive }); },
  remove: async (id) => { await hrmApi.deleteDesignation(id); },
  renameWarning: (item) => (item.totalAssignments
    ? `This also renames it on ${plural(item.totalAssignments, 'assignment')} (${plural(item.currentEmployees, 'employee')} now).`
    : null),
};

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: ManageItem[] };

function Chip({ tone, children }: { tone: 'green' | 'slate' | 'amber'; children: React.ReactNode }) {
  const style = tone === 'green' ? 'bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style}`}>{children}</span>;
}

const actionButton = 'inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

function ManageListDialog({ adapter, onClose, onChanged }: { adapter: Adapter; onClose: () => void; onChanged: (change: ListChange) => void }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [showOff, setShowOff] = useState(true);
  const [banner, setBanner] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  // Delete asks for a confirmation: the keyboard (and a screen reader) lands on it instead of staying on a button that vanished.
  useEffect(() => {
    if (confirmDeleteId) confirmRef.current?.focus();
  }, [confirmDeleteId]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const items = await adapter.load();
        if (!cancelled) setLoadState({ status: 'ready', items });
      } catch (error) {
        if (!cancelled) setLoadState({ status: 'error', message: getHrmErrorMessage(error, `Unable to load the ${adapter.noun} list.`) });
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [adapter, reloadKey]);

  const retry = () => {
    setLoadState({ status: 'loading' });
    setReloadKey((value) => value + 1);
  };

  /** Reloads the list after a change without flashing the loading state. */
  const refresh = async () => {
    try {
      setLoadState({ status: 'ready', items: await adapter.load() });
    } catch (error) {
      setBanner(getHrmErrorMessage(error, `The change was saved, but the ${adapter.noun} list could not be reloaded.`));
    }
  };

  const run = async (id: string, action: () => Promise<string | void>, change: ListChange, fallbackMessage: string) => {
    setBusyId(id);
    setBanner('');
    setNotice('');
    try {
      const message = await action();
      setNotice(message || 'Saved.');
      onChanged(change);
      await refresh();
      return true;
    } catch (error) {
      setBanner(getHrmErrorMessage(error, fallbackMessage));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const items = useMemo(() => (loadState.status === 'ready' ? loadState.items : []), [loadState]);
  const visible = useMemo(() => {
    const key = normaliseName(query).toLowerCase();
    return items.filter((item) => (showOff || item.isActive) && (!key || item.name.toLowerCase().includes(key)));
  }, [items, query, showOff]);

  const startEdit = (item: ManageItem) => {
    setEditingId(item.id);
    setEditValue(item.name);
    setEditError('');
    setConfirmDeleteId(null);
    setBanner('');
    setNotice('');
  };

  const saveEdit = async (item: ManageItem) => {
    const name = normaliseName(editValue);
    if (name.length < 2) { setEditError('Enter at least 2 characters.'); return; }
    if (name === item.name) { setEditingId(null); return; }
    if (items.some((other) => other.id !== item.id && normaliseName(other.name).toLowerCase() === name.toLowerCase())) {
      setEditError(`“${name}” already exists.`);
      return;
    }
    setEditError('');
    const done = await run(item.id, async () => {
      const updated = await adapter.rename(item.id, name);
      return `Renamed to “${name}”.${updated ? ` ${plural(updated, 'assignment')} updated.` : ''}`;
    }, { type: 'renamed', list: adapter.kind, id: item.id, from: item.name, to: name }, `Unable to rename the ${adapter.noun}.`);
    if (done) setEditingId(null);
    // A refused rename leaves the box open: the focus goes back into it (it was disabled while saving).
    else window.setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const toggleActive = async (item: ManageItem) => {
    setConfirmDeleteId(null);
    await run(
      item.id,
      async () => { await adapter.setActive(item.id, !item.isActive); return item.isActive ? `“${item.name}” switched off.` : `“${item.name}” switched on.`; },
      item.isActive ? { type: 'removed', list: adapter.kind, id: item.id, name: item.name } : { type: 'other', list: adapter.kind },
      `Unable to ${item.isActive ? 'switch off' : 'switch on'} the ${adapter.noun}.`,
    );
  };

  const confirmDelete = async (item: ManageItem) => {
    await run(
      item.id,
      async () => { await adapter.remove(item.id); return `“${item.name}” deleted.`; },
      { type: 'removed', list: adapter.kind, id: item.id, name: item.name },
      `Unable to delete the ${adapter.noun}.`,
    );
    setConfirmDeleteId(null);
    // The row is gone: keep the keyboard inside the list instead of dropping the focus on the page.
    searchRef.current?.focus();
  };

  const busy = busyId !== null;

  return (
    <HrmModal
      title={adapter.title}
      description={adapter.description}
      size="lg"
      onClose={onClose}
      busy={busy}
      footer={<button type="button" onClick={onClose} disabled={busy} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Close</button>}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${adapter.noun}s`} aria-label={`Search ${adapter.noun}s`} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={showOff} onChange={(event) => setShowOff(event.target.checked)} className="h-4 w-4 rounded accent-amber-500" />
          Show switched-off
        </label>
      </div>

      {banner ? <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{banner}</p> : null}
      {notice && !banner ? <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice}</p> : null}

      {loadState.status === 'loading' ? (
        <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-amber-500" />Loading…</div>
      ) : loadState.status === 'error' ? (
        <div className="py-10 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
          <p role="alert" className="mt-3 text-sm font-medium text-slate-800">{loadState.message}</p>
          <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Try again</button>
        </div>
      ) : !items.length ? (
        <p className="py-10 text-center text-sm text-slate-500">{adapter.emptyText}</p>
      ) : !visible.length ? (
        <p className="py-10 text-center text-sm text-slate-500">Nothing matches the search{showOff ? '' : ' (switched-off ones are hidden)'}.</p>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-500">Showing {visible.length} of {items.length}</p>
          <ul className="mt-2 space-y-2">
            {visible.map((item) => {
              const editing = editingId === item.id;
              const confirming = confirmDeleteId === item.id;
              const rowBusy = busyId === item.id;
              const warning = editing ? adapter.renameWarning(item) : null;
              return (
                <li key={item.id} className={`rounded-xl border border-slate-200 px-4 py-3 ${item.isActive ? 'bg-white' : 'bg-slate-50'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {editing ? (
                        <div>
                          <div className="flex gap-2">
                            <input
                              ref={renameInputRef}
                              value={editValue}
                              onChange={(event) => { setEditValue(event.target.value); setEditError(''); }}
                              data-escape-local
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') { event.preventDefault(); void saveEdit(item); }
                                else if (event.key === 'Escape') { event.preventDefault(); setEditingId(null); }
                              }}
                              aria-label={`New name for ${item.name}`}
                              aria-invalid={Boolean(editError)}
                              maxLength={adapter.nameMaxLength}
                              autoFocus
                              disabled={rowBusy}
                              className={`h-9 min-w-0 flex-1 rounded-lg border bg-white px-3 text-sm outline-none focus:ring-2 ${editError ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`}
                            />
                            <button type="button" onClick={() => void saveEdit(item)} disabled={rowBusy} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Save</button>
                            <button type="button" onClick={() => setEditingId(null)} disabled={rowBusy} className="h-9 shrink-0 rounded-lg px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60">Cancel</button>
                          </div>
                          {editError ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{editError}</p> : null}
                          {warning ? <p className="mt-1 text-xs text-amber-700">{warning}</p> : null}
                        </div>
                      ) : (
                        <>
                          <p className="flex flex-wrap items-center gap-2">
                            <span className={`font-semibold ${item.isActive ? 'text-slate-900' : 'text-slate-500'}`}>{item.name}</span>
                            {item.isSystem ? <Chip tone="amber">Built-in</Chip> : null}
                            <Chip tone={item.isActive ? 'green' : 'slate'}>{item.isActive ? 'Active' : 'Switched off'}</Chip>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {plural(item.currentEmployees, 'employee')} now · {plural(item.totalAssignments, 'assignment')} in total{item.note ? ` · ${item.note}` : ''}
                          </p>
                        </>
                      )}
                    </div>

                    {!editing && !item.isSystem && !confirming ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => startEdit(item)} disabled={busy} aria-label={`Rename ${item.name}`} className={actionButton}><Pencil className="h-3.5 w-3.5" /> Rename</button>
                        <button type="button" onClick={() => void toggleActive(item)} disabled={busy} aria-label={`${item.isActive ? 'Switch off' : 'Switch on'} ${item.name}`} className={actionButton}>
                          {rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}{item.isActive ? 'Switch off' : 'Switch on'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setConfirmDeleteId(item.id); setBanner(''); setNotice(''); }}
                          disabled={busy || !item.canDelete}
                          title={item.canDelete ? undefined : (item.deleteBlockedReason ?? undefined)}
                          aria-label={`Delete ${item.name}`}
                          className={`${actionButton} ${item.canDelete ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : ''}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {item.isSystem ? (
                    <p className="mt-2 text-xs text-slate-500">Built-in: the HRM rules rely on it, so it cannot be renamed, switched off or deleted.</p>
                  ) : confirming ? (
                    <div ref={confirmRef} tabIndex={-1} role="alertdialog" aria-label={`Confirm deleting ${item.name}`} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-rose-50 px-3 py-2.5 outline-none">
                      <p className="text-xs font-semibold text-rose-800">Delete “{item.name}”? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void confirmDelete(item)} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60">{rowBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Delete</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={busy} className="h-8 rounded-lg px-3 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-60">Cancel</button>
                      </div>
                    </div>
                  ) : !item.canDelete && !editing && item.deleteBlockedReason ? (
                    <p className="mt-2 text-xs text-slate-500">Can’t be deleted: {item.deleteBlockedReason}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </HrmModal>
  );
}

export function ManageDepartmentsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: (change: ListChange) => void }) {
  return <ManageListDialog adapter={departmentAdapter} onClose={onClose} onChanged={onChanged} />;
}

export function ManageDesignationsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: (change: ListChange) => void }) {
  return <ManageListDialog adapter={designationAdapter} onClose={onClose} onChanged={onChanged} />;
}
