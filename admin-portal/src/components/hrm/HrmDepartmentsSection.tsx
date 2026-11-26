'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, Building2, Check, Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react';
import { hrmApi, type HrmDepartmentRow } from '@/lib/hrmApi';
import { addCustomDepartment, cleanUnitName, describeDepartmentUse, filterDepartments } from '@/lib/hrmOrganisation';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';
import { ActiveChip, Empty, IconButton, SectionCard, orgTh } from './orgUi';

/**
 * The one place departments are added, renamed, switched off and deleted. Every row says what uses it, so nothing
 * is changed blindly: a department in use cannot be deleted (it is switched off instead, which keeps history), and
 * one that still places people or open offers cannot be switched off. The server enforces the same rules.
 */

type Pending = { type: 'delete' | 'toggle'; row: HrmDepartmentRow } | null;

const inputClass = (error?: string, height = 'h-9') =>
  `${height} w-full rounded-lg border bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100' : 'border-slate-200 focus:border-amber-400 focus:ring-amber-100'}`;
const cancelButton = 'h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';

export default function HrmDepartmentsSection({ canManage, query, reloadKey, onChanged }: {
  canManage: boolean;
  /** The page search box. */
  query: string;
  /** Bumped by the page whenever the organisation is reloaded. */
  reloadKey: number;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<HrmDepartmentRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadError('');
      try {
        const response = await hrmApi.listDepartmentsForManagement();
        if (!cancelled) setRows(response.data.departments);
      } catch (error) {
        if (!cancelled) setLoadError(getHrmErrorMessage(error, 'Unable to load the departments.'));
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [reloadKey, retryKey]);

  const all = rows ?? [];
  const visible = filterDepartments(all, query);

  const startEdit = (row: HrmDepartmentRow) => { setEditing({ id: row.id, value: row.name }); setEditError(''); };
  const stopEdit = () => { setEditing(null); setEditError(''); };

  const saveEdit = async (event: React.FormEvent, row: HrmDepartmentRow) => {
    event.preventDefault();
    if (!editing || saving) return;
    const result = addCustomDepartment(all.filter((other) => other.id !== row.id).map((other) => other.name), editing.value);
    if (result.error) { setEditError(result.error); return; }
    const name = result.names[result.names.length - 1]!;
    if (name === row.name) { stopEdit(); return; }
    setSaving(true);
    setEditError('');
    try {
      await hrmApi.updateOrganisationUnit(row.id, { name });
      toast.success(`Renamed to ${name}.`);
      stopEdit();
      onChanged();
    } catch (error) {
      setEditError(getHrmErrorMessage(error, `Unable to rename ${row.name}.`));
    } finally {
      setSaving(false);
    }
  };

  const finished = (message: string) => {
    toast.success(message);
    setPending(null);
    onChanged();
  };

  return (
    <SectionCard
      id="hrm-org-departments"
      icon={Building2}
      title="Departments"
      description="One list for the whole company (head office and state staff). Edit, switch off or delete them here."
      count={visible.length}
      action={canManage ? (
        <button type="button" onClick={() => setAdding(true)} disabled={!rows} className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 sm:self-auto"><Plus className="h-3.5 w-3.5" /> Add department</button>
      ) : undefined}
    >
      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:px-5">
          <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</span>
          <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-50">Try again</button>
        </div>
      ) : null}

      {!rows ? (
        loadError ? null : <div role="status" className="space-y-2 p-4"><span className="sr-only">Loading departments…</span>{[0, 1, 2].map((index) => <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : visible.length ? (
        <div className="custom-scrollbar max-h-[26rem] overflow-auto">
          <table className="min-w-full text-sm">
            <thead><tr><th scope="col" className={orgTh}>Department</th><th scope="col" className={orgTh}>In use by</th><th scope="col" className={orgTh}>Status</th>{canManage ? <th scope="col" className={`${orgTh} text-right`}><span className="sr-only">Actions</span></th> : null}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => {
                const isEditing = editing?.id === row.id;
                const uses = describeDepartmentUse(row);
                return (
                  <tr key={row.id} className={row.isActive ? 'hover:bg-slate-50/60' : 'bg-slate-50/60'}>
                    <td className="min-w-52 px-4 py-2.5 align-middle">
                      {isEditing ? (
                        <form onSubmit={(event) => void saveEdit(event, row)} noValidate>
                          <div className="flex items-center gap-1">
                            <input value={editing.value} onChange={(event) => { setEditing({ id: row.id, value: event.target.value }); setEditError(''); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); stopEdit(); } }} aria-label={`New name for ${row.name}`} aria-invalid={Boolean(editError)} maxLength={160} autoComplete="off" autoFocus className={`${inputClass(editError)} max-w-xs`} />
                            <button type="submit" disabled={saving} aria-label="Save name" title="Save" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button>
                            <IconButton label="Cancel rename" onClick={stopEdit} disabled={saving}><X className="h-4 w-4" /></IconButton>
                          </div>
                          {editError ? <p role="alert" className="mt-1 text-xs font-medium text-rose-600">{editError}</p>
                            : row.totalAssignments || row.openOffers ? <p className="mt-1 text-xs text-slate-500">Employee records show the new name. Offer letters already made keep the old one.</p> : null}
                        </form>
                      ) : (
                        <>
                          <p className={`font-semibold ${row.isActive ? 'text-slate-900' : 'text-slate-500'}`}>{row.name}</p>
                          <p className="font-mono text-[11px] text-slate-400">{row.code}</p>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      {uses.length ? (
                        <div className="flex flex-wrap gap-1">{uses.map((use) => <span key={use} className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{use}</span>)}</div>
                      ) : <span className="text-xs text-slate-400">Not used</span>}
                    </td>
                    <td className="px-4 py-2.5 align-middle"><ActiveChip active={row.isActive} /></td>
                    {canManage ? (
                      <td className="px-4 py-2.5 align-middle">
                        <div className="flex items-center justify-end gap-0.5">
                          <IconButton label={`Rename ${row.name}`} onClick={() => startEdit(row)} disabled={saving}><Pencil className="h-4 w-4" /></IconButton>
                          <IconButton label={`${row.isActive ? 'Switch off' : 'Switch on'} ${row.name}`} tone={row.isActive ? 'default' : 'success'} onClick={() => setPending({ type: 'toggle', row })}><Power className="h-4 w-4" /></IconButton>
                          <IconButton label={`Delete ${row.name}`} tone="danger" onClick={() => setPending({ type: 'delete', row })}><Trash2 className="h-4 w-4" /></IconButton>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Building2}
          title={all.length ? 'No department matches' : 'No departments yet'}
          description={all.length ? 'Try a different search.' : canManage ? 'Add the departments of the company, for example Sales or Accounts.' : 'Ask an administrator to add the departments.'}
          action={!all.length && canManage ? <button type="button" onClick={() => setAdding(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-3.5 w-3.5" /> Add department</button> : undefined}
        />
      )}

      {adding ? <AddDepartmentDialog rows={all} onClose={() => setAdding(false)} onDone={(message) => { setAdding(false); finished(message); }} /> : null}
      {pending?.type === 'delete' ? <DeleteDepartmentDialog row={pending.row} onClose={() => setPending(null)} onDone={finished} onSwitchOff={() => setPending({ type: 'toggle', row: pending.row })} /> : null}
      {pending?.type === 'toggle' ? <ToggleDepartmentDialog row={pending.row} onClose={() => setPending(null)} onDone={finished} /> : null}
    </SectionCard>
  );
}

/** A new department: its name only (one list for the whole company; the code is made by the server). */
function AddDepartmentDialog({ rows, onClose, onDone }: { rows: readonly HrmDepartmentRow[]; onClose: () => void; onDone: (message: string) => void }) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Says what is wrong with the name and puts the cursor back in the box. */
  const refuse = (message: string) => { setNameError(message); inputRef.current?.focus(); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const cleaned = cleanUnitName(name);
    if (!cleaned) { refuse('Enter the department name.'); return; }
    const result = addCustomDepartment(rows.map((row) => row.name), cleaned);
    if (result.error) {
      const off = rows.find((row) => !row.isActive && row.name.toLowerCase() === cleaned.toLowerCase());
      refuse(off ? `${off.name} already exists but is switched off. Switch it on in the list.` : result.error);
      return;
    }
    setSaving(true);
    setSubmitError('');
    try {
      await hrmApi.createOrganisationUnit({ kind: 'DEPARTMENT', name: cleaned });
      onDone(`${cleaned} added.`);
    } catch (error) {
      setSubmitError(getHrmErrorMessage(error, 'Unable to add the department. Nothing was saved.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title="Add department"
      description="One list for the whole company: head office and state staff choose from it."
      onClose={onClose}
      busy={saving}
      error={submitError}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
        <button type="submit" form="hrm-add-department-form" disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{saving ? 'Adding…' : 'Add department'}</button>
      </>}
    >
      <form id="hrm-add-department-form" onSubmit={submit} noValidate>
        <label htmlFor="hrm-department-name" className="mb-1 block text-sm font-medium text-slate-700">Department name<span className="text-rose-500"> *</span></label>
        <input ref={inputRef} id="hrm-department-name" value={name} onChange={(event) => { setName(event.target.value); setNameError(''); }} placeholder="e.g. Sales" maxLength={160} autoComplete="off" aria-invalid={Boolean(nameError)} aria-describedby="hrm-department-name-help" className={inputClass(nameError, 'h-10')} />
        <p id="hrm-department-name-help" role={nameError ? 'alert' : undefined} className={`mt-1 text-xs ${nameError ? 'font-medium text-rose-600' : 'text-slate-500'}`}>{nameError || 'The department code is created automatically.'}</p>
      </form>
    </HrmModal>
  );
}

/** Delete for good, or explain what still uses it and offer to switch it off instead. */
function DeleteDepartmentDialog({ row, onClose, onDone, onSwitchOff }: { row: HrmDepartmentRow; onClose: () => void; onDone: (message: string) => void; onSwitchOff: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await hrmApi.deleteOrganisationUnit(row.id);
      onDone(`${row.name} deleted.`);
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, `Unable to delete ${row.name}.`));
    } finally {
      setSaving(false);
    }
  };
  return (
    <HrmModal
      title={row.canDelete ? `Delete ${row.name}?` : `${row.name} is in use`}
      onClose={onClose}
      busy={saving}
      size="sm"
      error={error}
      footer={row.canDelete ? (
        <>
          <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Delete</button>
        </>
      ) : (
        <>
          <button type="button" onClick={onClose} className={cancelButton}>Close</button>
          {row.isActive && row.canSwitchOff ? <button type="button" onClick={onSwitchOff} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800"><Power className="h-4 w-4" />Switch off instead</button> : null}
        </>
      )}
    >
      {row.canDelete ? (
        <p className="text-sm leading-6 text-slate-600">Nothing uses this department. It is removed completely and this cannot be undone.</p>
      ) : (
        <div className="space-y-3 text-sm leading-6 text-slate-600">
          <p className="rounded-lg bg-amber-50 px-3 py-2 font-medium text-amber-900">{row.deleteBlockedReason}</p>
          {row.isActive && !row.canSwitchOff && row.switchOffBlockedReason ? <p>To switch it off: {row.switchOffBlockedReason}</p> : <p>Switching it off hides it from new choices and keeps the old records correct.</p>}
        </div>
      )}
    </HrmModal>
  );
}

function ToggleDepartmentDialog({ row, onClose, onDone }: { row: HrmDepartmentRow; onClose: () => void; onDone: (message: string) => void }) {
  const switchingOff = row.isActive;
  const blocked = switchingOff && !row.canSwitchOff;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await hrmApi.updateOrganisationUnit(row.id, { isActive: !switchingOff });
      onDone(`${row.name} ${switchingOff ? 'switched off' : 'switched on'}.`);
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, `Unable to switch ${switchingOff ? 'off' : 'on'} ${row.name}.`));
    } finally {
      setSaving(false);
    }
  };
  return (
    <HrmModal
      title={blocked ? `${row.name} cannot be switched off yet` : switchingOff ? `Switch off ${row.name}?` : `Switch on ${row.name}?`}
      onClose={onClose}
      busy={saving}
      size="sm"
      error={error}
      footer={<>
        <button type="button" onClick={onClose} disabled={saving} className={cancelButton}>{blocked ? 'Close' : 'Cancel'}</button>
        {blocked ? null : <button type="button" onClick={() => void submit()} disabled={saving} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-60 ${switchingOff ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{switchingOff ? 'Switch off' : 'Switch on'}</button>}
      </>}
    >
      {blocked ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium leading-6 text-amber-900">{row.switchOffBlockedReason}</p>
      ) : (
        <p className="text-sm leading-6 text-slate-600">
          {switchingOff ? 'It will no longer be offered for new employees or offers. Old records keep it, and you can switch it on again.' : 'It will be offered again for employees and offers.'}
        </p>
      )}
    </HrmModal>
  );
}
