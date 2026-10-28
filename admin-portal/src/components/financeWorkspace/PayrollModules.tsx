'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Plus, Printer, RefreshCw, Trash2, Users } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { apiErrorMessage, enumLabel, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { GST_STATES } from './documentsShared';
import { isCashBank, todayIso, useLedgerLookups } from './ledgerLookups';
import { ChallansModule, downloadCsv } from './TaxModules';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, selectButtonClass, tableHeadClass, Tabs } from './ui';
import { useResource } from './useResource';
import VoucherDetail from './VoucherDetail';

type Earning = { code?: string; name: string; amount: number; pfWage: boolean };
type Employee = {
  party: { id: string; code: string; name: string; mobile: string | null; pan: string | null; bankName: string | null; bankAccountNumber: string | null; ifsc: string | null; isActive: boolean };
  salary: { employeeCode: string | null; designation: string | null; department: string | null; dateOfJoining: string | null; dateOfLeaving: string | null; structureId: string | null; earnings: Earning[]; pfApplicable: boolean; pfWageCap: boolean; esiApplicable: boolean; ptState: string | null; monthlyTds: number; uan: string | null; esiNumber: string | null; isActive: boolean; notes: string | null; gross: number } | null;
  advanceBalance: number;
};
type Structure = { id: string; name: string; components: Array<{ name: string; calc: 'FIXED' | 'PERCENT_OF_CTC' | 'BALANCE'; value: number; pfWage: boolean }>; isActive: boolean; notes: string | null };
const thisMonth = () => todayIso().slice(0, 7);
const useBanks = () => {
  const lookups = useLedgerLookups();
  return useMemo(() => lookups.accounts.filter((account) => account.isActive && isCashBank(account)).map(lookups.accountOption), [lookups]);
};

/** Splits a monthly gross into a structure's components. */
const applyStructure = (structure: Structure, gross: number): Earning[] => {
  const fixed = structure.components.filter((item) => item.calc !== 'BALANCE').map((item) => ({ name: item.name, pfWage: item.pfWage, amount: Math.round(item.calc === 'FIXED' ? item.value : (gross * item.value) / 100) }));
  const used = fixed.reduce((sum, item) => sum + item.amount, 0);
  const balance = structure.components.find((item) => item.calc === 'BALANCE');
  return balance ? [...fixed, { name: balance.name, pfWage: balance.pfWage, amount: Math.max(gross - used, 0) }] : fixed;
};

