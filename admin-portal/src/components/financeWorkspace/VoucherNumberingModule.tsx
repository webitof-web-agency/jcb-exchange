'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, enumLabel, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { loadFinancialYears } from './FinancialYearsModule';
import { Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, tableHeadClass } from './ui';
import { useResource } from './useResource';

type Series = { id: string; voucherType: string; prefix: string; nextNumber: number; padLength: number; preview: string };

const previewOf = (prefix: string, next: number, pad: number) => `${prefix.toUpperCase()}${String(next || 1).padStart(pad || 1, '0')}`;

export default function VoucherNumberingModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.settings.manage']);
  const years = useResource(loadFinancialYears, 'financial-years');
  const [yearId, setYearId] = useState('');
  const activeYear = (years.data ?? []).find((year) => year.id === yearId) || (years.data ?? []).find((year) => year.isCurrent) || years.data?.[0];
  const series = useResource(
    async () => (activeYear ? ((await api.get('/finance-hub/number-series', { params: { yearId: activeYear.id } })).data.series as Series[]) : []),
    `series-${activeYear?.id ?? 'none'}`,
  );
  const [editing, setEditing] = useState<Series | null>(null);
  const [form, setForm] = useState({ prefix: '', padLength: '5', nextNumber: '1' });
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => previewOf(form.prefix, Number(form.nextNumber), Number(form.padLength)), [form]);

  const startEdit = (item: Series) => {
    setEditing(item);
    setForm({ prefix: item.prefix, padLength: String(item.padLength), nextNumber: String(item.nextNumber) });
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await api.put(`/finance-hub/number-series/${editing.id}`, { prefix: form.prefix, padLength: Number(form.padLength), nextNumber: Number(form.nextNumber) });
      toast.success(`${enumLabel(editing.voucherType)} numbering updated.`);
      setEditing(null);
      series.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not update the number series.'));
    } finally {
      setBusy(false);
    }
  };

  if (years.loading) return <Panel><LoadingState /></Panel>;
  if (years.error) return <Panel><ErrorBanner message={years.error} schemaMissing={years.schemaMissing} /></Panel>;
  if (!years.data?.length) return <Panel><EmptyState title="Create a financial year first" description="Voucher number series are created per financial year (Finance Settings → Financial Year & Periods)." /></Panel>;

  return (
    <Panel
      title="Voucher numbering"
      description="A number is given only when a voucher is posted. The next number can move forward but never back, so numbers are never reused."
      actions={
        <select value={activeYear?.id ?? ''} onChange={(event) => setYearId(event.target.value)} className={`${inputClass} w-auto py-2`} aria-label="Financial year">
          {(years.data ?? []).map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
        </select>
      }
    >
      {!canManage ? <ReadOnlyNotice>Changing series needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
      {series.loading ? <LoadingState /> : series.error ? <ErrorBanner message={series.error} schemaMissing={series.schemaMissing} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Voucher type</th><th className="px-3 py-2">Prefix</th><th className="px-3 py-2">Digits</th><th className="px-3 py-2">Next number</th><th className="px-3 py-2">Next voucher no.</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(series.data ?? []).map((item) => (
                <tr key={item.id}>
                  <td className={`${cellClass} font-semibold text-slate-900`}>{enumLabel(item.voucherType)}</td>
                  <td className={`${cellClass} font-mono text-xs`}>{item.prefix}</td>
                  <td className={cellClass}>{item.padLength}</td>
                  <td className={cellClass}>{item.nextNumber}</td>
                  <td className={`${cellClass} font-mono text-xs font-semibold text-slate-900`}>{item.preview}</td>
                  <td className={`${cellClass} text-right`}>{canManage ? <Button variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => startEdit(item)}>Edit</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <Modal title={`${enumLabel(editing.voucherType)} numbering`} subtitle={activeYear?.label} onClose={() => { if (!busy) setEditing(null); }}>
          <form onSubmit={save} className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Prefix *" hint="Letters, digits, / _ -"><input value={form.prefix} onChange={(event) => setForm({ ...form, prefix: event.target.value.toUpperCase() })} className={`${inputClass} font-mono`} maxLength={30} required /></Field>
              <Field label="Digits *"><input type="number" min={1} max={8} value={form.padLength} onChange={(event) => setForm({ ...form, padLength: event.target.value })} className={inputClass} required /></Field>
              <Field label="Next number *" hint={`Cannot be lower than ${editing.nextNumber}`}><input type="number" min={editing.nextNumber} value={form.nextNumber} onChange={(event) => setForm({ ...form, nextNumber: event.target.value })} className={inputClass} required /></Field>
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">Next voucher will be <span className="font-mono font-semibold text-slate-900">{preview}</span></p>
            <ModalFooter>
              <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" busy={busy}>Save</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
