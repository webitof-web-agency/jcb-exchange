'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { Crown, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { Badge, Button, cellClass, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, tableHeadClass } from '@/components/financeWorkspace/ui';
import {
  CrmErrorBanner,
  crmError,
  contactHref,
  fmtDate,
  fmtDateTime,
  getJson,
  label,
  selectClass,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type ContactLite,
} from './crmShared';

type ContactRow = ContactLite & {
  createdAt: string;
  isPrime: boolean;
  leadCount: number;
  openLeadCount: number;
  lastLeadAt: string | null;
  nextFollowUpAt: string | null;
  crmProfile: { companyName: string | null; lifecycle: string; contactTypes: string[]; tags: string[]; doNotContact: boolean; owner: { id: string; name: string | null } | null } | null;
};

export const CONTACT_TYPES = ['BUYER', 'SELLER', 'DEALER', 'BROKER', 'FINANCIER', 'TRANSPORTER', 'CONTRACTOR', 'OTHER'];

export default function ContactsTab() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [contactType, setContactType] = useState('');
  const [openLeads, setOpenLeads] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = { q: search, lifecycle, contactType, openLeads, page, pageSize: 25 };
  const contacts = useCrmResource(() => getJson<{ total: number; items: ContactRow[] }>('/crm/contacts', query), JSON.stringify(query));
  const totalPages = Math.max(1, Math.ceil((contacts.data?.total || 0) / 25));

  return (
    <Panel
      title="Contacts"
      description="Buyers, sellers, dealers and financiers — one profile per mobile number with the full history."
      actions={meta?.access.canManage && !meta.access.isPartner ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New contact</Button> : undefined}
    >
      <div className="grid gap-2 border-b border-slate-100 p-4 sm:grid-cols-[1fr_180px_180px_160px]">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); setSearch(q); setPage(1); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, mobile, company, city…" className={`${inputClass} pl-9`} />
        </form>
        <select value={lifecycle} onChange={(e) => { setLifecycle(e.target.value); setPage(1); }} className={selectClass}>
          <option value="">Any stage</option>
          {(meta?.enums.lifecycles || []).map((l) => <option key={l} value={l}>{label(l)}</option>)}
        </select>
        <select value={contactType} onChange={(e) => { setContactType(e.target.value); setPage(1); }} className={selectClass}>
          <option value="">Any type</option>
          {CONTACT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
        </select>
        <select value={openLeads} onChange={(e) => { setOpenLeads(e.target.value); setPage(1); }} className={selectClass}>
          <option value="">All</option>
          <option value="yes">With open leads</option>
        </select>
      </div>
      {contacts.loading && !contacts.data ? <LoadingState /> : contacts.error ? <CrmErrorBanner message={contacts.error} schemaMissing={contacts.schemaMissing} /> : !contacts.data?.items.length ? (
        <EmptyState title="No contacts found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={tableHeadClass}>
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Type / stage</th>
                <th className="px-4 py-3">Leads</th>
                <th className="px-4 py-3">Next follow-up</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.data.items.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(contactHref(base, c.id))}>
                  <td className={cellClass}>
                    <p className="flex items-center gap-1.5 font-semibold text-slate-900">{c.name || 'Unnamed'}{c.isPrime ? <Crown className="h-3.5 w-3.5 text-amber-500" aria-label="Prime" /> : null}{c.crmProfile?.doNotContact ? <Badge tone="red">DND</Badge> : null}</p>
                    <p className="text-xs text-slate-500">{c.mobile}{c.crmProfile?.companyName ? ` · ${c.crmProfile.companyName}` : ''}{c.city ? ` · ${c.city}` : ''}</p>
                  </td>
                  <td className={cellClass}>
                    <p className="text-xs text-slate-700">{c.crmProfile?.contactTypes.map(label).join(', ') || (c.role === 'CUSTOMER' ? 'Customer' : label(c.role))}</p>
                    <Badge tone={c.crmProfile?.lifecycle === 'CUSTOMER' ? 'green' : 'slate'}>{label(c.crmProfile?.lifecycle || 'LEAD')}</Badge>
                  </td>
                  <td className={cellClass}><span className="font-semibold text-slate-800">{c.openLeadCount}</span><span className="text-xs text-slate-400"> open / {c.leadCount}</span></td>
                  <td className={cellClass}><span className="text-xs text-slate-600">{fmtDateTime(c.nextFollowUpAt)}</span></td>
                  <td className={cellClass}><span className="text-xs text-slate-600">{c.crmProfile?.owner?.name || '—'}</span></td>
                  <td className={cellClass}><span className="text-xs text-slate-500">{fmtDate(c.createdAt)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{contacts.data.total} contacts</span>
            <div className="flex gap-2">
              <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="self-center">Page {page} / {totalPages}</span>
              <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
      {creating ? <ContactForm onClose={() => setCreating(false)} onSaved={(id) => router.push(contactHref(base, id))} /> : null}
    </Panel>
  );
}

function ContactForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', mobile: '', city: '', state: '', email: '', companyName: '', contactTypes: [] as string[], notes: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const result = (await api.post('/crm/contacts', form)).data as { contact: { id: string }; created: boolean };
      toast.success(result.created ? 'Contact created.' : 'This mobile already exists — opened the existing contact.');
      onSaved(result.contact.id);
    } catch (error) {
      toast.error(crmError(error, 'Could not save the contact.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="New contact" onClose={onClose}>
      <div className="grid gap-3 p-5 sm:p-7 md:grid-cols-2">
        <Field label="Mobile *"><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className={inputClass} inputMode="tel" /></Field>
        <Field label="Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
        <Field label="Company"><input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputClass} /></Field>
        <Field label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <Field label="City"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} /></Field>
        <Field label="State"><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputClass} /></Field>
        <div className="md:col-span-2">
          <Field label="Contact type">
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_TYPES.map((t) => {
                const on = form.contactTypes.includes(t);
                return <button key={t} type="button" onClick={() => setForm({ ...form, contactTypes: on ? form.contactTypes.filter((x) => x !== t) : [...form.contactTypes, t] })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{label(t)}</button>;
              })}
            </div>
          </Field>
        </div>
        <Field label="Notes" wide><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} /></Field>
        <div className="md:col-span-2">
          <ModalFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" busy={busy} disabled={form.mobile.replace(/\D/g, '').length < 10} onClick={save}>Save</Button>
          </ModalFooter>
        </div>
      </div>
    </Modal>
  );
}