/** Employee list with monthly salary, statutory flags and advance balance. */
export function EmployeeSalaryModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.payroll.manage']);
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/payroll/employees')).data.employees as Employee[], `payroll-employees-${version}`);
  const structures = useResource(async () => (await api.get('/finance-hub/payroll/structures')).data.structures as Structure[], 'payroll-structures');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<{ employeeCode: string; designation: string; department: string; dateOfJoining: string; structureId: string; gross: string; earnings: Earning[]; pfApplicable: boolean; pfWageCap: boolean; esiApplicable: boolean; ptState: string; monthlyTds: string; uan: string; esiNumber: string; isActive: boolean; notes: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const open = (row: Employee) => {
    setEditing(row);
    const salary = row.salary;
    setForm({
      employeeCode: salary?.employeeCode ?? '', designation: salary?.designation ?? '', department: salary?.department ?? '', dateOfJoining: salary?.dateOfJoining ?? '', structureId: salary?.structureId ?? '',
      gross: salary ? String(salary.gross) : '', earnings: salary?.earnings.length ? salary.earnings : [{ name: 'Basic', amount: 0, pfWage: true }, { name: 'HRA', amount: 0, pfWage: false }],
      pfApplicable: salary?.pfApplicable ?? true, pfWageCap: salary?.pfWageCap ?? true, esiApplicable: salary?.esiApplicable ?? true, ptState: salary?.ptState ?? '27', monthlyTds: salary ? String(salary.monthlyTds || '') : '',
      uan: salary?.uan ?? '', esiNumber: salary?.esiNumber ?? '', isActive: salary?.isActive ?? true, notes: salary?.notes ?? '',
    });
  };
  const importStaff = async () => {
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/payroll/employees/import')).data as { users: number; linked: number };
      toast.success(`${result.users} staff logins checked; ${result.linked} new Employee parties linked.`);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not import staff.'));
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !form) return;
    setBusy(true);
    try {
      // The API reads only the profile fields; `gross` is the structure helper input.
      await api.put(`/finance-hub/payroll/employees/${editing.party.id}/salary`, { ...form, structureId: form.structureId || null, ptState: form.ptState || null, monthlyTds: form.monthlyTds || null, dateOfJoining: form.dateOfJoining || null, uan: form.uan || null, esiNumber: form.esiNumber || null });
      toast.success('Salary saved.');
      setEditing(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the salary.'));
    } finally {
      setBusy(false);
    }
  };
  const rows = list.data ?? [];
  const monthly = rows.filter((row) => row.salary?.isActive).reduce((sum, row) => sum + (row.salary?.gross ?? 0), 0);
  const gross = form ? form.earnings.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) : 0;
  return (
    <Panel title="Employee salary" description="Employees are parties of type Employee (Party Ledgers). Set the monthly earnings, PF / ESI / PT and TDS here; payroll uses the profile each month." actions={canManage ? <Button icon={<Users className="h-4 w-4" />} busy={busy && !form} onClick={() => void importStaff()}>Add staff logins as employees</Button> : null}>
      <div className="grid gap-3 p-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Employees</p><p className="text-[15px] font-semibold">{rows.length}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">On payroll</p><p className="text-[15px] font-semibold">{rows.filter((row) => row.salary?.isActive).length}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">Monthly gross</p><p className="text-[15px] font-semibold">{formatInr(monthly)}</p></div>
      </div>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !rows.length ? <EmptyState title="No employees" description="Mark parties as type Employee in Party Ledgers, or add staff logins with the button above." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Joined</th><th className="px-3 py-2">Statutory</th><th className="px-3 py-2 text-right">Monthly gross</th><th className="px-3 py-2 text-right">Advance due</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.party.id} className={row.salary && !row.salary.isActive ? 'opacity-60' : ''}>
                  <td className={cellClass}><span className="font-semibold">{row.party.name}</span><span className="block font-mono text-[11px] text-slate-400">{row.salary?.employeeCode ?? row.party.code}{row.party.pan ? ` · PAN ${row.party.pan}` : ' · PAN missing'}</span></td>
                  <td className={`${cellClass} text-xs`}>{row.salary?.designation ?? '—'}{row.salary?.department ? <span className="block text-slate-400">{row.salary.department}</span> : null}</td>
                  <td className={`${cellClass} text-xs`}>{formatDate(row.salary?.dateOfJoining)}{row.salary?.dateOfLeaving ? <span className="block text-red-600">Left {formatDate(row.salary.dateOfLeaving)}</span> : null}</td>
                  <td className={`${cellClass} text-xs`}>{row.salary ? [row.salary.pfApplicable ? `PF${row.salary.uan ? '' : ' (UAN?)'}` : null, row.salary.esiApplicable ? 'ESI' : null, row.salary.ptState ? `PT ${row.salary.ptState}` : null, row.salary.monthlyTds ? `TDS ${formatInr(row.salary.monthlyTds)}` : null].filter(Boolean).join(' · ') : <Badge tone="amber">No salary</Badge>}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{row.salary ? formatInr(row.salary.gross) : '—'}</td>
                  <td className={`${cellClass} text-right text-xs`}>{row.advanceBalance ? formatInr(row.advanceBalance) : '—'}</td>
                  <td className={`${cellClass} text-right`}>{canManage ? <Button variant="ghost" onClick={() => open(row)}>{row.salary ? 'Edit' : 'Set salary'}</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && form ? (
        <Modal title={`Salary: ${editing.party.name}`} subtitle="Monthly amounts for a full month. Tick PF wage for basic (+ DA)." onClose={() => { if (!busy) setEditing(null); }} wide>
          <form onSubmit={save} className="p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Employee code"><input value={form.employeeCode} onChange={(event) => setForm({ ...form, employeeCode: event.target.value })} className={inputClass} maxLength={30} /></Field>
              <Field label="Designation"><input value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} className={inputClass} maxLength={80} /></Field>
              <Field label="Department"><input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className={inputClass} maxLength={80} /></Field>
              <Field label="Date of joining"><input type="date" value={form.dateOfJoining} onChange={(event) => setForm({ ...form, dateOfJoining: event.target.value })} className={inputClass} /></Field>
              <Field label="Structure">
                <select value={form.structureId} onChange={(event) => setForm({ ...form, structureId: event.target.value })} className={inputClass}><option value="">Custom</option>{(structures.data ?? []).filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </Field>
              <Field label="Monthly gross (for structure)"><input type="number" min={0} value={form.gross} onChange={(event) => setForm({ ...form, gross: event.target.value })} className={inputClass} /></Field>
              <div className="flex items-end"><Button disabled={!form.structureId || !(Number(form.gross) > 0)} onClick={() => { const structure = structures.data?.find((item) => item.id === form.structureId); if (structure) setForm({ ...form, earnings: applyStructure(structure, Number(form.gross)) }); }}>Fill from structure</Button></div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200">
              <table className="w-full text-[13px]">
                <thead className={tableHeadClass}><tr><th className="px-3 py-2">Earning</th><th className="px-3 py-2 text-right">Monthly amount</th><th className="px-3 py-2">PF wage</th><th className="px-3 py-2" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {form.earnings.map((item, index) => (
                    <tr key={index}>
                      <td className="px-3 py-2"><input value={item.name} onChange={(event) => setForm({ ...form, earnings: form.earnings.map((row, at) => (at === index ? { ...row, name: event.target.value } : row)) })} className={`${inputClass} py-2`} maxLength={60} /></td>
                      <td className="w-40 px-3 py-2"><input type="number" min={0} value={item.amount} onChange={(event) => setForm({ ...form, earnings: form.earnings.map((row, at) => (at === index ? { ...row, amount: Number(event.target.value) } : row)) })} className={`${inputClass} py-2 text-right`} /></td>
                      <td className="px-3 py-2"><input type="checkbox" checked={item.pfWage} onChange={(event) => setForm({ ...form, earnings: form.earnings.map((row, at) => (at === index ? { ...row, pfWage: event.target.checked } : row)) })} className="h-4 w-4 accent-amber-500" /></td>
                      <td className="px-3 py-2 text-right">{form.earnings.length > 1 ? <button type="button" onClick={() => setForm({ ...form, earnings: form.earnings.filter((_, at) => at !== index) })} className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2"><Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, earnings: [...form.earnings, { name: '', amount: 0, pfWage: false }] })}>Add earning</Button><span className="text-[13px] font-semibold">Gross {formatInr(gross)}</span></div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.pfApplicable} onChange={(event) => setForm({ ...form, pfApplicable: event.target.checked })} className="h-4 w-4 accent-amber-500" />PF applies</label>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.pfWageCap} onChange={(event) => setForm({ ...form, pfWageCap: event.target.checked })} className="h-4 w-4 accent-amber-500" />PF on ₹15,000 ceiling</label>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.esiApplicable} onChange={(event) => setForm({ ...form, esiApplicable: event.target.checked })} className="h-4 w-4 accent-amber-500" />ESI applies (gross ≤ ₹21,000)</label>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-amber-500" />On payroll</label>
              <Field label="Professional tax state"><select value={form.ptState} onChange={(event) => setForm({ ...form, ptState: event.target.value })} className={inputClass}><option value="">None</option>{GST_STATES.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></Field>
              <Field label="Monthly TDS (192)" hint="From the employee's estimated annual tax."><input type="number" min={0} value={form.monthlyTds} onChange={(event) => setForm({ ...form, monthlyTds: event.target.value })} className={inputClass} /></Field>
              <Field label="UAN"><input value={form.uan} onChange={(event) => setForm({ ...form, uan: event.target.value.replace(/\D/g, '').slice(0, 12) })} className={inputClass} inputMode="numeric" /></Field>
              <Field label="ESI IP number"><input value={form.esiNumber} onChange={(event) => setForm({ ...form, esiNumber: event.target.value })} className={inputClass} maxLength={17} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={gross <= 0}>Save salary</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

/** Templates that split a monthly gross into components. */
export function SalaryStructureModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.payroll.manage']);
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/payroll/structures')).data.structures as Structure[], `structures-${version}`);
  const [form, setForm] = useState<(Omit<Structure, 'id'> & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      if (form.id) await api.put(`/finance-hub/payroll/structures/${form.id}`, form);
      else await api.post('/finance-hub/payroll/structures', form);
      toast.success('Structure saved.');
      setForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Salary structure" description="Component templates: fixed amounts, a % of monthly gross, and one component that takes the balance. Apply one when setting an employee's salary." actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ name: '', isActive: true, notes: '', components: [{ name: 'Basic', calc: 'PERCENT_OF_CTC', value: 50, pfWage: true }, { name: 'HRA', calc: 'PERCENT_OF_CTC', value: 20, pfWage: false }, { name: 'Special allowance', calc: 'BALANCE', value: 0, pfWage: false }] })}>Add structure</Button> : null}>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No structures yet" /> : (
        <div className="grid gap-3 p-3 md:grid-cols-2">
          {list.data.map((item) => (
            <div key={item.id} className={`rounded-lg border border-slate-200 p-3 ${item.isActive ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between"><p className="font-semibold">{item.name}</p>{canManage ? <Button variant="ghost" onClick={() => setForm(item)}>Edit</Button> : null}</div>
              <ul className="mt-2 space-y-1 text-[13px] text-slate-600">{item.components.map((component) => <li key={component.name}>{component.name}: {component.calc === 'FIXED' ? formatInr(component.value) : component.calc === 'BALANCE' ? 'balance' : `${component.value}% of gross`}{component.pfWage ? ' · PF wage' : ''}</li>)}</ul>
            </div>
          ))}
        </div>
      )}
      {form ? (
        <Modal title={form.id ? 'Edit structure' : 'Add structure'} onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={save} className="p-4">
            <Field label="Name *"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={80} required /></Field>
            <table className="mt-3 w-full text-[13px]">
              <thead className={tableHeadClass}><tr><th className="px-2 py-2">Component</th><th className="px-2 py-2">Calculated as</th><th className="px-2 py-2 text-right">Value</th><th className="px-2 py-2">PF</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {form.components.map((component, index) => {
                  const set = (patch: Partial<Structure['components'][number]>) => setForm({ ...form, components: form.components.map((row, at) => (at === index ? { ...row, ...patch } : row)) });
                  return (
                    <tr key={index}>
                      <td className="px-2 py-2"><input value={component.name} onChange={(event) => set({ name: event.target.value })} className={`${inputClass} py-2`} maxLength={60} /></td>
                      <td className="px-2 py-2"><select value={component.calc} onChange={(event) => set({ calc: event.target.value as Structure['components'][number]['calc'] })} className={`${inputClass} py-2`}><option value="PERCENT_OF_CTC">% of gross</option><option value="FIXED">Fixed ₹</option><option value="BALANCE">Balance</option></select></td>
                      <td className="w-28 px-2 py-2">{component.calc === 'BALANCE' ? <span className="text-xs text-slate-400">rest</span> : <input type="number" min={0} value={component.value} onChange={(event) => set({ value: Number(event.target.value) })} className={`${inputClass} py-2 text-right`} />}</td>
                      <td className="px-2 py-2"><input type="checkbox" checked={component.pfWage} onChange={(event) => set({ pfWage: event.target.checked })} className="h-4 w-4 accent-amber-500" /></td>
                      <td className="px-2 py-2">{form.components.length > 1 ? <button type="button" onClick={() => setForm({ ...form, components: form.components.filter((_, at) => at !== index) })} className="text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, components: [...form.components, { name: '', calc: 'FIXED', value: 0, pfWage: false }] })}>Add component</Button>
            <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-4 w-4 accent-amber-500" />Active</label>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.name.trim()}>Save</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

type Run = { id: string; month: string; status: 'DRAFT' | 'POSTED' | 'PAID' | 'CANCELLED'; payDate: string | null; totals: Partial<Totals>; voucherNumber: string | null; paymentVoucherNumber: string | null; createdAt: string };
type Totals = { employees: number; gross: number; employeePf: number; employeeEsi: number; professionalTax: number; tds: number; advanceRecovery: number; net: number; employerPf: number; employerEsi: number; cost: number };
type Payslip = { id: string; partyId: string; daysInMonth: number; paidDays: number; earnings: Array<Earning & { earned: number }>; additions: number; gross: number; pfWage: number; employeePf: number; employeeEsi: number; professionalTax: number; tds: number; advanceRecovery: number; net: number; employerPf: number; employerEsi: number; notes: string | null; party: { id: string; code: string; name: string; pan: string | null; bankName: string | null; bankAccountNumber: string | null; ifsc: string | null } | null; profile: { employeeCode: string | null; designation: string | null; department: string | null; uan: string | null; esiNumber: string | null; dateOfJoining: string | null } | null };
type RunDetail = Run & { voucherId: string | null; paymentVoucherId: string | null; totals: Totals; payslips: Payslip[] };
const runTone = { DRAFT: 'amber', POSTED: 'blue', PAID: 'green', CANCELLED: 'slate' } as const;

const escapeHtml = (value: string | null | undefined) => (value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const printPayslips = (run: RunDetail, slips: Payslip[]) => {
  const pages = slips.map((slip) => `<section class="slip"><div class="head"><div><h1>Payslip ${escapeHtml(run.month)}</h1><p>${escapeHtml(slip.party?.name)} · ${escapeHtml(slip.profile?.employeeCode ?? slip.party?.code)}</p><p class="muted">${escapeHtml(slip.profile?.designation)} ${slip.profile?.department ? `· ${escapeHtml(slip.profile.department)}` : ''}</p></div><div class="muted">PAN ${escapeHtml(slip.party?.pan ?? '—')}<br>UAN ${escapeHtml(slip.profile?.uan ?? '—')}<br>Paid days ${slip.paidDays} / ${slip.daysInMonth}</div></div>
<table><tr><th>Earnings</th><th class="n">Amount</th><th>Deductions</th><th class="n">Amount</th></tr>
${Array.from({ length: Math.max(slip.earnings.length + (slip.additions ? 1 : 0), 5) }).map((_, index) => {
    const earning = index < slip.earnings.length ? slip.earnings[index] : index === slip.earnings.length && slip.additions ? { name: 'Additions', earned: slip.additions } : null;
    const deductions: Array<[string, number]> = [['Provident fund', slip.employeePf], ['ESI', slip.employeeEsi], ['Professional tax', slip.professionalTax], ['Income tax (TDS)', slip.tds], ['Advance recovery', slip.advanceRecovery]];
    const deduction = deductions[index];
    return `<tr><td>${earning ? escapeHtml(earning.name) : ''}</td><td class="n">${earning ? formatInr(earning.earned) : ''}</td><td>${deduction ? deduction[0] : ''}</td><td class="n">${deduction ? formatInr(deduction[1]) : ''}</td></tr>`;
  }).join('')}
<tr class="total"><td>Gross</td><td class="n">${formatInr(slip.gross)}</td><td>Total deductions</td><td class="n">${formatInr(slip.gross - slip.net)}</td></tr></table>
<p class="net">Net pay ${formatInr(slip.net)}</p><p class="muted">Employer contributions: PF ${formatInr(slip.employerPf)} · ESI ${formatInr(slip.employerEsi)}. Computer-generated payslip.</p></section>`).join('');
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) { toast.error('Allow pop-ups to print payslips.'); return; }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payslips ${escapeHtml(run.month)}</title><style>body{font:12px system-ui,sans-serif;color:#0f172a;margin:24px}.slip{page-break-after:always;margin-bottom:32px}h1{font-size:16px;margin:0}.head{display:flex;justify-content:space-between;margin-bottom:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:6px;text-align:left}th{background:#f8fafc}.n{text-align:right}.total td{font-weight:700}.net{font-size:16px;font-weight:700}.muted{color:#64748b;margin:2px 0}</style></head><body>${pages}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
};

/** Monthly runs: prepare, adjust paid days, approve (posts), pay; bank transfer file. */
export function PayrollProcessingModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.payroll.manage']);
  const canApprove = access.can(['fh.approve']);
  const canPay = access.can(['fh.books.post']);
  const banks = useBanks();
  const [version, setVersion] = useState(0);
  const runs = useResource(async () => (await api.get('/finance-hub/payroll/runs')).data.runs as Run[], `payroll-runs-${version}`);
  const [openId, setOpenId] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [busy, setBusy] = useState(false);
  const refresh = () => setVersion((value) => value + 1);
  const create = async () => {
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/payroll/runs', { month })).data as { id: string };
      toast.success('Draft payroll created. Check paid days, then send for approval.');
      refresh();
      setOpenId(result.id);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not create the run.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Payroll processing" description="Prepare the month from salary profiles, adjust paid days (loss of pay), additions and TDS, then a checker approves — that posts the salary journal. Pay net salaries from the bank afterwards.">
      {canManage ? (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3">
          <Field label="Month"><input type="month" value={month} max={thisMonth()} onChange={(event) => setMonth(event.target.value)} className={inputClass} /></Field>
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} busy={busy} onClick={() => void create()}>Prepare payroll</Button>
        </div>
      ) : null}
      {runs.loading ? <LoadingState /> : runs.error ? <ErrorBanner message={runs.error} schemaMissing={runs.schemaMissing} /> : !runs.data?.length ? <EmptyState title="No payroll runs yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Month</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Employees</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Net pay</th><th className="px-3 py-2 text-right">Cost to company</th><th className="px-3 py-2">Vouchers</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {runs.data.map((run) => (
                <tr key={run.id} onClick={() => setOpenId(run.id)} className={`cursor-pointer hover:bg-amber-50/40 ${run.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                  <td className={`${cellClass} font-semibold`}>{run.month}</td>
                  <td className={cellClass}><Badge tone={runTone[run.status]}>{enumLabel(run.status)}</Badge></td>
                  <td className={`${cellClass} text-right`}>{run.totals.employees ?? '—'}</td>
                  <td className={`${cellClass} text-right`}>{run.totals.gross !== undefined ? formatInr(run.totals.gross) : '—'}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{run.totals.net !== undefined ? formatInr(run.totals.net) : '—'}</td>
                  <td className={`${cellClass} text-right`}>{run.totals.cost !== undefined ? formatInr(run.totals.cost) : '—'}</td>
                  <td className={`${cellClass} font-mono text-xs`}>{[run.voucherNumber, run.paymentVoucherNumber].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId ? <RunDetailModal id={openId} banks={banks} canManage={canManage} canApprove={canApprove} canPay={canPay} onClose={() => { setOpenId(null); refresh(); }} /> : null}
    </Panel>
  );
}

function RunDetailModal({ id, banks, canManage, canApprove, canPay, onClose }: { id: string; banks: Array<{ id: string; name: string }>; canManage: boolean; canApprove: boolean; canPay: boolean; onClose: () => void }) {
  const [version, setVersion] = useState(0);
  const detail = useResource(async () => (await api.get(`/finance-hub/payroll/runs/${id}`)).data as RunDetail, `payroll-run-${id}-${version}`);
  const [edits, setEdits] = useState<Record<string, { paidDays: string; additions: string; tds: string; advanceRecovery: string }>>({});
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState<{ bankAccountId: string; date: string; reference: string } | null>(null);
  const [openVoucher, setOpenVoucher] = useState<string | null>(null);
  const run = detail.data;
  const act = async (action: () => Promise<{ data: { number?: string } }>, success: string) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(result.data.number ? `${success} ${result.data.number}.` : success);
      setVersion((value) => value + 1);
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveSlip = async (slip: Payslip) => {
    const edit = edits[slip.id];
    if (!edit) return;
    const ok = await act(() => api.put(`/finance-hub/payroll/runs/${id}/payslips/${slip.id}`, edit), 'Payslip updated.');
    if (ok) setEdits((previous) => { const next = { ...previous }; delete next[slip.id]; return next; });
  };
  const bankFile = () => run && downloadCsv(`salary-transfer-${run.month}.csv`, ['Employee', 'Code', 'Bank', 'Account (last 4)', 'IFSC', 'Net pay'], run.payslips.filter((slip) => slip.net > 0).map((slip) => [slip.party?.name, slip.profile?.employeeCode ?? slip.party?.code, slip.party?.bankName, slip.party?.bankAccountNumber, slip.party?.ifsc, slip.net]));
  return (
    <Modal title={run ? `Payroll ${run.month}` : 'Payroll'} subtitle={run ? `${enumLabel(run.status)} · ${run.totals.employees} employees` : undefined} onClose={() => { if (!busy) onClose(); }} wide>
      {detail.loading ? <LoadingState /> : detail.error || !run ? <ErrorBanner message={detail.error || 'Not found.'} /> : (
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[['Gross', run.totals.gross], ['Deductions', run.totals.gross - run.totals.net], ['Net pay', run.totals.net], ['Employer PF + ESI', run.totals.employerPf + run.totals.employerEsi]].map(([label, value]) => <div key={label as string} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-[15px] font-semibold">{formatInr(value as number)}</p></div>)}
          </div>
          <div className="mt-3 max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[1100px] text-left text-xs">
              <thead className={tableHeadClass}><tr><th className="px-2 py-2">Employee</th><th className="px-2 py-2 text-right">Paid days</th><th className="px-2 py-2 text-right">Additions</th><th className="px-2 py-2 text-right">Gross</th><th className="px-2 py-2 text-right">PF</th><th className="px-2 py-2 text-right">ESI</th><th className="px-2 py-2 text-right">PT</th><th className="px-2 py-2 text-right">TDS</th><th className="px-2 py-2 text-right">Advance</th><th className="px-2 py-2 text-right">Net</th><th className="px-2 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {run.payslips.map((slip) => {
                  const edit = edits[slip.id];
                  const editable = run.status === 'DRAFT' && canManage;
                  const field = (key: 'paidDays' | 'additions' | 'tds' | 'advanceRecovery') => editable ? <input type="number" min={0} step={key === 'paidDays' ? 0.5 : 1} value={edit?.[key] ?? String(slip[key])} onChange={(event) => setEdits({ ...edits, [slip.id]: { ...(edits[slip.id] ?? { paidDays: String(slip.paidDays), additions: String(slip.additions), tds: String(slip.tds), advanceRecovery: String(slip.advanceRecovery) }), [key]: event.target.value } })} className={`${inputClass} w-20 px-2 py-1 text-right text-xs`} /> : key === 'paidDays' ? `${slip.paidDays}/${slip.daysInMonth}` : formatInr(slip[key]);
                  return (
                    <tr key={slip.id}>
                      <td className="px-2 py-2"><span className="font-semibold">{slip.party?.name}</span><span className="block text-slate-400">{slip.profile?.designation ?? ''}</span></td>
                      <td className="px-2 py-2 text-right">{field('paidDays')}</td>
                      <td className="px-2 py-2 text-right">{field('additions')}</td>
                      <td className="px-2 py-2 text-right font-semibold">{formatInr(slip.gross)}</td>
                      <td className="px-2 py-2 text-right">{formatInr(slip.employeePf)}</td>
                      <td className="px-2 py-2 text-right">{formatInr(slip.employeeEsi)}</td>
                      <td className="px-2 py-2 text-right">{formatInr(slip.professionalTax)}</td>
                      <td className="px-2 py-2 text-right">{field('tds')}</td>
                      <td className="px-2 py-2 text-right">{field('advanceRecovery')}</td>
                      <td className="px-2 py-2 text-right font-semibold">{formatInr(slip.net)}</td>
                      <td className="px-2 py-2 text-right">{edit ? <Button variant="primary" busy={busy} onClick={() => void saveSlip(slip)}>Save</Button> : <button type="button" onClick={() => printPayslips(run, [slip])} className="text-slate-400 hover:text-slate-900" aria-label="Print payslip"><Printer className="h-4 w-4" /></button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {run.status === 'DRAFT' && !canApprove ? <ReadOnlyNotice>A user with “Approve Finance Entries” (not the preparer) approves and posts the payroll.</ReadOnlyNotice> : null}
          <ModalFooter>
            {run.status === 'DRAFT' && canManage ? <><Button variant="danger" busy={busy} onClick={() => { if (window.confirm('Cancel this draft payroll?')) void act(() => api.post(`/finance-hub/payroll/runs/${id}/cancel`), 'Cancelled.'); }}>Cancel run</Button><Button icon={<RefreshCw className="h-4 w-4" />} busy={busy} onClick={() => void act(() => api.post(`/finance-hub/payroll/runs/${id}/recompute`), 'Recalculated from salary profiles.')}>Recalculate</Button></> : null}
            {run.status === 'DRAFT' && canApprove ? <Button variant="primary" busy={busy} disabled={Object.keys(edits).length > 0} onClick={() => { if (window.confirm(`Approve and post payroll for ${run.month}? Net pay ${formatInr(run.totals.net)}.`)) void act(() => api.post(`/finance-hub/payroll/runs/${id}/approve`), 'Posted:'); }}>Approve &amp; post</Button> : null}
            {run.status !== 'DRAFT' && run.status !== 'CANCELLED' ? <><Button icon={<Printer className="h-4 w-4" />} onClick={() => printPayslips(run, run.payslips)}>Print payslips</Button><Button icon={<Download className="h-4 w-4" />} onClick={bankFile}>Bank transfer list</Button></> : null}
            {run.voucherId ? <Button variant="ghost" onClick={() => setOpenVoucher(run.voucherId)}>Salary journal</Button> : null}
            {run.status === 'POSTED' && canPay ? <Button variant="primary" onClick={() => setPay({ bankAccountId: banks[0]?.id ?? '', date: todayIso(), reference: '' })}>Pay salaries</Button> : null}
          </ModalFooter>
          {pay ? (
            <div className="mt-2 grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-[2fr_160px_1fr_auto] md:items-end">
              <Field label="Paid from"><SearchableSelect buttonClassName={selectButtonClass} options={banks} value={pay.bankAccountId} onChange={(option) => setPay({ ...pay, bankAccountId: String(option.id) })} placeholder="Bank" /></Field>
              <Field label="Date"><input type="date" value={pay.date} onChange={(event) => setPay({ ...pay, date: event.target.value })} className={inputClass} /></Field>
              <Field label="Reference"><input value={pay.reference} onChange={(event) => setPay({ ...pay, reference: event.target.value })} className={inputClass} maxLength={80} /></Field>
              <Button variant="primary" busy={busy} disabled={!pay.bankAccountId} onClick={() => void act(() => api.post(`/finance-hub/payroll/runs/${id}/pay`, pay), 'Paid:').then((ok) => { if (ok) setPay(null); })}>Pay {formatInr(run.totals.net)}</Button>
            </div>
          ) : null}
        </div>
      )}
      {openVoucher ? <VoucherDetail key={openVoucher} voucherId={openVoucher} onClose={() => setOpenVoucher(null)} onChanged={() => setVersion((value) => value + 1)} onOpen={setOpenVoucher} onEdit={() => setOpenVoucher(null)} /> : null}
    </Modal>
  );
}

type Advance = { id: string; partyId: string; date: string; amount: number; monthlyRecovery: number; isActive: boolean; notes: string | null; party: { name: string } | null; employeeBalance: number; voucherNumber: string | null };

/** Salary advances paid from the bank and recovered through payroll. */
export function AdvancesDeductionsModule() {
  const access = useFinanceWorkspaceAccess();
  const canPay = access.can(['fh.books.post']);
  const canManage = access.can(['fh.payroll.manage']);
  const banks = useBanks();
  const employees = useResource(async () => (await api.get('/finance-hub/payroll/employees')).data.employees as Employee[], 'advance-employees');
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/payroll/advances')).data.advances as Advance[], `advances-${version}`);
  const [form, setForm] = useState<{ partyId: string; amount: string; monthlyRecovery: string; bankAccountId: string; date: string; notes: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/payroll/advances', form)).data as { number: string };
      toast.success(`Advance paid (${result.number}); payroll will recover it.`);
      setForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not record the advance.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Advances & deductions" description="Salary advances and loans: paid from the bank to Employee Advances, recovered each month in payroll (never more than the net pay). Statutory deductions are set on each salary profile." actions={canPay ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ partyId: '', amount: '', monthlyRecovery: '', bankAccountId: banks[0]?.id ?? '', date: todayIso(), notes: '' })}>Give advance</Button> : null}>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No advances" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Employee</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Per month</th><th className="px-3 py-2 text-right">Employee balance</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((item) => (
                <tr key={item.id}>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(item.date)}<span className="block font-mono text-[11px] text-slate-400">{item.voucherNumber}</span></td>
                  <td className={`${cellClass} font-semibold`}>{item.party?.name}{item.notes ? <span className="block text-xs font-normal text-slate-500">{item.notes}</span> : null}</td>
                  <td className={`${cellClass} text-right`}>{formatInr(item.amount)}</td>
                  <td className={`${cellClass} text-right`}>{formatInr(item.monthlyRecovery)}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(item.employeeBalance)}</td>
                  <td className={cellClass}><Badge tone={item.isActive && item.employeeBalance > 0 ? 'amber' : 'green'}>{item.isActive && item.employeeBalance > 0 ? 'Recovering' : 'Closed'}</Badge></td>
                  <td className={`${cellClass} text-right`}>{item.isActive && canManage ? <Button variant="ghost" onClick={() => { if (window.confirm('Stop recovering this advance in payroll?')) void api.post(`/finance-hub/payroll/advances/${item.id}/close`).then(() => setVersion((value) => value + 1)); }}>Stop</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title="Give salary advance" onClose={() => { if (!busy) setForm(null); }}>
          <form onSubmit={save} className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Employee *" wide><SearchableSelect buttonClassName={selectButtonClass} options={(employees.data ?? []).map((row) => ({ id: row.party.id, name: row.party.name }))} value={form.partyId} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="Employee" /></Field>
              <Field label="Amount *"><input type="number" min={0} value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={inputClass} required /></Field>
              <Field label="Recover per month *"><input type="number" min={0} value={form.monthlyRecovery} onChange={(event) => setForm({ ...form, monthlyRecovery: event.target.value })} className={inputClass} required /></Field>
              <Field label="Paid from *"><SearchableSelect buttonClassName={selectButtonClass} options={banks} value={form.bankAccountId} onChange={(option) => setForm({ ...form, bankAccountId: String(option.id) })} placeholder="Bank / cash" /></Field>
              <Field label="Date *"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} required /></Field>
              <Field label="Notes" wide><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={inputClass} maxLength={1000} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.partyId || !(Number(form.amount) > 0) || !(Number(form.monthlyRecovery) > 0) || !form.bankAccountId}>Pay advance</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}

/** Payslips of a posted month: view and print (save as PDF). */
/** Salary register for one payroll month: every payslip with its deductions and employer cost. */
const salaryRegisterCsv = (run: RunDetail) => downloadCsv(
  `salary-register-${run.month}.csv`,
  ['Employee', 'Code', 'PAN', 'Paid days', 'Days in month', 'Gross', 'Employee PF', 'Employee ESI', 'Professional tax', 'TDS', 'Advance recovery', 'Net pay', 'Employer PF', 'Employer ESI'],
  run.payslips.map((slip) => [slip.party?.name, slip.party?.code, slip.party?.pan, slip.paidDays, slip.daysInMonth, slip.gross, slip.employeePf, slip.employeeEsi, slip.professionalTax, slip.tds, slip.advanceRecovery, slip.net, slip.employerPf, slip.employerEsi]),
);

export function PayslipsModule() {
  const runs = useResource(async () => ((await api.get('/finance-hub/payroll/runs')).data.runs as Run[]).filter((run) => run.status === 'POSTED' || run.status === 'PAID'), 'payslip-runs');
  const [runId, setRunId] = useState('');
  const chosen = runId || runs.data?.[0]?.id || '';
  const detail = useResource(async () => (chosen ? (await api.get(`/finance-hub/payroll/runs/${chosen}`)).data as RunDetail : null), `payslips-${chosen}`);
  return (
    <Panel title="Payslips" description="Payslips of approved payroll months. Print one or all; the browser's print dialog saves them as PDF. Export gives the month's salary register." actions={detail.data ? <><Button icon={<FileSpreadsheet />} onClick={() => salaryRegisterCsv(detail.data!)}>Export register</Button><Button icon={<Printer className="h-4 w-4" />} onClick={() => printPayslips(detail.data!, detail.data!.payslips)}>Print all</Button></> : null}>
      <div className="border-b border-slate-100 p-3"><Field label="Month"><select value={chosen} onChange={(event) => setRunId(event.target.value)} className={`${inputClass} max-w-xs`}>{(runs.data ?? []).map((run) => <option key={run.id} value={run.id}>{run.month} · {enumLabel(run.status)}</option>)}</select></Field></div>
      {runs.loading || detail.loading ? <LoadingState /> : !chosen ? <EmptyState title="No approved payroll yet" /> : detail.error || !detail.data ? <ErrorBanner message={detail.error || 'Could not load.'} /> : (
        <div className="grid gap-3 p-3 md:grid-cols-2 lg:grid-cols-3">
          {detail.data.payslips.map((slip) => (
            <div key={slip.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between"><div><p className="font-semibold">{slip.party?.name}</p><p className="text-xs text-slate-500">{[slip.profile?.designation, `${slip.paidDays}/${slip.daysInMonth} days`].filter(Boolean).join(' · ')}</p></div><button type="button" onClick={() => printPayslips(detail.data!, [slip])} className="text-slate-400 hover:text-slate-900" aria-label="Print"><Printer className="h-4 w-4" /></button></div>
              <p className="mt-2 text-[13px]">Gross {formatInr(slip.gross)} · Deductions {formatInr(slip.gross - slip.net)}</p>
              <p className="text-[15px] font-semibold">Net {formatInr(slip.net)}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

type Statutory = { month: string; run: { id: string; status: string } | null; pf: Array<{ partyId: string; uan: string | null; name: string; grossWages: number; epfWages: number; epsWages: number; edliWages: number; epfContribution: number; epsContribution: number; epfEpsDifference: number; ncpDays: number }>; esi: Array<{ partyId: string; ipNumber: string | null; name: string; days: number; wages: number; employee: number; employer: number }>; pt: Array<{ state: string; employees: number; amount: number }>; totals: { pf: number; esi: number; pt: number; tds: number } | null };
type StatTab = 'summary' | 'challans';

/** PF (ECR), ESI and PT for a payroll month, and their challans. */
export function StatutoryContributionsModule() {
  const [tab, setTab] = useState<StatTab>('summary');
  const [month, setMonth] = useState(thisMonth());
  const data = useResource(async () => (await api.get('/finance-hub/payroll/statutory', { params: { month } })).data as Statutory, `statutory-${month}`);
  const ecr = () => {
    if (!data.data) return;
    const text = data.data.pf.map((row) => [row.uan ?? '', row.name, Math.round(row.grossWages), Math.round(row.epfWages), Math.round(row.epsWages), Math.round(row.edliWages), row.epfContribution, row.epsContribution, row.epfEpsDifference, row.ncpDays, 0].join('#~#')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ECR-${month}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-3">
      <Panel><Tabs<StatTab> tabs={[{ key: 'summary', label: 'PF / ESI / PT' }, { key: 'challans', label: 'Challans' }]} active={tab} onChange={setTab} /></Panel>
      {tab === 'challans' ? <ChallansModule fixedTypes={['PF', 'ESI', 'PROFESSIONAL_TAX', 'TDS']} /> : (
        <Panel title="Statutory contributions" description="From the approved payroll. PF and ESI are due by the 15th of the next month; upload the ECR file on the EPFO portal and the ESI sheet on ESIC, then record the challans." actions={data.data?.pf.length ? <><Button icon={<Download className="h-4 w-4" />} onClick={ecr}>PF ECR file</Button><Button icon={<Download className="h-4 w-4" />} disabled={!data.data.esi.length} onClick={() => downloadCsv(`ESI-${month}.csv`, ['IP number', 'Name', 'Days', 'Wages', 'Employee', 'Employer'], data.data!.esi.map((row) => [row.ipNumber, row.name, row.days, row.wages, row.employee, row.employer]))}>ESI sheet</Button></> : null}>
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-3"><Field label="Month"><input type="month" value={month} max={thisMonth()} onChange={(event) => setMonth(event.target.value)} className={inputClass} /></Field></div>
          {data.loading ? <LoadingState /> : data.error || !data.data ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : !data.data.run ? <EmptyState title="No approved payroll for this month" /> : (
            <>
              <div className="grid gap-3 p-3 sm:grid-cols-4">
                {[['PF payable', data.data.totals?.pf], ['ESI payable', data.data.totals?.esi], ['Professional tax', data.data.totals?.pt], ['TDS on salary', data.data.totals?.tds]].map(([label, value]) => <div key={label as string} className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p><p className="text-[15px] font-semibold">{formatInr(value as number)}</p></div>)}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-left text-xs">
                  <thead className={tableHeadClass}><tr><th className="px-3 py-2">UAN</th><th className="px-3 py-2">Name</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">EPF wages</th><th className="px-3 py-2 text-right">EPS wages</th><th className="px-3 py-2 text-right">EPF (12%)</th><th className="px-3 py-2 text-right">EPS (8.33%)</th><th className="px-3 py-2 text-right">EPF − EPS</th><th className="px-3 py-2 text-right">NCP days</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{data.data.pf.map((row) => <tr key={row.partyId}><td className="px-3 py-2 font-mono">{row.uan ?? <span className="text-red-600">missing</span>}</td><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2 text-right">{formatInr(row.grossWages)}</td><td className="px-3 py-2 text-right">{formatInr(row.epfWages)}</td><td className="px-3 py-2 text-right">{formatInr(row.epsWages)}</td><td className="px-3 py-2 text-right">{formatInr(row.epfContribution)}</td><td className="px-3 py-2 text-right">{formatInr(row.epsContribution)}</td><td className="px-3 py-2 text-right">{formatInr(row.epfEpsDifference)}</td><td className="px-3 py-2 text-right">{row.ncpDays}</td></tr>)}</tbody>
                </table>
              </div>
              {data.data.pt.length ? <p className="px-3 py-2 text-[13px]">Professional tax: {data.data.pt.map((row) => `state ${row.state}: ${row.employees} employees, ${formatInr(row.amount)}`).join(' · ')}</p> : null}
            </>
          )}
        </Panel>
      )}
    </div>
  );
}

type Fnf = { id: string; partyId: string; lastWorkingDay: string; items: Array<{ code: string; label: string; amount: number }>; tds: number; advanceRecovery: number; net: number; status: 'DRAFT' | 'POSTED' | 'PAID'; party: { name: string } | null; voucherNumber: string | null; paymentVoucherNumber: string | null };
const FNF_CODES: Array<[string, string]> = [['SALARY', 'Salary for days worked'], ['LEAVE_ENCASHMENT', 'Leave encashment'], ['GRATUITY', 'Gratuity'], ['BONUS', 'Bonus'], ['OTHER_EARNING', 'Other earning'], ['NOTICE_RECOVERY', 'Notice period recovery'], ['OTHER_RECOVERY', 'Other recovery']];

/** Exit settlement: dues, gratuity, leave, recoveries; approval posts it and closes the salary profile. */
export function FullFinalModule() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.payroll.manage']);
  const canApprove = access.can(['fh.approve']);
  const canPay = access.can(['fh.books.post']);
  const banks = useBanks();
  const employees = useResource(async () => (await api.get('/finance-hub/payroll/employees')).data.employees as Employee[], 'fnf-employees');
  const [version, setVersion] = useState(0);
  const list = useResource(async () => (await api.get('/finance-hub/payroll/full-final')).data.settlements as Fnf[], `fnf-${version}`);
  const [form, setForm] = useState<{ partyId: string; lastWorkingDay: string; tds: string; notes: string; items: Array<{ code: string; label: string; amount: string }> } | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = employees.data?.find((row) => row.party.id === form?.partyId);
  const basic = chosen?.salary?.earnings.find((item) => item.pfWage)?.amount ?? chosen?.salary?.earnings[0]?.amount ?? 0;
  const years = (() => {
    if (!chosen?.salary?.dateOfJoining || !form?.lastWorkingDay) return 0;
    const months = (new Date(form.lastWorkingDay).getTime() - new Date(chosen.salary.dateOfJoining).getTime()) / (30.44 * 86400000);
    return Math.floor(months / 12) + (months % 12 > 6 ? 1 : 0);
  })();
  const suggestedGratuity = years >= 5 ? Math.round((15 / 26) * basic * years) : 0;
  const run = async (action: () => Promise<{ data: { number?: string } }>, success: string) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(result.data.number ? `${success} ${result.data.number}.` : success);
      setVersion((value) => value + 1);
      return true;
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Full & final settlement" description="When an employee leaves: salary for the last days, leave encashment, gratuity (after 5 years: 15/26 × last basic × years), bonus, less notice recovery, TDS and any advance. Approval posts it and takes the employee off payroll." actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ partyId: '', lastWorkingDay: todayIso(), tds: '', notes: '', items: [{ code: 'SALARY', label: 'Salary for days worked', amount: '' }, { code: 'LEAVE_ENCASHMENT', label: 'Leave encashment', amount: '' }] })}>New settlement</Button> : null}>
      {list.loading ? <LoadingState /> : list.error ? <ErrorBanner message={list.error} schemaMissing={list.schemaMissing} /> : !list.data?.length ? <EmptyState title="No settlements" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className={tableHeadClass}><tr><th className="px-3 py-2">Employee</th><th className="px-3 py-2">Last day</th><th className="px-3 py-2">Items</th><th className="px-3 py-2 text-right">Net payable</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {list.data.map((item) => (
                <tr key={item.id}>
                  <td className={`${cellClass} font-semibold`}>{item.party?.name}</td>
                  <td className={`${cellClass} whitespace-nowrap`}>{formatDate(item.lastWorkingDay)}</td>
                  <td className={`${cellClass} text-xs`}>{item.items.map((row) => `${row.label} ${formatInr(row.amount)}`).join(' · ')}{item.advanceRecovery ? ` · advance −${formatInr(item.advanceRecovery)}` : ''}{item.tds ? ` · TDS −${formatInr(item.tds)}` : ''}</td>
                  <td className={`${cellClass} text-right font-semibold`}>{formatInr(item.net)}</td>
                  <td className={cellClass}><Badge tone={item.status === 'PAID' ? 'green' : item.status === 'POSTED' ? 'blue' : 'amber'}>{enumLabel(item.status)}</Badge><span className="block font-mono text-[11px] text-slate-400">{[item.voucherNumber, item.paymentVoucherNumber].filter(Boolean).join(' · ')}</span></td>
                  <td className={`${cellClass} whitespace-nowrap text-right`}>
                    {item.status === 'DRAFT' && canApprove ? <Button variant="primary" busy={busy} onClick={() => void run(() => api.post(`/finance-hub/payroll/full-final/${item.id}/post`), 'Posted:')}>Approve &amp; post</Button> : null}
                    {item.status === 'POSTED' && canPay ? <Button variant="primary" busy={busy} disabled={!banks.length} onClick={() => { const bankAccountId = banks[0]?.id; if (bankAccountId && window.confirm(`Pay ${formatInr(item.net)} from ${banks[0]!.name}?`)) void run(() => api.post(`/finance-hub/payroll/full-final/${item.id}/pay`, { bankAccountId }), 'Paid:'); }}>Pay</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form ? (
        <Modal title="New full & final settlement" onClose={() => { if (!busy) setForm(null); }} wide>
          <form onSubmit={(event) => { event.preventDefault(); void run(() => api.post('/finance-hub/payroll/full-final', { ...form, tds: form.tds || null, items: form.items.map((item) => ({ ...item, amount: Number(item.amount) || 0 })) }), 'Settlement drafted for approval.').then((ok) => { if (ok) setForm(null); }); }} className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Employee *"><SearchableSelect buttonClassName={selectButtonClass} options={(employees.data ?? []).filter((row) => row.salary?.isActive).map((row) => ({ id: row.party.id, name: row.party.name }))} value={form.partyId} onChange={(option) => setForm({ ...form, partyId: String(option.id) })} placeholder="Employee on payroll" /></Field>
              <Field label="Last working day *"><input type="date" value={form.lastWorkingDay} onChange={(event) => setForm({ ...form, lastWorkingDay: event.target.value })} className={inputClass} required /></Field>
              <Field label="TDS"><input type="number" min={0} value={form.tds} onChange={(event) => setForm({ ...form, tds: event.target.value })} className={inputClass} /></Field>
            </div>
            {chosen ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Basic {formatInr(basic)} · joined {formatDate(chosen.salary?.dateOfJoining)} · {years} completed years · gratuity {years >= 5 ? formatInr(suggestedGratuity) : 'not due (< 5 years)'} · leave encashment per day {formatInr(Math.round(basic / 26))} · advance to recover {formatInr(chosen.advanceBalance)} (deducted automatically)</p> : null}
            <table className="mt-3 w-full text-[13px]">
              <tbody className="divide-y divide-slate-100">
                {form.items.map((item, index) => (
                  <tr key={index}>
                    <td className="py-2 pr-2"><select value={item.code} onChange={(event) => setForm({ ...form, items: form.items.map((row, at) => (at === index ? { ...row, code: event.target.value, label: FNF_CODES.find(([code]) => code === event.target.value)?.[1] ?? row.label } : row)) })} className={`${inputClass} py-2`}>{FNF_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></td>
                    <td className="py-2 pr-2"><input value={item.label} onChange={(event) => setForm({ ...form, items: form.items.map((row, at) => (at === index ? { ...row, label: event.target.value } : row)) })} className={`${inputClass} py-2`} maxLength={80} /></td>
                    <td className="w-40 py-2 pr-2"><input type="number" min={0} value={item.amount} onChange={(event) => setForm({ ...form, items: form.items.map((row, at) => (at === index ? { ...row, amount: event.target.value } : row)) })} className={`${inputClass} py-2 text-right`} placeholder={item.code === 'GRATUITY' && suggestedGratuity ? String(suggestedGratuity) : ''} /></td>
                    <td className="py-2"><button type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, at) => at !== index) })} className="text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, items: [...form.items, { code: 'GRATUITY', label: 'Gratuity', amount: suggestedGratuity ? String(suggestedGratuity) : '' }] })}>Add item</Button>
            <p className="mt-2 text-xs text-slate-500">Recoveries (notice, other) are entered as positive numbers and deducted.</p>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!form.partyId || !form.items.some((item) => Number(item.amount) > 0)}>Save for approval</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
