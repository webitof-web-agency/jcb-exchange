'use client';

import { FormEvent, useState } from 'react';
import { Plus, RefreshCw, Save } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { apiErrorMessage, enumLabel, useFinanceWorkspaceAccess } from '@/lib/financeWorkspaceClient';
import { Badge, Button, cellClass, EmptyState, ErrorBanner, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, ReadOnlyNotice, tableHeadClass, Toggle } from './ui';
import { useResource } from './useResource';

type Profile = Record<'legalName' | 'tradeName' | 'pan' | 'tan' | 'cin' | 'msmeUdyam' | 'constitution' | 'address' | 'city' | 'state' | 'pinCode' | 'email' | 'phone' | 'signatoryName' | 'signatoryDesignation', string | null>;
type Registration = { id: string; gstin: string; stateCode: string; stateName: string; registrationType: 'REGULAR' | 'COMPOSITION'; isDefault: boolean; marginSchemeEnabled: boolean; einvoiceApplicable: boolean; isActive: boolean };
type CompanyResponse = { profile: Partial<Profile>; registrations: Registration[]; persisted: boolean; suggestedGstin?: string | null };

const CONSTITUTIONS = ['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'OPC', 'HUF', 'TRUST', 'OTHER'];
const FIELDS: Array<{ key: keyof Profile; label: string; max?: number; upper?: boolean; wide?: boolean }> = [
  { key: 'legalName', label: 'Legal name *', max: 200, wide: true },
  { key: 'tradeName', label: 'Trade name', max: 200 },
  { key: 'pan', label: 'PAN', max: 10, upper: true },
  { key: 'tan', label: 'TAN', max: 10, upper: true },
  { key: 'cin', label: 'CIN / LLPIN', max: 21, upper: true },
  { key: 'msmeUdyam', label: 'Udyam (MSME) no.', max: 30, upper: true },
  { key: 'city', label: 'City', max: 80 },
  { key: 'state', label: 'State', max: 80 },
  { key: 'pinCode', label: 'PIN code', max: 6 },
  { key: 'email', label: 'Accounts email', max: 160 },
  { key: 'phone', label: 'Accounts phone', max: 20 },
  { key: 'signatoryName', label: 'Authorised signatory', max: 120 },
  { key: 'signatoryDesignation', label: 'Signatory designation', max: 80 },
];

const emptyRegistration = { gstin: '', registrationType: 'REGULAR' as Registration['registrationType'], isDefault: false, marginSchemeEnabled: true, einvoiceApplicable: false, isActive: true };

export default function CompanyProfileModule() {
  const canManage = useFinanceWorkspaceAccess().can(['fh.settings.manage']);
  const company = useResource(async () => (await api.get('/finance-hub/company')).data as CompanyResponse, 'company');
  const [draft, setDraft] = useState<Partial<Profile> | null>(null);
  const [busy, setBusy] = useState(false);
  const [registration, setRegistration] = useState<(typeof emptyRegistration & { id?: string }) | null>(null);

  const form = draft ?? company.data?.profile ?? {};
  const setField = (key: keyof Profile, value: string) => setDraft({ ...form, [key]: value });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.put('/finance-hub/company', form);
      toast.success('Company financial profile saved.');
      setDraft(null);
      company.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the profile.'));
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const response = await api.post('/finance-hub/company/sync-invoice-settings');
      toast.success(response.data.registrationCreated ? 'Synced. The invoice GSTIN was added as a registration.' : 'Synced from company invoice settings.');
      setDraft(null);
      company.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not sync.'));
    } finally {
      setBusy(false);
    }
  };

  const saveRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (!registration) return;
    setBusy(true);
    try {
      const { id, gstin, ...flags } = registration;
      if (id) await api.put(`/finance-hub/gst-registrations/${id}`, flags);
      else await api.post('/finance-hub/gst-registrations', { gstin, ...flags });
      toast.success('GST registration saved.');
      setRegistration(null);
      company.reload();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not save the GST registration.'));
    } finally {
      setBusy(false);
    }
  };

  if (company.loading) return <Panel><LoadingState /></Panel>;
  if (company.error) return <Panel><ErrorBanner message={company.error} schemaMissing={company.schemaMissing} /></Panel>;
  const data = company.data!;

  return (
    <div className="space-y-5">
      <Panel
        title="Company financial profile"
        description={data.persisted ? 'Used on statements, reports, Tally export and tax returns.' : 'Not saved yet — prefilled from Settings → Company invoice settings. Review and save.'}
        actions={canManage ? <Button icon={<RefreshCw className="h-4 w-4" />} busy={busy} onClick={sync}>Sync from invoice settings</Button> : null}
      >
        {!canManage ? <ReadOnlyNotice>Editing needs “Manage Finance Settings”.</ReadOnlyNotice> : null}
        <form onSubmit={save} className="p-5 sm:p-7">
          <fieldset disabled={!canManage} className="grid gap-4 md:grid-cols-3">
            {FIELDS.map((field) => (
              <Field key={field.key} label={field.label} wide={field.wide}>
                <input value={form[field.key] ?? ''} maxLength={field.max} onChange={(event) => setField(field.key, field.upper ? event.target.value.toUpperCase() : event.target.value)} className={`${inputClass} ${field.upper ? 'uppercase' : ''}`} required={field.label.endsWith('*')} />
              </Field>
            ))}
            <Field label="Constitution">
              <select value={form.constitution ?? ''} onChange={(event) => setField('constitution', event.target.value)} className={inputClass}>
                <option value="">Select…</option>
                {CONSTITUTIONS.map((item) => <option key={item} value={item}>{enumLabel(item)}</option>)}
              </select>
            </Field>
            <Field label="Registered address" wide>
              <textarea value={form.address ?? ''} maxLength={500} onChange={(event) => setField('address', event.target.value)} className={`${inputClass} min-h-20`} />
            </Field>
          </fieldset>
          {canManage ? <ModalFooter><Button type="submit" variant="primary" busy={busy} icon={<Save className="h-4 w-4" />}>Save profile</Button></ModalFooter> : null}
        </form>
      </Panel>

      <Panel
        title="GST registrations"
        description="One row per GSTIN. The default GSTIN is used on new invoices; margin scheme applies to used-vehicle sales."
        actions={canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setRegistration({ ...emptyRegistration, gstin: data.suggestedGstin ?? '' })}>Add GSTIN</Button> : null}
      >
        {data.registrations.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className={tableHeadClass}><tr><th className="px-4 py-2.5">GSTIN</th><th className="px-4 py-2.5">State</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Margin scheme</th><th className="px-4 py-2.5">E-invoice</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.registrations.map((item) => (
                  <tr key={item.id}>
                    <td className={`${cellClass} font-mono text-xs font-bold text-slate-900`}>{item.gstin} {item.isDefault ? <Badge tone="blue">Default</Badge> : null}</td>
                    <td className={cellClass}>{item.stateName} ({item.stateCode})</td>
                    <td className={cellClass}>{enumLabel(item.registrationType)}</td>
                    <td className={cellClass}>{item.marginSchemeEnabled ? 'Yes' : 'No'}</td>
                    <td className={cellClass}>{item.einvoiceApplicable ? 'Applicable' : 'No'}</td>
                    <td className={cellClass}><Badge tone={item.isActive ? 'green' : 'slate'}>{item.isActive ? 'Active' : 'Inactive'}</Badge></td>
                    <td className={`${cellClass} text-right`}>{canManage ? <Button variant="ghost" onClick={() => setRegistration({ ...item })}>Edit</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title="No GSTIN added" description={data.suggestedGstin ? `Invoice settings have GSTIN ${data.suggestedGstin}. Use “Sync from invoice settings” or add it here.` : 'Add the company GSTIN(s). State and PAN are read from the GSTIN.'} />}
      </Panel>

      {registration ? (
        <Modal title={registration.id ? `Edit ${registration.gstin}` : 'Add GST registration'} onClose={() => { if (!busy) setRegistration(null); }}>
          <form onSubmit={saveRegistration} className="space-y-4 p-5 sm:p-7">
            <Field label="GSTIN *" hint="15 characters; the check digit is verified.">
              <input value={registration.gstin} disabled={Boolean(registration.id)} onChange={(event) => setRegistration({ ...registration, gstin: event.target.value.toUpperCase() })} className={`${inputClass} font-mono uppercase`} maxLength={15} required />
            </Field>
            <Field label="Registration type">
              <select value={registration.registrationType} onChange={(event) => setRegistration({ ...registration, registrationType: event.target.value as Registration['registrationType'] })} className={inputClass}>
                <option value="REGULAR">Regular</option>
                <option value="COMPOSITION">Composition</option>
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={registration.isDefault} onChange={(value) => setRegistration({ ...registration, isDefault: value })} label="Default GSTIN" />
              <Toggle checked={registration.marginSchemeEnabled} onChange={(value) => setRegistration({ ...registration, marginSchemeEnabled: value })} label="Margin scheme for used vehicles" />
              <Toggle checked={registration.einvoiceApplicable} onChange={(value) => setRegistration({ ...registration, einvoiceApplicable: value })} label="E-invoicing applicable" />
              <Toggle checked={registration.isActive} onChange={(value) => setRegistration({ ...registration, isActive: value })} label="Active" />
            </div>
            <ModalFooter>
              <Button onClick={() => setRegistration(null)} disabled={busy}>Cancel</Button>
              <Button type="submit" variant="primary" busy={busy}>Save</Button>
            </ModalFooter>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
