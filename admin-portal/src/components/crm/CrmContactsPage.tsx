'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  Building2,
  Crown,
  MessageCircle,
  Phone,
  Plus,
  Search,
  UserCheck,
  Users,
} from 'lucide-react';
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
  phoneLinks,
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
  crmProfile: {
    companyName: string | null;
    lifecycle: string;
    contactTypes: string[];
    tags: string[];
    doNotContact: boolean;
    owner: { id: string; name: string | null } | null;
  } | null;
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
  const contacts = useCrmResource(
    () => getJson<{ total: number; items: ContactRow[] }>('/crm/contacts', query),
    JSON.stringify(query),
  );
  const total = contacts.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Customer & Contact Directory"
        badgeText={`${total} Contacts Tracked`}
        description="Unified relationship directory of buyers, equipment owners, certified dealers, and financiers. Complete interaction history linked by mobile."
        actions={
          meta?.access.canManage && !meta.access.isPartner ? (
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCreating(true)}
            >
              Add New Contact
            </Button>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
        {/* FILTERS TOOLBAR */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3.5 sm:p-4 md:grid-cols-3 xl:grid-cols-[minmax(260px,2fr)_repeat(3,minmax(0,1fr))]">
          <form
            className="relative col-span-2 md:col-span-3 xl:col-span-1"
            onSubmit={(e) => {
              e.preventDefault();
              reset(() => setSearch(q));
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by customer name, mobile, company, city…"
              className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 py-1.5 pl-9 pr-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
              aria-label="Search contacts"
            />
          </form>

          <select
            value={lifecycle}
            onChange={(e) => reset(() => setLifecycle(e.target.value))}
            className={`${compactSelectClass} w-full`}
            aria-label="Stage"
          >
            <option value="">All Lifecycle Stages</option>
            {(meta?.enums.lifecycles || []).map((l) => (
              <option key={l} value={l}>
                {label(l)}
              </option>
            ))}
          </select>

          <select
            value={contactType}
            onChange={(e) => reset(() => setContactType(e.target.value))}
            className={`${compactSelectClass} w-full`}
            aria-label="Contact type"
          >
            <option value="">All Contact Types</option>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {label(t)}
              </option>
            ))}
          </select>

          <select
            value={openLeads}
            onChange={(e) => reset(() => setOpenLeads(e.target.value))}
            className={`${compactSelectClass} w-full`}
            aria-label="Leads"
          >
            <option value="">All Records</option>
            <option value="yes">Only With Active Leads</option>
          </select>
        </div>

        {/* METRIC STRIP */}
        <div className="flex items-center justify-between px-4 py-2 text-xs bg-slate-50/50">
          <span className="font-bold text-slate-800">
            {total} {total === 1 ? 'Contact' : 'Contacts'} Available
          </span>
          {search || lifecycle || contactType || openLeads ? (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setSearch('');
                setLifecycle('');
                setContactType('');
                setOpenLeads('');
                setPage(1);
              }}
              className="font-bold text-amber-700 hover:text-amber-800 text-[11px]"
            >
              Reset Filters
            </button>
          ) : null}
        </div>

        {contacts.loading && !contacts.data ? (
          <LoadingState label="Loading contacts directory…" />
        ) : contacts.error ? (
          <CrmErrorBanner message={contacts.error} schemaMissing={contacts.schemaMissing} />
        ) : !contacts.data?.items.length ? (
          <EmptyState
            title="No contacts found"
            description="Try modifying search keywords or add a new customer contact directly."
          />
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Customer Identity</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Role & Stage</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Lead History</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Next Follow-up</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Assigned To</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Created</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700 text-right">Quick Dial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.data.items.map((c) => {
                  const links = phoneLinks(c.mobile, c.whatsappNumber);
                  return (
                    <tr
                      key={c.id}
                      className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                      onClick={() => router.push(contactHref(base, c.id))}
                    >
                      <td className={cellClass}>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px] border border-slate-200">
                            {(c.name || c.mobile || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-bold text-slate-900 text-xs hover:text-amber-600 transition-colors">
                              {c.name || 'Unnamed Customer'}
                              {c.isPrime ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.2 text-[10px] font-bold uppercase text-amber-700 border border-amber-400/40">
                                  <Crown className="h-2.5 w-2.5 text-amber-600" />
                                  Prime
                                </span>
                              ) : null}
                              {c.crmProfile?.doNotContact ? (
                                <span className="rounded bg-rose-100 text-rose-700 px-1 py-0.2 text-[10px] font-bold uppercase">
                                  DND
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {c.mobile}
                              {c.crmProfile?.companyName ? ` · ${c.crmProfile.companyName}` : ''}
                              {c.city ? ` · ${c.city}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className={cellClass}>
                        <p className="text-[11px] font-bold text-slate-800">
                          {c.crmProfile?.contactTypes.map(label).join(', ') ||
                            (c.role === 'CUSTOMER' ? 'Customer' : label(c.role))}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.2 text-[10px] font-bold mt-0.5 ${
                            c.crmProfile?.lifecycle === 'CUSTOMER'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {label(c.crmProfile?.lifecycle || 'LEAD')}
                        </span>
                      </td>

                      <td className={cellClass}>
                        <span className="font-bold text-slate-900 text-xs">{c.openLeadCount}</span>
                        <span className="text-[11px] text-slate-500 font-medium"> open / {c.leadCount} total</span>
                      </td>

                      <td className={cellClass}>
                        <span className="text-[11px] font-semibold text-slate-700">
                          {fmtDateTime(c.nextFollowUpAt)}
                        </span>
                      </td>

                      <td className={cellClass}>
                        <span className="text-[11px] font-semibold text-slate-600">
                          {c.crmProfile?.owner?.name || '—'}
                        </span>
                      </td>

                      <td className={cellClass}>
                        <span className="text-[11px] text-slate-500">{fmtDate(c.createdAt)}</span>
                      </td>

                      <td className={`${cellClass} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {links.wa ? (
                            <a
                              href={links.wa}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {links.tel ? (
                            <a
                              href={links.tel}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Direct Phone Call"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* PAGINATION */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 gap-2">
              <span className="font-medium">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} contacts
              </span>
              <div className="flex items-center gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="font-bold text-slate-700">
                  Page {page} of {totalPages}
                </span>
                <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {creating ? (
        <ContactForm
          onClose={() => setCreating(false)}
          onSaved={(id) => router.push(contactHref(base, id))}
        />
      ) : null}
    </>
  );
}

function ContactForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    mobile: '',
    city: '',
    state: '',
    email: '',
    companyName: '',
    contactTypes: [] as string[],
    notes: '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const result = (await api.post('/crm/contacts', form)).data as {
        contact: { id: string };
        created: boolean;
      };
      toast.success(result.created ? 'Contact profile created.' : 'Mobile already exists — opened existing contact.');
      onSaved(result.contact.id);
    } catch (error) {
      toast.error(crmError(error, 'Could not save contact.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create New Customer / Contact" onClose={onClose}>
      <div className="grid gap-3 p-5 sm:p-6 md:grid-cols-2">
        <Field label="Mobile Number *">
          <input
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            className={inputClass}
            placeholder="e.g. 9876543210"
            inputMode="tel"
          />
        </Field>
        <Field label="Full Name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            placeholder="Customer or contact name"
          />
        </Field>
        <Field label="Company / Entity Name">
          <input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className={inputClass}
            placeholder="Enterprise or dealership name"
          />
        </Field>
        <Field label="Email Address">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
            placeholder="customer@domain.com"
          />
        </Field>
        <Field label="City">
          <input
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className={inputClass}
            placeholder="e.g. Raipur"
          />
        </Field>
        <Field label="State">
          <input
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            className={inputClass}
            placeholder="e.g. Chhattisgarh"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Contact Classification">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CONTACT_TYPES.map((t) => {
                const on = form.contactTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        contactTypes: on ? form.contactTypes.filter((x) => x !== t) : [...form.contactTypes, t],
                      })
                    }
                    className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                      on
                        ? 'border-slate-900 bg-slate-900 text-white shadow-2xs'
                        : 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label(t)}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <Field label="Initial Notes" wide>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={inputClass}
            placeholder="Fleet size, machinery interests, financial requirements..."
          />
        </Field>
        <div className="md:col-span-2">
          <ModalFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={form.mobile.replace(/\D/g, '').length < 10}
              onClick={save}
            >
              Save Contact
            </Button>
          </ModalFooter>
        </div>
      </div>
    </Modal>
  );
}

export default function CrmContactsPage() {
  return (
    <CrmPageFrame>
      <Contacts />
    </CrmPageFrame>
  );
}
