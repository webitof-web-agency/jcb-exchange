'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { FINANCE_WORKSPACE_PERMISSION_GROUPS } from '@/lib/adminPermissionCatalog';
import { financeModulePath } from '@/lib/financeWorkspace';
import { apiErrorMessage, formatDate, formatInr, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { useAuthStore } from '@/store/authStore';
import AutomationSettingsModule from './AutomationSettingsModule';
import { optionalChoices, todayIso, useLedgerLookups } from './ledgerLookups';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, selectButtonClass, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';

const usePrefix = () => {
  const pathname = usePathname();
  return pathname.startsWith('/admin') ? '/admin' : '/employee';
};

type Integrations = {
  secretsConfigured: boolean;
  razorpay: { enabled: boolean; keyId: string | null; hasSecret: boolean; gatewayAccountId: string | null; bankAccountId: string | null; lastPullAt: string | null };
  hdfc: { enabled: boolean; hasSecret: boolean; bankAccountId: string | null; webhookPath: string };
  gsp: { enabled: boolean; provider: string | null; gstin: string | null; username: string | null };
  events: Array<{ provider: string; status: string; count: number }>;
};
type IntegrationEvent = { id: string; provider: string; externalId: string; amount: number | null; eventDate: string | null; reference: string | null; payerName: string | null; status: string; note: string | null; receivedAt: string };

/** Bank / gateway / GST connectors (off by default) and the inbound credits they deliver. */
export function IntegrationsModule() {
  const prefix = usePrefix();
  const isSuperAdmin = useAuthStore((state) => state.user?.role) === 'SUPER_ADMIN';
  const access = useFinanceWorkspaceAccess();
  const canBook = access.can(['fh.books.manage']);
  const lookups = useLedgerLookups();
  const banks = useMemo(() => lookups.accounts.filter((account) => account.kind === 'BANK' && account.isActive).map(lookups.accountOption), [lookups]);
  const gateways = useMemo(() => lookups.accounts.filter((account) => account.kind === 'GATEWAY_CLEARING' && account.isActive).map(lookups.accountOption), [lookups]);
  const [version, setVersion] = useState(0);
  const data = useResource(async () => (await api.get('/finance-hub/integrations')).data as Integrations, `integrations-${version}`);
  const events = useResource(async () => (await api.get('/finance-hub/integrations/events', { params: { status: 'RECEIVED' } })).data.events as IntegrationEvent[], `integration-events-${version}`);
  const [razorpay, setRazorpay] = useState<{ keyId: string; keySecret: string; gatewayAccountId: string; bankAccountId: string } | null>(null);
  const [hdfc, setHdfc] = useState<{ webhookSecret: string; bankAccountId: string } | null>(null);
  const [gsp, setGsp] = useState<{ provider: string; gstin: string; username: string } | null>(null);
  const [pull, setPull] = useState<{ from: string; to: string; rows: Array<{ utr: string; date: string; gross: string; fee: string; gst: string }> | null } | null>(null);
  const [booking, setBooking] = useState<IntegrationEvent | null>(null);
  const [bookForm, setBookForm] = useState({ counterAccountId: '', partyId: '' });
  const [busy, setBusy] = useState(false);
  const refresh = () => setVersion((value) => value + 1);
  const run = async (action: () => Promise<{ data: unknown }>, success: string) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(success);
      refresh();
      return result.data;
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Action failed.'));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const d = data.data;
  const counter = lookups.accountsById.get(bookForm.counterAccountId);
  const counterOptions = lookups.accounts.filter((account) => account.isActive && account.allowManualPosting && !['BANK', 'CASH', 'PETTY_CASH', 'WALLET', 'GATEWAY_CLEARING'].includes(account.kind)).map(lookups.accountOption);

  return (
    <div className="space-y-3">
      <Panel title="Integrations & notifications" description="Connectors bring bank credits and gateway settlements in automatically. Each is off until a super admin switches it on; credentials are stored encrypted and never shown again.">
        {data.loading ? <LoadingState /> : data.error || !d ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
          <>
            {!d.secretsConfigured ? <ReadOnlyNotice>The server has no FINANCE_HUB_SETTINGS_SECRET (64 hex characters) yet, so connector credentials cannot be saved. Ask the developer to add it to the backend environment.</ReadOnlyNotice> : null}
            {!isSuperAdmin ? <ReadOnlyNotice>Only a super admin can switch a connector on. You can review the settings.</ReadOnlyNotice> : null}
            <div className="grid gap-3 p-3 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between"><p className="font-semibold">Razorpay settlements</p><Badge tone={d.razorpay.enabled ? 'green' : 'slate'}>{d.razorpay.enabled ? 'On' : 'Off'}</Badge></div>
                <p className="mt-1 text-xs text-slate-500">Pulls processed settlements (gross, fee, GST, UTR) and posts them as gateway settlements into the bank. Key: {d.razorpay.keyId ?? 'not set'}{d.razorpay.lastPullAt ? ` · last pull ${new Date(d.razorpay.lastPullAt).toLocaleString('en-IN')}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => setRazorpay({ keyId: '', keySecret: '', gatewayAccountId: d.razorpay.gatewayAccountId ?? gateways[0]?.id ?? '', bankAccountId: d.razorpay.bankAccountId ?? banks[0]?.id ?? '' })}>Settings</Button>
                  {d.razorpay.enabled ? <><Button busy={busy} onClick={() => void run(() => api.post('/finance-hub/integrations/razorpay/test'), 'Razorpay connection works.')}>Test</Button><Button variant="primary" onClick={() => setPull({ from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), to: todayIso(), rows: null })}>Pull settlements</Button></> : null}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between"><p className="font-semibold">HDFC e-Collect (virtual accounts)</p><Badge tone={d.hdfc.enabled ? 'green' : 'slate'}>{d.hdfc.enabled ? 'On' : 'Off'}</Badge></div>
                <p className="mt-1 text-xs text-slate-500">The bank calls <span className="font-mono">{d.hdfc.webhookPath}</span> with header <span className="font-mono">x-finance-hub-secret</span> for each credit (utr, amount, virtualAccount, remitterName). Credits wait below to be booked.</p>
                <div className="mt-3"><Button onClick={() => setHdfc({ webhookSecret: '', bankAccountId: d.hdfc.bankAccountId ?? banks[0]?.id ?? '' })}>Settings</Button></div>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between"><p className="font-semibold">GST portal (GSP)</p><Badge>Off</Badge></div>
                <p className="mt-1 text-xs text-slate-500">Filing GSTR-1/3B and pulling 2B directly needs a GSP agreement and its API. Until then, export from GST Returns and upload the 2B JSON. {d.gsp.provider ? `Planned GSP: ${d.gsp.provider}` : ''}</p>
                <div className="mt-3"><Button onClick={() => setGsp({ provider: d.gsp.provider ?? '', gstin: d.gsp.gstin ?? '', username: d.gsp.username ?? '' })}>Details</Button></div>
              </div>
            </div>
            <div className="grid gap-3 px-3 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              {[[`${prefix}/whatsapp`, 'WhatsApp', 'Templates and delivery (existing)'], [`${prefix}/sms`, 'SMS', 'Gateway settings (existing)'], [financeModulePath(prefix, 'tally-accounting-export'), 'Tally', 'Tally Prime XML export'], [financeModulePath(prefix, 'automation-approval-rules'), 'Notifications', 'Daily alert digest and automation']].map(([href, label, hint]) => <Link key={label} href={href} className="rounded-lg bg-slate-50 p-3 hover:bg-amber-50"><p className="text-[13px] font-semibold">{label}</p><p className="text-xs text-slate-500">{hint}</p></Link>)}
            </div>
          </>
        )}
      </Panel>
      <Panel title="Credits waiting to be booked" description="Received from connected banks; book each as a receipt (it then reconciles automatically) or ignore it with a reason.">
        {events.loading ? <LoadingState /> : events.error ? <ErrorBanner message={events.error} schemaMissing={events.schemaMissing} /> : !events.data?.length ? <EmptyState title="Nothing waiting" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className={tableHeadClass}><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">UTR / VAN</th><th className="px-3 py-2">Payer</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {events.data.map((event) => (
                  <tr key={event.id}>
                    <td className={`${cellClass} whitespace-nowrap`}>{formatDate(event.eventDate)}</td>
                    <td className={cellClass}><Badge tone="violet">{event.provider}</Badge></td>
                    <td className={`${cellClass} font-mono text-xs`}>{event.externalId}{event.reference ? <span className="block text-slate-400">{event.reference}</span> : null}</td>
                    <td className={`${cellClass} text-xs`}>{event.payerName ?? '—'}</td>
                    <td className={`${cellClass} text-right font-semibold`}>{formatInr(event.amount)}</td>
                    <td className={`${cellClass} whitespace-nowrap text-right`}>{canBook ? <><Button variant="ghost" onClick={() => { setBooking(event); setBookForm({ counterAccountId: lookups.accounts.find((account) => account.systemKey === 'DEBTORS_CONTROL')?.id ?? '', partyId: '' }); }}>Book</Button><Button variant="ghost" onClick={() => { const note = window.prompt('Why ignore this credit?'); if (note?.trim()) void run(() => api.post(`/finance-hub/integrations/events/${event.id}/ignore`, { note }), 'Ignored.'); }}>Ignore</Button></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {razorpay ? (
        <Modal title="Razorpay connector" subtitle="Dashboard → Account & Settings → API keys. Leave the secret blank to keep the saved one." onClose={() => { if (!busy) setRazorpay(null); }}>
          <form onSubmit={(event: FormEvent) => event.preventDefault()} className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Key id"><input value={razorpay.keyId} onChange={(event) => setRazorpay({ ...razorpay, keyId: event.target.value.trim() })} className={inputClass} placeholder={d?.razorpay.keyId ?? 'rzp_live_…'} /></Field>
              <Field label="Key secret"><input type="password" value={razorpay.keySecret} onChange={(event) => setRazorpay({ ...razorpay, keySecret: event.target.value })} className={inputClass} placeholder={d?.razorpay.hasSecret ? 'saved' : ''} autoComplete="off" /></Field>
              <Field label="Gateway ledger"><SearchableSelect buttonClassName={selectButtonClass} options={gateways} value={razorpay.gatewayAccountId} onChange={(option) => setRazorpay({ ...razorpay, gatewayAccountId: String(option.id) })} placeholder="Razorpay Clearing" /></Field>
              <Field label="Settles into"><SearchableSelect buttonClassName={selectButtonClass} options={banks} value={razorpay.bankAccountId} onChange={(option) => setRazorpay({ ...razorpay, bankAccountId: String(option.id) })} placeholder="Bank" /></Field>
            </div>
            <ModalFooter>
              <Button onClick={() => setRazorpay(null)} disabled={busy}>Cancel</Button>
              <Button busy={busy} onClick={() => void run(() => api.put('/finance-hub/integrations/razorpay', { ...razorpay, enabled: false }), 'Saved (off).').then((ok) => { if (ok) setRazorpay(null); })}>Save, keep off</Button>
              {isSuperAdmin ? <Button variant="primary" busy={busy} onClick={() => void run(() => api.put('/finance-hub/integrations/razorpay', { ...razorpay, enabled: true }), 'Razorpay switched on.').then((ok) => { if (ok) setRazorpay(null); })}>Save &amp; switch on</Button> : null}
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
      {hdfc ? (
        <Modal title="HDFC e-Collect connector" subtitle="Share the webhook URL and this secret with the bank's e-Collect team. Leave blank to keep the saved one." onClose={() => { if (!busy) setHdfc(null); }}>
          <div className="p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Webhook secret"><input type="password" value={hdfc.webhookSecret} onChange={(event) => setHdfc({ ...hdfc, webhookSecret: event.target.value })} className={inputClass} placeholder={d?.hdfc.hasSecret ? 'saved' : 'long random text'} autoComplete="off" /></Field>
              <Field label="Credits go to"><SearchableSelect buttonClassName={selectButtonClass} options={banks} value={hdfc.bankAccountId} onChange={(option) => setHdfc({ ...hdfc, bankAccountId: String(option.id) })} placeholder="Bank" /></Field>
            </div>
            <ModalFooter>
              <Button onClick={() => setHdfc(null)} disabled={busy}>Cancel</Button>
              <Button busy={busy} onClick={() => void run(() => api.put('/finance-hub/integrations/hdfc', { ...hdfc, enabled: false }), 'Saved (off).').then((ok) => { if (ok) setHdfc(null); })}>Save, keep off</Button>
              {isSuperAdmin ? <Button variant="primary" busy={busy} onClick={() => void run(() => api.put('/finance-hub/integrations/hdfc', { ...hdfc, enabled: true }), 'HDFC e-Collect switched on.').then((ok) => { if (ok) setHdfc(null); })}>Save &amp; switch on</Button> : null}
            </ModalFooter>
          </div>
        </Modal>
      ) : null}
      {gsp ? (
        <Modal title="GST portal (GSP)" subtitle="Recorded for later; the connector cannot be switched on yet." onClose={() => setGsp(null)}>
          <div className="p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="GSP"><input value={gsp.provider} onChange={(event) => setGsp({ ...gsp, provider: event.target.value })} className={inputClass} placeholder="e.g. ClearTax, Masters India" /></Field>
              <Field label="GSTIN"><input data-sanitize="gstin" value={gsp.gstin} onChange={(event) => setGsp({ ...gsp, gstin: event.target.value.toUpperCase() })} className={inputClass} maxLength={15} /></Field>
              <Field label="Portal username"><input value={gsp.username} onChange={(event) => setGsp({ ...gsp, username: event.target.value })} className={inputClass} /></Field>
            </div>
            <ModalFooter><Button onClick={() => setGsp(null)}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void run(() => api.put('/finance-hub/integrations/gsp', { ...gsp, enabled: false }), 'Saved.').then((ok) => { if (ok) setGsp(null); })}>Save</Button></ModalFooter>
          </div>
        </Modal>
      ) : null}
      {pull ? (
        <Modal title="Pull Razorpay settlements" subtitle="Preview first; posting creates one contra voucher per UTR (already posted UTRs are skipped)." onClose={() => { if (!busy) setPull(null); }} wide>
          <div className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="From"><input type="date" value={pull.from} onChange={(event) => setPull({ ...pull, from: event.target.value, rows: null })} className={inputClass} /></Field>
              <Field label="To"><input type="date" value={pull.to} onChange={(event) => setPull({ ...pull, to: event.target.value, rows: null })} className={inputClass} /></Field>
              <Button icon={<RefreshCw className="h-4 w-4" />} busy={busy} onClick={() => void run(() => api.post('/finance-hub/integrations/razorpay/pull', { from: pull.from, to: pull.to, dryRun: true }), 'Fetched.').then((result) => { if (result) setPull({ ...pull, rows: (result as { rows: NonNullable<typeof pull.rows> }).rows }); })}>Preview</Button>
            </div>
            {pull.rows ? (!pull.rows.length ? <EmptyState title="No processed settlements in that range" /> : (
              <table className="mt-3 w-full text-[13px]"><thead className={tableHeadClass}><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">UTR</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">Fee</th><th className="px-3 py-2 text-right">GST</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{pull.rows.map((row) => <tr key={row.utr}><td className="px-3 py-1.5">{formatDate(row.date)}</td><td className="px-3 py-1.5 font-mono text-xs">{row.utr}</td><td className="px-3 py-1.5 text-right">{formatInr(Number(row.gross))}</td><td className="px-3 py-1.5 text-right">{formatInr(Number(row.fee))}</td><td className="px-3 py-1.5 text-right">{formatInr(Number(row.gst))}</td></tr>)}</tbody></table>
            )) : null}
            <ModalFooter><Button onClick={() => setPull(null)} disabled={busy}>Close</Button><Button variant="primary" busy={busy} disabled={!pull.rows?.length} onClick={() => void run(() => api.post('/finance-hub/integrations/razorpay/pull', { from: pull.from, to: pull.to, dryRun: false }), 'Settlements posted.').then((ok) => { if (ok) setPull(null); })}>Post {pull.rows?.length ?? 0} settlements</Button></ModalFooter>
          </div>
        </Modal>
      ) : null}
      {booking ? (
        <Modal title="Book bank credit" subtitle={`${booking.externalId} · ${formatInr(booking.amount)}${booking.payerName ? ` from ${booking.payerName}` : ''}`} onClose={() => { if (!busy) setBooking(null); }}>
          <div className="p-4">
            <div className="grid gap-3">
              <Field label="Received for (ledger) *"><SearchableSelect buttonClassName={selectButtonClass} options={counterOptions} value={bookForm.counterAccountId} onChange={(option) => setBookForm({ ...bookForm, counterAccountId: String(option.id) })} placeholder="e.g. Sundry Debtors, Customer Advances" /></Field>
              {counter?.requiresParty ? <Field label="Party *"><SearchableSelect buttonClassName={selectButtonClass} options={optionalChoices(lookups.partyOptions, bookForm.partyId)} value={bookForm.partyId} onChange={(option) => setBookForm({ ...bookForm, partyId: String(option.id) })} placeholder="Customer" /></Field> : null}
            </div>
            <ModalFooter><Button onClick={() => setBooking(null)} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} disabled={!bookForm.counterAccountId || Boolean(counter?.requiresParty && !bookForm.partyId)} onClick={() => void run(() => api.post(`/finance-hub/integrations/events/${booking.id}/book`, { ...bookForm, partyId: bookForm.partyId || null }), 'Receipt booked.').then((ok) => { if (ok) setBooking(null); })}>Book receipt</Button></ModalFooter>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

type Automation = { settings: { recurringDrafts: boolean; bankAutoMatch: boolean; alertDigest: boolean; runAfterHourIst: number }; state: { lastRunDate: string | null; lastResult: Record<string, unknown> | null } };

/** Daily jobs run by the finance worker; all off by default. */
export function AutomationJobsPanel() {
  const access = useFinanceWorkspaceAccess();
  const canManage = access.can(['fh.settings.manage']);
  const [version, setVersion] = useState(0);
  const data = useResource(async () => (await api.get('/finance-hub/automation')).data as Automation, `automation-${version}`);
  const [busy, setBusy] = useState(false);
  const save = async (patch: Partial<Automation['settings']>) => {
    if (!data.data) return;
    setBusy(true);
    try {
      await api.put('/finance-hub/automation', { ...data.data.settings, ...patch });
      toast.success('Saved.');
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };
  const runNow = async () => {
    setBusy(true);
    try {
      const result = (await api.post('/finance-hub/automation/run')).data;
      toast.success(`Ran: ${JSON.stringify(result).slice(0, 160)}`);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Run failed.'));
    } finally {
      setBusy(false);
    }
  };
  const settings = data.data?.settings;
  return (
    <Panel title="Daily automation & notifications" description="Runs once a day from the finance worker after the chosen hour. Every job only prepares drafts, matches or notifies; nothing is posted without a person." actions={canManage && settings ? <Button icon={<RefreshCw className="h-4 w-4" />} busy={busy} onClick={() => void runNow()}>Run now</Button> : null}>
      {data.loading ? <LoadingState /> : data.error || !settings ? <ErrorBanner message={data.error || 'Could not load.'} schemaMissing={data.schemaMissing} /> : (
        <div className="space-y-3 p-3">
          <Toggle checked={settings.recurringDrafts} disabled={!canManage || busy} onChange={(value) => void save({ recurringDrafts: value })} label="Create due recurring expense drafts" />
          <Toggle checked={settings.bankAutoMatch} disabled={!canManage || busy} onChange={(value) => void save({ bankAutoMatch: value })} label="Auto-match bank statement rows of the last 45 days" />
          <Toggle checked={settings.alertDigest} disabled={!canManage || busy} onChange={(value) => void save({ alertDigest: value })} label="Send admins an in-app digest of open finance alerts" />
          <div className="max-w-[200px]"><Field label="Run after (IST hour)"><input type="number" min={0} max={23} value={settings.runAfterHourIst} disabled={!canManage} onChange={(event) => void save({ runAfterHourIst: Number(event.target.value) })} className={inputClass} /></Field></div>
          <p className="text-xs text-slate-500">Last run: {data.data?.state.lastRunDate ?? 'never'}{data.data?.state.lastResult ? ` · ${JSON.stringify(data.data.state.lastResult).slice(0, 200)}` : ''}</p>
        </div>
      )}
    </Panel>
  );
}

/** Approval policy + automatic posting (existing screen) followed by the daily jobs. */
export function AutomationRulesModule() {
  return <div className="space-y-3"><AutomationSettingsModule /><AutomationJobsPanel /></div>;
}

type TdsSection = { section: string; nature: string; rate: number; rateNoPan: number; threshold: number | null; thresholdNote: string | null };

/** TDS sections and GST rates used as defaults and hints across the workspace. */
export function TaxConfigurationsModule() {
  const access = useFinanceWorkspaceAccess();
  const canEdit = access.can(['fh.settings.manage', 'fh.tax.manage']);
  const [version, setVersion] = useState(0);
  const data = useResource(async () => (await api.get('/finance-hub/tax-config')).data as { tdsSections: TdsSection[]; gstRates: number[]; marginSchemeRate: number }, `tax-config-${version}`);
  const [form, setForm] = useState<{ tdsSections: TdsSection[]; gstRates: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await api.put('/finance-hub/tax-config', { tdsSections: form.tdsSections, gstRates: form.gstRates.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value)) });
      toast.success('Tax settings saved.');
      setForm(null);
      setVersion((value) => value + 1);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };
  const d = data.data;
  return (
    <Panel title="Tax configurations" description="TDS sections with rates and thresholds, and the GST rates offered on bills and invoices. Laws change: keep these in step with the CA. Used-vehicle sales stay on the 18% margin scheme." actions={canEdit && d ? <Button variant="primary" onClick={() => setForm({ tdsSections: d.tdsSections, gstRates: d.gstRates.join(', ') })}>Edit</Button> : null}>
      {data.loading ? <LoadingState /> : data.error || !d ? <ErrorBanner message={data.error || 'Could not load.'} /> : (
        <div className="p-3">
          <p className="mb-3 text-[13px]">GST rates: {d.gstRates.map((rate) => <Badge key={rate}>{rate}%</Badge>)} · Margin scheme: {d.marginSchemeRate}%</p>
          <table className="w-full text-[13px]"><thead className={tableHeadClass}><tr><th className="px-3 py-2 text-left">Section</th><th className="px-3 py-2 text-left">Nature</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">No PAN</th><th className="px-3 py-2 text-left">Threshold</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{d.tdsSections.map((row) => <tr key={row.section}><td className="px-3 py-2 font-semibold">{row.section}</td><td className="px-3 py-2">{row.nature}</td><td className="px-3 py-2 text-right">{row.rate}%</td><td className="px-3 py-2 text-right">{row.rateNoPan}%</td><td className="px-3 py-2 text-xs">{row.threshold ? formatInr(row.threshold) : '—'}{row.thresholdNote ? ` · ${row.thresholdNote}` : ''}</td></tr>)}</tbody></table>
        </div>
      )}
      {form ? (
        <Modal title="Edit tax settings" onClose={() => { if (!busy) setForm(null); }} wide>
          <div className="p-4">
            <Field label="GST rates (comma separated)"><input value={form.gstRates} onChange={(event) => setForm({ ...form, gstRates: event.target.value })} className={inputClass} /></Field>
            <table className="mt-3 w-full text-[13px]">
              <thead className={tableHeadClass}><tr><th className="px-2 py-2">Section</th><th className="px-2 py-2">Nature</th><th className="px-2 py-2">Rate %</th><th className="px-2 py-2">No PAN %</th><th className="px-2 py-2">Threshold ₹</th><th className="px-2 py-2">Note</th><th /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {form.tdsSections.map((row, index) => {
                  const set = (patch: Partial<TdsSection>) => setForm({ ...form, tdsSections: form.tdsSections.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
                  return (
                    <tr key={index}>
                      <td className="w-24 px-2 py-1.5"><input value={row.section} onChange={(event) => set({ section: event.target.value.toUpperCase() })} className={`${inputClass} py-1.5`} /></td>
                      <td className="px-2 py-1.5"><input value={row.nature} onChange={(event) => set({ nature: event.target.value })} className={`${inputClass} py-1.5`} /></td>
                      <td className="w-20 px-2 py-1.5"><input type="number" step="0.01" value={row.rate} onChange={(event) => set({ rate: Number(event.target.value) })} className={`${inputClass} py-1.5`} /></td>
                      <td className="w-20 px-2 py-1.5"><input type="number" value={row.rateNoPan} onChange={(event) => set({ rateNoPan: Number(event.target.value) })} className={`${inputClass} py-1.5`} /></td>
                      <td className="w-28 px-2 py-1.5"><input type="number" value={row.threshold ?? ''} onChange={(event) => set({ threshold: event.target.value ? Number(event.target.value) : null })} className={`${inputClass} py-1.5`} /></td>
                      <td className="px-2 py-1.5"><input value={row.thresholdNote ?? ''} onChange={(event) => set({ thresholdNote: event.target.value || null })} className={`${inputClass} py-1.5`} /></td>
                      <td className="px-2 py-1.5"><button type="button" onClick={() => setForm({ ...form, tdsSections: form.tdsSections.filter((_, at) => at !== index) })} className="text-slate-400 hover:text-red-600" aria-label="Remove"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Button variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setForm({ ...form, tdsSections: [...form.tdsSections, { section: '', nature: '', rate: 0, rateNoPan: 20, threshold: null, thresholdNote: null }] })}>Add section</Button>
            <ModalFooter><Button onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button variant="primary" busy={busy} onClick={() => void save()}>Save</Button></ModalFooter>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}

/** Finance permissions at a glance, with the link to assign them on Roles. */
export function RolesPermissionsModule() {
  const prefix = usePrefix();
  return (
    <Panel title="Roles & permissions" description="Finance access is granted per permission on staff roles. Approval limits (maker-checker) are set under Automation & Approval Rules." actions={prefix !== '/employee' ? <Link href={`${prefix}/users/roles`} className="inline-flex h-8 items-center rounded-lg bg-amber-400 px-3 text-[13px] font-semibold text-slate-950 hover:bg-amber-300">Open roles</Link> : null}>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        {FINANCE_WORKSPACE_PERMISSION_GROUPS.map((group) => (
          <div key={group.groupName} className="rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-[13px] font-semibold">{group.groupName}</p>
            <ul className="space-y-1 text-xs">{group.permissions.map((permission) => <li key={permission.id} className="flex justify-between gap-3"><span>{permission.label}</span><span className="font-mono text-slate-400">{permission.id}</span></li>)}</ul>
          </div>
        ))}
      </div>
      <p className="px-3 pb-4 text-xs text-slate-500">Super admins and admins have every finance permission. Each screen and API checks its own keys.</p>
    </Panel>
  );
}
