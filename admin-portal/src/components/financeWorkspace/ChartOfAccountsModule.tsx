'use client';

import { FormEvent, useMemo, useState } from 'react';
import { ChevronRight, FolderPlus, ListPlus, Search, Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, enumLabel, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, Toggle } from './ui';
import { useResource } from './useResource';

type Nature = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type AccountGroup = { id: string; code: string; name: string; nature: Nature; parentId: string | null; isSystem: boolean; reportLine: string | null; sortOrder: number };
export type Account = {
  id: string; code: string; name: string; groupId: string; kind: string; normalBalance: 'DR' | 'CR'; systemKey: string | null; isSystem: boolean; isActive: boolean;
  allowManualPosting: boolean; requiresParty: boolean; requiresVehicle: boolean; requiresCostCentre: boolean; gstApplicable: boolean; defaultGstRate: string | null;
  hsnSac: string | null; tdsSection: string | null; tallyName: string | null; description: string | null; bankAccount: { id: string; type: string } | null;
};
export type Chart = { groups: AccountGroup[]; accounts: Account[]; installed: boolean };

export const loadChart = async () => (await api.get('/finance-hub/chart-of-accounts')).data as Chart;

type InstallSummary = { dryRun: boolean; groupsToCreate: string[]; accountsToCreate: string[]; categoryMapsToCreate: string[]; conflicts: string[]; existingAccounts: number };

const NATURES: Nature[] = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'];
const LEDGER_KINDS = ['GENERAL', 'PARTY_CONTROL', 'STOCK', 'TAX', 'FIXED_ASSET', 'ACCUMULATED_DEPRECIATION', 'PREPAID', 'SUSPENSE', 'CLEARING', 'ROUND_OFF', 'EQUITY'];
const natureTone = { ASSET: 'blue', LIABILITY: 'violet', EQUITY: 'slate', INCOME: 'green', EXPENSE: 'amber' } as const;

type GroupForm = { id?: string; code: string; name: string; nature: Nature; parentId: string; reportLine: string; isSystem?: boolean };
type AccountForm = {
  id?: string; code: string; name: string; groupId: string; kind: string; normalBalance: '' | 'DR' | 'CR'; isSystem?: boolean; hasBank?: boolean;
  allowManualPosting: boolean; requiresParty: boolean; requiresVehicle: boolean; requiresCostCentre: boolean; gstApplicable: boolean; defaultGstRate: string;
  hsnSac: string; tdsSection: string; tallyName: string; description: string; isActive: boolean;
};

const emptyAccount = (groupId = ''): AccountForm => ({
  code: '', name: '', groupId, kind: 'GENERAL', normalBalance: '', allowManualPosting: true, requiresParty: false, requiresVehicle: false,
  requiresCostCentre: false, gstApplicable: false, defaultGstRate: '', hsnSac: '', tdsSection: '', tallyName: '', description: '', isActive: true,
});

