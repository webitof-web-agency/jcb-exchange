'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { Crown, Plus, Search } from 'lucide-react';
import api from '@/lib/api';
import { Badge, Button, cellClass, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, tableHeadClass } from '@/components/financeWorkspace/ui';
import {
  compactSelectClass,
  contactHref,
  CONTACT_TYPES,
  CrmErrorBanner,
  crmError,
  CrmPageFrame,
  fmtDate,
  fmtDateTime,
  getJson,
  label,
  PageHeader,
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

const PAGE_SIZE = 50;

function Contacts() {
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
  const query = { q: search, lifecycle, contactType, openLeads, page, pageSize: PAGE_SIZE };
  const contacts = useCrmResource(() => getJson<{ total: number; items: ContactRow[] }>('/crm/contacts', query), JSON.stringify(query));
  const total = contacts.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Buyers, sellers, dealers and financiers — one profile per mobile number with the full history."
        actions={meta?.access.canManage && !meta.access.isPartner ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New contact</Button> : undefined}
      />
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-4 md:grid-cols-3 xl:grid-cols-[minmax(260px,2fr)_repeat(3,minmax(0,1fr))]">
          <form className="relative col-span-2 md:col-span-3 xl:col-span-1" onSubmit={(e) => { e.preventDefault(); reset(() => setSearch(q)); }}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, mobile, company, city…" className={`${inputClass} py-2 pl-9`} aria-label="Search contacts" />
          </form>
          <select value={lifecycle} onChange={(e) => reset(() => setLifecycle(e.target.value))} className={`${compactSelectClass} w-full`} aria-label="Stage">
            <option value="">Any stage</option>
            {(meta?.enums.lifecycles || []).map((l) => <option key={l} value={l}>{label(l)}</option>)}
          </select>
          <select value={contactType} onChange={(e) => reset(() => setContactType(e.target.value))} className={`${compactSelectClass} w-full`} aria-label="Contact type">
            <option value="">Any type</option>
            {CONTACT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
          <select value={openLeads} onChange={(e) => reset(() => setOpenLeads(e.target.value))} className={`${compactSelectClass} w-full`} aria-label="Leads">
            <option value="">All contacts</option>
            <option value="yes">With open leads</option>
          </select>
        </div>
        <p className="px-4 py-2.5 text-sm font-semibold text-slate-700">{total} {total === 1 ? 'contact' : 'contacts'}</p>
        {contacts.loading && !contacts.data ? <LoadingState /> : contacts.error ? <CrmErrorBanner message={contacts.error} schemaMissing={contacts.schemaMissing} /> : !contacts.data?.items.length ? (
          <EmptyState title="No contacts found" />
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[960px] text-left text-sm">
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
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
              <div className="flex items-center gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {page} / {totalPages}</span>
                <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </div>
        )}
      </section>
      {creating ? <ContactForm onClose={() => setCreating(false)} onSaved={(id) => router.push(contactHref(base, id))} /> : null}
    </>
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

export default function CrmContactsPage() {
  return <CrmPageFrame><Contacts /></CrmPageFrame>;
}
