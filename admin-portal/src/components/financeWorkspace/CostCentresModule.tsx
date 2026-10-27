'use client';

import { FormEvent, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, enumLabel, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';

type CostCentre = { id: string; code: string; name: string; category: string; parentId: string | null; isActive: boolean };
const CATEGORIES = ['BRANCH', 'YARD', 'DEPARTMENT', 'PROJECT', 'OTHER'];
type Form = { id?: string; code: string; name: string; category: string; parentId: string; isActive: boolean };

export default function CostCentresModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.settings.manage']);
  const centres = useResource(async () => (await api.get('/finance-hub/cost-centres')).data.costCentres as CostCentre[], 'cost-centres');
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const list = centres.data ?? [];
  const nameOf = (id: string | null) => list.find((item) => item.id === id)?.name ?? '—';

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const { id, ...payload } = form;
      const body = { ...payload, parentId: payload.parentId || null };
      if (id) await api.put(`/finance-hub/cost-centres/${id}`, body);
      else await api.post('/finance-hub/cost-centres', body);
      toast.success('Cost centre saved.');
      setForm(null);
      centres.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the cost centre.'));
    } finally {
      setBusy(false);
    }
  };

  if (centres.loading) return <Panel><LoadingState /></Panel>;
  if (centres.error) return <Panel><ErrorBanner message={centres.error} schemaMissing={centres.schemaMissing} /></Panel>;

  return (
    <Panel
      title="Cost centres"
      description="Branches, yards and departments for splitting expenses and profit. A ledger can make the cost centre mandatory."
      actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ code: '', name: '', category: 'YARD', parentId: '', isActive: true })}>Add cost centre</Button> : null}
    >
      {!canManage ? <ReadOnlyNotice>Editing needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
      {list.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Under</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((item) => (
                <tr key={item.id}>
                  <td className={`${cellClass} font-mono text-xs`}>{item.code}</td>
                  <td className={`${cellClass} font-semibold text-slate-900`}>{item.name}</td>
                  <td className={cellClass}>{enumLabel(item.category)}</td>
                  <td className={cellClass}>{nameOf(item.parentId)}</td>
                  <td className={cellClass}><Badge tone={item.isActive ? 'green' : 'slate'}>{item.isActive ? 'Active' : 'Inactive'}</Badge></td>
                  <td className={`${cellClass} text-right`}>{canManage ? <Button variant="ghost" onClick={() => setForm({ id: item.id, code: item.code, name: item.name, category: item.category, parentId: item.parentId ?? '', isActive: item.isActive })}>Edit</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No cost centres yet" description="Optional. Add yards or branches if you want profit and expenses per location." />}

      {form ? (
        <Modal title={form.id ? `Edit ${form.code}` : 'Add cost centre'} onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={save} className="grid gap-3 p-4 md:grid-cols-2">
            <Field label="Code *"><input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} className={`${inputClass} font-mono`} maxLength={20} required /></Field>
            <Field label="Name *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={120} required /></Field>
            <Field label="Type">
              <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={inputClass}>{CATEGORIES.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}</select>
            </Field>
            <Field label="Under">
              <select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })} className={inputClass}>
                <option value="">Top level</option>
                {list.filter((item) => item.id !== form.id).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
              </select>
            </Field>
            <Toggle checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label="Active" />
            <div className="md:col-span-2"><ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save</Button></ModalFooter></div>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