export default function ChartOfAccountsModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.settings.manage']);
  const chart = useResource(loadChart, 'chart');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [install, setInstall] = useState<InstallSummary | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => chart.data?.groups ?? [], [chart.data]);
  const accounts = useMemo(() => chart.data?.accounts ?? [], [chart.data]);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (account: Account) =>
    (showInactive || account.isActive) && (!normalizedQuery || `${account.code} ${account.name} ${account.systemKey ?? ''}`.toLowerCase().includes(normalizedQuery));

  const childGroups = (parentId: string | null) => groups.filter((group) => group.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const groupHasMatch = (groupId: string): boolean =>
    accounts.some((account) => account.groupId === groupId && matches(account)) || childGroups(groupId).some((child) => groupHasMatch(child.id));

  const previewInstall = async () => {
    setBusy(true);
    try {
      setInstall((await api.post('/finance-hub/chart-of-accounts/install-defaults', { dryRun: true })).data);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not preview the default chart.'));
    } finally {
      setBusy(false);
    }
  };

  const applyInstall = async () => {
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/chart-of-accounts/install-defaults', { dryRun: false })).data as InstallSummary;
      toast.success(`Installed ${result.groupsToCreate.length} groups and ${result.accountsToCreate.length} ledgers.`);
      setInstall(null);
      chart.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not install the default chart.'));
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupForm) return;
    setBusy(true);
    try {
      const payload = { code: groupForm.code, name: groupForm.name, nature: groupForm.nature, parentId: groupForm.parentId || null, reportLine: groupForm.reportLine || null };
      if (groupForm.id) await api.put(`/finance-hub/account-groups/${groupForm.id}`, { name: payload.name, reportLine: payload.reportLine, ...(groupForm.isSystem ? {} : { parentId: payload.parentId }) });
      else await api.post('/finance-hub/account-groups', payload);
      toast.success('Group saved.');
      setGroupForm(null);
      chart.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the group.'));
    } finally {
      setBusy(false);
    }
  };

  const saveAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!accountForm) return;
    setBusy(true);
    const { id, isSystem, hasBank, normalBalance, ...rest } = accountForm;
    const payload = {
      ...rest,
      ...(normalBalance ? { normalBalance } : {}),
      defaultGstRate: rest.gstApplicable ? rest.defaultGstRate : null,
      hsnSac: rest.hsnSac || null,
      tdsSection: rest.tdsSection || null,
      tallyName: rest.tallyName || null,
      description: rest.description || null,
    };
    try {
      if (id) {
        const { code, kind, ...editable } = payload;
        void code; void kind;
        const update: Record<string, unknown> = { ...editable };
        if (isSystem) { delete update.allowManualPosting; delete update.isActive; delete update.groupId; }
        if (hasBank) delete update.isActive;
        await api.put(`/finance-hub/accounts/${id}`, update);
      } else {
        await api.post('/finance-hub/accounts', payload);
      }
      toast.success('Ledger saved.');
      setAccountForm(null);
      chart.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the ledger.'));
    } finally {
      setBusy(false);
    }
  };

  const editAccount = (account: Account) => setAccountForm({
    id: account.id, code: account.code, name: account.name, groupId: account.groupId, kind: account.kind, normalBalance: account.normalBalance,
    isSystem: account.isSystem, hasBank: Boolean(account.bankAccount), allowManualPosting: account.allowManualPosting, requiresParty: account.requiresParty,
    requiresVehicle: account.requiresVehicle, requiresCostCentre: account.requiresCostCentre, gstApplicable: account.gstApplicable,
    defaultGstRate: account.defaultGstRate ?? '', hsnSac: account.hsnSac ?? '', tdsSection: account.tdsSection ?? '', tallyName: account.tallyName ?? '',
    description: account.description ?? '', isActive: account.isActive,
  });

  const renderGroup = (group: AccountGroup, depth: number) => {
    if (normalizedQuery && !groupHasMatch(group.id)) return null;
    const isCollapsed = collapsed.has(group.id) && !normalizedQuery;
    const groupAccounts = accounts.filter((account) => account.groupId === group.id && matches(account));
    return (
      <div key={group.id}>
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2" style={{ paddingLeft: 16 + depth * 20 }}>
          <button type="button" onClick={() => setCollapsed((previous) => { const next = new Set(previous); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next; })} className="rounded p-0.5 text-slate-400 hover:bg-slate-200" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
            <ChevronRight className={`h-4 w-4 transition ${isCollapsed ? '' : 'rotate-90'}`} />
          </button>
          <span className="font-mono text-xs text-slate-500">{group.code}</span>
          <span className="text-[13px] font-semibold text-slate-800">{group.name}</span>
          {depth === 0 ? <Badge tone={natureTone[group.nature]}>{enumLabel(group.nature)}</Badge> : null}
          {group.reportLine ? <span className="hidden text-[11px] text-slate-400 md:inline">→ {group.reportLine}</span> : null}
          {canManage ? (
            <span className="ml-auto flex gap-1">
              <Button variant="ghost" onClick={() => setAccountForm(emptyAccount(group.id))}>+ Ledger</Button>
              <Button variant="ghost" onClick={() => setGroupForm({ id: group.id, code: group.code, name: group.name, nature: group.nature, parentId: group.parentId ?? '', reportLine: group.reportLine ?? '', isSystem: group.isSystem })}>Edit</Button>
            </span>
          ) : null}
        </div>
        {isCollapsed ? null : (
          <>
            {groupAccounts.map((account) => (
              <div key={account.id} className={`flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-[13px] ${account.isActive ? '' : 'opacity-50'}`} style={{ paddingLeft: 44 + depth * 20 }}>
                <span className="w-12 font-mono text-xs text-slate-500">{account.code}</span>
                <span className="font-medium text-slate-900">{account.name}</span>
                <span className="text-[11px] text-slate-400">{account.normalBalance}</span>
                {account.kind !== 'GENERAL' ? <Badge>{enumLabel(account.kind)}</Badge> : null}
                {account.isSystem ? <Badge tone="violet">System</Badge> : null}
                {account.requiresParty ? <Badge tone="blue">Party</Badge> : null}
                {account.requiresVehicle ? <Badge tone="amber">Vehicle</Badge> : null}
                {account.gstApplicable ? <Badge tone="green">GST {account.defaultGstRate ? `${Number(account.defaultGstRate)}%` : ''}</Badge> : null}
                {!account.allowManualPosting ? <Badge>Auto only</Badge> : null}
                {!account.isActive ? <Badge tone="red">Inactive</Badge> : null}
                {canManage ? <span className="ml-auto"><Button variant="ghost" onClick={() => editAccount(account)}>Edit</Button></span> : null}
              </div>
            ))}
            {childGroups(group.id).map((child) => renderGroup(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  if (chart.loading) return <Panel><LoadingState /></Panel>;
  if (chart.error) return <Panel><ErrorBanner message={chart.error} schemaMissing={chart.schemaMissing} /></Panel>;

  const selectableKinds = accountForm?.id ? Array.from(new Set([...LEDGER_KINDS, accountForm.kind])) : LEDGER_KINDS;

  return (
    <Panel
      title="Chart of accounts"
      description="Groups map to Balance Sheet / P&L lines. System ledgers are used by automatic posting — rename them freely, they keep their role."
      actions={canManage ? (
        <>
          <Button icon={<Sparkles className="h-4 w-4" />} busy={busy && !install} onClick={previewInstall}>{chart.data?.installed ? 'Add missing defaults' : 'Install default chart'}</Button>
          <Button icon={<FolderPlus className="h-4 w-4" />} onClick={() => setGroupForm({ code: '', name: '', nature: 'EXPENSE', parentId: '', reportLine: '' })}>Add group</Button>
          <Button variant="primary" icon={<ListPlus className="h-4 w-4" />} onClick={() => setAccountForm(emptyAccount(groups[0]?.id))} disabled={!groups.length}>Add ledger</Button>
        </>
      ) : null}
    >
      {!canManage ? <ReadOnlyNotice>Editing the chart needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
      {!chart.data?.installed ? (
        <EmptyState title="No chart of accounts yet" description="Install the default chart built for a used-equipment dealer: vehicle stock, debtors/creditors, GST input/output, TDS, payroll, clearing accounts and income/expense heads. You can preview it first; nothing is created until you confirm." action={canManage ? <Button variant="primary" busy={busy} onClick={previewInstall}>Preview default chart</Button> : undefined} />
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search code, ledger or system key…" className={`${inputClass} pl-9`} />
            </div>
            <Toggle checked={showInactive} onChange={setShowInactive} label="Show inactive" />
            <span className="text-xs text-slate-500">{groups.length} groups · {accounts.length} ledgers</span>
          </div>
          <div>{childGroups(null).map((group) => renderGroup(group, 0))}</div>
        </>
      )}

      {install ? (
        <Modal title={install.dryRun ? 'Default chart preview' : 'Installed'} subtitle="Existing groups and ledgers are never changed. Only missing ones are added." onClose={() => { if (!busy) setInstall(null); }} wide>
          <div className="p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Groups to add</p><p className="text-[18px] font-semibold text-slate-900">{install.groupsToCreate.length}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Ledgers to add</p><p className="text-[18px] font-semibold text-slate-900">{install.accountsToCreate.length}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">Old category mappings</p><p className="text-[18px] font-semibold text-slate-900">{install.categoryMapsToCreate.length}</p></div>
            </div>
            {install.conflicts.length ? <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{install.conflicts.map((item) => <p key={item}>{item}</p>)}</div> : null}
            <div className="mt-3 grid max-h-72 gap-3 overflow-y-auto text-xs text-slate-600 md:grid-cols-2">
              <div><p className="mb-1 font-semibold text-slate-800">Ledgers</p>{install.accountsToCreate.map((item) => <p key={item}>{item}</p>)}</div>
              <div><p className="mb-1 font-semibold text-slate-800">Groups</p>{install.groupsToCreate.map((item) => <p key={item}>{item}</p>)}<p className="mb-1 mt-3 font-semibold text-slate-800">Expense categories → ledger</p>{install.categoryMapsToCreate.map((item) => <p key={item}>{item}</p>)}</div>
            </div>
            <ModalFooter>
              <Button onClick={() => setInstall(null)} disabled={busy}>Close</Button>
              {install.dryRun && (install.groupsToCreate.length || install.accountsToCreate.length || install.categoryMapsToCreate.length) ? <Button variant="primary" busy={busy} onClick={applyInstall}>Install now</Button> : null}
            </ModalFooter>
          </div>
        </Modal>
      ) : null}

      {groupForm ? (
        <Modal title={groupForm.id ? `Edit group ${groupForm.code}` : 'Add account group'} onClose={() => { if (!busy) setGroupForm(null); }}>
          <form onSubmit={saveGroup} className="grid gap-3 p-4 md:grid-cols-2">
            <Field label="Code *"><input value={groupForm.code} disabled={Boolean(groupForm.id)} onChange={(event) => setGroupForm({ ...groupForm, code: event.target.value.toUpperCase() })} className={`${inputClass} font-mono`} maxLength={12} required /></Field>
            <Field label="Name *"><input value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} className={inputClass} maxLength={120} required /></Field>
            <Field label="Nature *">
              <select value={groupForm.nature} disabled={Boolean(groupForm.id)} onChange={(event) => setGroupForm({ ...groupForm, nature: event.target.value as Nature, parentId: '' })} className={inputClass}>
                {NATURES.map((nature) => <option key={nature} value={nature}>{enumLabel(nature)}</option>)}
              </select>
            </Field>
            <Field label="Parent group" hint={groupForm.isSystem ? 'Built-in groups keep their position.' : undefined}>
              <select value={groupForm.parentId} disabled={groupForm.isSystem} onChange={(event) => setGroupForm({ ...groupForm, parentId: event.target.value })} className={inputClass}>
                <option value="">Top level</option>
                {groups.filter((group) => group.nature === groupForm.nature && group.id !== groupForm.id).map((group) => <option key={group.id} value={group.id}>{group.code} · {group.name}</option>)}
              </select>
            </Field>
            <Field label="Report line" wide hint="Balance Sheet / P&L line this group rolls into, e.g. “Trade Receivables”."><input value={groupForm.reportLine} onChange={(event) => setGroupForm({ ...groupForm, reportLine: event.target.value })} className={inputClass} maxLength={80} /></Field>
            <div className="md:col-span-2"><ModalFooter><Button onClick={() => setGroupForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save group</Button></ModalFooter></div>
          </form>
        </Modal>
      ) : null}

      {accountForm ? (
        <Modal title={accountForm.id ? `Edit ledger ${accountForm.code}` : 'Add ledger'} subtitle={accountForm.isSystem ? 'System ledger: name, tax details and description can change; its role in automatic posting stays.' : undefined} onClose={() => { if (!busy) setAccountForm(null); }} wide>
          <form onSubmit={saveAccount} className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Code *"><input value={accountForm.code} disabled={Boolean(accountForm.id)} onChange={(event) => setAccountForm({ ...accountForm, code: event.target.value.toUpperCase() })} className={`${inputClass} font-mono`} maxLength={12} required /></Field>
              <Field label="Ledger name *"><input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} className={inputClass} maxLength={120} required /></Field>
              <Field label="Group *">
                <select value={accountForm.groupId} disabled={accountForm.isSystem} onChange={(event) => setAccountForm({ ...accountForm, groupId: event.target.value })} className={inputClass} required>
                  {groups.map((group) => <option key={group.id} value={group.id}>{group.code} · {group.name}</option>)}
                </select>
              </Field>
              <Field label="Ledger type" hint="Bank, cash and gateway ledgers are created from Bank Accounts.">
                <select value={accountForm.kind} disabled={Boolean(accountForm.id)} onChange={(event) => setAccountForm({ ...accountForm, kind: event.target.value })} className={inputClass}>
                  {selectableKinds.map((kind) => <option key={kind} value={kind}>{enumLabel(kind)}</option>)}
                </select>
              </Field>
              <Field label="Normal balance" hint="Blank = from the group's nature.">
                <select value={accountForm.normalBalance} disabled={Boolean(accountForm.id)} onChange={(event) => setAccountForm({ ...accountForm, normalBalance: event.target.value as AccountForm['normalBalance'] })} className={inputClass}>
                  <option value="">Automatic</option><option value="DR">Debit</option><option value="CR">Credit</option>
                </select>
              </Field>
              <Field label="TDS section"><input value={accountForm.tdsSection} onChange={(event) => setAccountForm({ ...accountForm, tdsSection: event.target.value.toUpperCase() })} className={inputClass} maxLength={10} placeholder="e.g. 194C" /></Field>
              <Field label="HSN / SAC"><input value={accountForm.hsnSac} onChange={(event) => setAccountForm({ ...accountForm, hsnSac: event.target.value.replace(/\D/g, '') })} className={inputClass} maxLength={8} /></Field>
              <Field label="Default GST rate %"><input type="number" min={0} max={100} step="0.01" value={accountForm.defaultGstRate} disabled={!accountForm.gstApplicable} onChange={(event) => setAccountForm({ ...accountForm, defaultGstRate: event.target.value })} className={inputClass} /></Field>
              <Field label="Tally ledger name"><input value={accountForm.tallyName} onChange={(event) => setAccountForm({ ...accountForm, tallyName: event.target.value })} className={inputClass} maxLength={120} placeholder="Same as name" /></Field>
              <Field label="Description" wide><input value={accountForm.description} onChange={(event) => setAccountForm({ ...accountForm, description: event.target.value })} className={inputClass} maxLength={500} /></Field>
            </div>
            <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
              <Toggle checked={accountForm.gstApplicable} onChange={(value) => setAccountForm({ ...accountForm, gstApplicable: value })} label="GST applicable" />
              <Toggle checked={accountForm.requiresParty} onChange={(value) => setAccountForm({ ...accountForm, requiresParty: value })} label="Party required on entries" />
              <Toggle checked={accountForm.requiresVehicle} onChange={(value) => setAccountForm({ ...accountForm, requiresVehicle: value })} label="Vehicle required on entries" />
              <Toggle checked={accountForm.requiresCostCentre} onChange={(value) => setAccountForm({ ...accountForm, requiresCostCentre: value })} label="Cost centre required" />
              <Toggle checked={accountForm.allowManualPosting} disabled={accountForm.isSystem} onChange={(value) => setAccountForm({ ...accountForm, allowManualPosting: value })} label="Allow manual vouchers" />
              <Toggle checked={accountForm.isActive} disabled={accountForm.isSystem || accountForm.hasBank} onChange={(value) => setAccountForm({ ...accountForm, isActive: value })} label="Active" />
            </div>
            <ModalFooter><Button onClick={() => setAccountForm(null)} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy}>Save ledger</Button></ModalFooter>
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
