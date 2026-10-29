'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { ArrowLeft, CalendarPlus, Crown, Edit3, Eye, MessageCircle, MousePointerClick, Phone, Plus, Search, StickyNote } from 'lucide-react';
import api from '@/lib/api';
import { Badge, Button, EmptyState, Field, inputClass, Modal, ModalFooter, Panel, Toggle } from '@/components/financeWorkspace/ui';
import { EditFollowUpModal, LogActivityModal, ScheduleFollowUpModal } from './CrmModals';
import { FollowUpRow } from './FollowUpRow';
import LeadForm from './LeadForm';
import {
  CONTACT_TYPES,
  CrmErrorBanner,
  CrmLoadingState,
  CrmSelect,
  crmError,
  CrmMetaProvider,
  fmtDate,
  fmtDateTime,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  phoneLinks,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type ContactLite,
  type FollowUp,
} from './crmShared';
import { LocationFields } from './LeadForm';
import { sanitizePhoneInput, validateContactPhones } from './contactFormState';

type Profile = {
  companyName: string | null; alternatePhone: string | null; address: string | null; pinCode: string | null; gstNumber: string | null; source: string | null;
  lifecycle: string; contactTypes: string[]; tags: string[]; notes: string | null; doNotContact: boolean; preferredLanguage: string | null; preferredChannel: string | null;
  owner: { id: string; name: string | null } | null; ownerId: string | null;
};
type Contact360 = {
  contact: ContactLite & { createdAt: string; crmProfile: Profile | null };
  pipelineStage: { code: string; name: string; color: string; isTerminal: boolean } | null;
  leads: Array<{ id: string; status: string; leadType: string; source: string; temperature: string; score: number; createdAt: string; nextFollowUpAt: string | null; listingTitleSnapshot: string | null; expectedValue: number | null; wonAmount: number | null; mergedIntoId: string | null; pipelineStage: { code: string; name: string; color: string; isTerminal: boolean } | null; owner: { name: string | null } | null }>;
  followUps: FollowUp[];
  activities: Array<{ id: string; type: string; title: string; content: string | null; createdAt: string }>;
  prime: { active: boolean; history: Array<{ id: string; status: string; startedAt: string | null; expiresAt: string | null; paidAmount: number | null }> } | null;
  payments: Array<{ id: string; status: string; amount: number | null; method: string; submittedAt: string; listing: { id: string; title: string } }>;
  deals: Array<{ id: string; recordNumber: string; listingTitle: string | null; vehicleNumber: string | null; sellAmount: number | null; purchaseAmount: number | null; dealStatus: string; side: string; createdAt: string }>;
  rto: Array<{ id: string; vehicleNumber: string; rtoStatus: string; rtoOffice: string; createdAt: string }>;
  interest: { listingViews: number; contactClicks: number; searches: Array<{ query: string | null; at: string }>; viewedListings: Array<{ id: string; title: string; price: number | null; status: string; locationCity: string }> } | null;
  finance: { parties: Array<{ id: string; name: string; code: string }>; receivable: number; payable: number; unavailable?: boolean } | null;
};

function View({ contactId }: { contactId: string }) {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const data = useCrmResource(() => getJson<Contact360>(`/crm/contacts/${contactId}`), `crm-contact-${contactId}`);
  const [modal, setModal] = useState<null | 'edit' | 'lead' | 'followup' | 'log'>(null);
  const [editingFollowUp, setEditingFollowUp] = useState<FollowUp | null>(null);
  if (data.loading && !data.data) return <CrmLoadingState label="Loading contact…" />;
  if (data.error || !data.data) return <CrmErrorBanner message={data.error || 'Contact not found.'} schemaMissing={data.schemaMissing} />;
  const c = data.data;
  const profile = c.contact.crmProfile;
  const links = phoneLinks(c.contact.mobile, c.contact.whatsappNumber);
  const adminPrefix = base.replace(/\/crm$/, '');
  const done = () => { setModal(null); data.reload(); };
  const canManage = Boolean(meta?.access.canManage && !meta.access.isPartner);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <Link href={`${base}/contacts`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to contacts</Link>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{c.contact.name || 'Unnamed contact'}</h1>
              {c.prime?.active ? <Badge tone="amber"><Crown className="mr-1 h-3 w-3" />Prime</Badge> : null}
              <Badge tone={profile?.lifecycle === 'CUSTOMER' ? 'green' : 'slate'}>Lifecycle: {label(profile?.lifecycle || 'LEAD')}</Badge>
              {c.pipelineStage ? <Badge tone={c.pipelineStage.isTerminal ? 'green' : 'blue'}>{c.pipelineStage.name}</Badge> : null}
              {profile?.doNotContact ? <Badge tone="red">Do not contact</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">{c.contact.mobile}{profile?.alternatePhone ? ` / ${profile.alternatePhone}` : ''}{c.contact.email ? ` · ${c.contact.email}` : ''}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {[profile?.companyName, [c.contact.city, c.contact.state].filter(Boolean).join(', '), profile?.contactTypes.map(label).join(', '), profile?.owner?.name ? `Owner ${profile.owner.name}` : null, `Since ${fmtDate(c.contact.createdAt)}`].filter(Boolean).join(' · ')}
            </p>
            {profile?.tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{profile.tags.map((t) => <Badge key={t} tone="violet">{t}</Badge>)}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {links.tel ? <a href={links.tel} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"><Phone className="h-4 w-4" />Call</a> : null}
            {links.wa ? <a href={links.wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />WhatsApp</a> : null}
          </div>
        </div>
        {canManage ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setModal('lead')}>New lead</Button>
            <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setModal('followup')}>Schedule follow-up</Button>
            <Button icon={<StickyNote className="h-4 w-4" />} onClick={() => setModal('log')}>Log activity</Button>
            <Button icon={<Edit3 className="h-4 w-4" />} onClick={() => setModal('edit')}>Edit profile</Button>
          </div>
        ) : null}
        {profile?.notes ? <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{profile.notes}</p> : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <Panel title={`Leads (${c.leads.length})`}>
            {c.leads.length ? (
              <ul className="divide-y divide-slate-100">
                {c.leads.map((l) => (
                  <li key={l.id}>
                    <Link href={leadHref(base, l.id)} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{LEAD_TYPE_LABELS[l.leadType] || l.leadType}{l.listingTitleSnapshot ? ` · ${l.listingTitleSnapshot}` : ''}</p>
                        <p className="text-xs text-slate-500">{label(l.source)} · {fmtDate(l.createdAt)} · {l.owner?.name || 'Unassigned'}{l.nextFollowUpAt ? ` · next ${fmtDateTime(l.nextFollowUpAt)}` : ''}{l.mergedIntoId ? ' · merged' : ''}</p>
                      </div>
                      <div className="flex shrink-0 gap-1.5"><TemperatureBadge temperature={l.temperature} score={l.score} /><StatusBadge status={l.status} name={l.pipelineStage?.name} /></div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title="No leads yet" />}
          </Panel>
          <Panel title="Follow-ups">
            {c.followUps.length ? <div className="divide-y divide-slate-100">{c.followUps.map((f) => <FollowUpRow key={f.id} followUp={{ ...f, contact: c.contact }} now={now} showOwner onEdit={canManage ? () => setEditingFollowUp(f) : undefined} />)}</div> : <EmptyState title="No follow-ups" />}
          </Panel>
          {c.activities.length ? (
            <Panel title="Contact notes & activity">
              <ul className="divide-y divide-slate-100">
                {c.activities.map((a) => <li key={a.id} className="px-4 py-3 text-sm"><p className="font-semibold text-slate-800">{a.title}</p>{a.content ? <p className="whitespace-pre-wrap text-slate-600">{a.content}</p> : null}<p className="text-[11px] text-slate-400">{fmtDateTime(a.createdAt)}</p></li>)}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          {c.interest ? (
            <Panel title="Website interest" description="Last 90 days">
              <div className="grid grid-cols-2 gap-3 p-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="flex items-center gap-1.5 text-xl font-bold text-slate-900"><Eye className="h-4 w-4 text-slate-400" />{c.interest.listingViews}</p><p className="text-xs text-slate-500">Listing views</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="flex items-center gap-1.5 text-xl font-bold text-slate-900"><MousePointerClick className="h-4 w-4 text-slate-400" />{c.interest.contactClicks}</p><p className="text-xs text-slate-500">Contact clicks</p></div>
              </div>
              {c.interest.viewedListings.length ? (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {c.interest.viewedListings.map((l) => <li key={l.id} className="flex justify-between gap-2 px-4 py-2 text-sm"><Link href={`${adminPrefix}/listings/${l.id}`} className="truncate text-slate-700 hover:underline">{l.title}</Link><span className="shrink-0 text-xs text-slate-500">{fmtInr(l.price)}</span></li>)}
                </ul>
              ) : null}
              {c.interest.searches.length ? <div className="flex flex-wrap gap-1.5 border-t border-slate-100 p-4">{c.interest.searches.map((s, i) => <span key={`${s.query}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600"><Search className="h-3 w-3" />{s.query}</span>)}</div> : null}
            </Panel>
          ) : null}
          {c.finance && (c.finance.parties.length || c.finance.unavailable) ? (
            <Panel title="Finance" description={c.finance.parties.map((p) => `${p.name} (${p.code})`).join(', ') || undefined}>
              {c.finance.unavailable ? <p className="p-4 text-xs text-slate-500">Finance workspace not available.</p> : (
                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="rounded-xl bg-slate-50 p-3"><p className={`text-lg font-bold ${c.finance.receivable > 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtInr(c.finance.receivable)}</p><p className="text-xs text-slate-500">Receivable (owes us)</p></div>
                  <div className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-bold text-slate-900">{fmtInr(c.finance.payable)}</p><p className="text-xs text-slate-500">Payable (we owe)</p></div>
                </div>
              )}
            </Panel>
          ) : null}
          {c.deals.length ? (
            <Panel title="Deals (sell accounts)">
              <ul className="divide-y divide-slate-100">{c.deals.map((d) => <li key={d.id}><Link href={`${adminPrefix}/accounts/sell-accounts/${d.id}`} className="flex justify-between gap-2 px-4 py-2.5 text-sm hover:bg-slate-50"><span className="truncate">{d.recordNumber} · {d.listingTitle || d.vehicleNumber || 'Vehicle'} <span className="text-xs text-slate-400">({d.side === 'BUYER' ? 'bought' : 'sold'})</span></span><span className="shrink-0 text-xs font-semibold">{fmtInr(d.side === 'BUYER' ? d.sellAmount : d.purchaseAmount)}</span></Link></li>)}</ul>
            </Panel>
          ) : null}
          {c.payments.length ? (
            <Panel title="Listing payments">
              <ul className="divide-y divide-slate-100">{c.payments.map((p) => <li key={p.id} className="flex justify-between gap-2 px-4 py-2.5 text-sm"><span className="truncate">{p.listing.title} <span className="text-xs text-slate-400">· {fmtDate(p.submittedAt)}</span></span><span className="shrink-0"><Badge tone={p.status === 'APPROVED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'}>{fmtInr(p.amount)} · {label(p.status)}</Badge></span></li>)}</ul>
            </Panel>
          ) : null}
          {c.prime?.history.length ? (
            <Panel title="Prime membership">
              <ul className="divide-y divide-slate-100">{c.prime.history.map((p) => <li key={p.id} className="flex justify-between px-4 py-2.5 text-sm"><span>{fmtDate(p.startedAt)} → {fmtDate(p.expiresAt)}</span><Badge tone={p.status === 'ACTIVE' ? 'green' : 'slate'}>{label(p.status)}</Badge></li>)}</ul>
            </Panel>
          ) : null}
          {c.rto.length ? (
            <Panel title="RTO work">
              <ul className="divide-y divide-slate-100">{c.rto.map((r) => <li key={r.id}><Link href={`${adminPrefix}/accounts/rto-work-status/${r.id}`} className="flex justify-between px-4 py-2.5 text-sm hover:bg-slate-50"><span>{r.vehicleNumber} · {r.rtoOffice}</span><Badge>{label(r.rtoStatus)}</Badge></Link></li>)}</ul>
            </Panel>
          ) : null}
        </div>
      </div>

      {modal === 'edit' ? <EditProfile contact={c.contact} pipelineStage={c.pipelineStage} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal === 'lead' ? <LeadForm presetContact={c.contact} onClose={() => setModal(null)} onCreated={(id) => router.push(leadHref(base, id))} /> : null}
      {modal === 'followup' ? <ScheduleFollowUpModal contactUserId={c.contact.id} onClose={() => setModal(null)} onDone={done} /> : null}
      {modal === 'log' ? <LogActivityModal endpoint={`/crm/contacts/${c.contact.id}/activities`} initialType="NOTE" onClose={() => setModal(null)} onDone={done} /> : null}
      {editingFollowUp ? <EditFollowUpModal followUp={{ ...editingFollowUp, contact: c.contact }} onClose={() => setEditingFollowUp(null)} onDone={() => { setEditingFollowUp(null); data.reload(); }} /> : null}
    </div>
  );
}

function EditProfile({ contact, pipelineStage, onClose, onDone }: { contact: Contact360['contact']; pipelineStage: Contact360['pipelineStage']; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const p = contact.crmProfile;
  const [form, setForm] = useState({
    name: contact.name || '', email: contact.email || '', city: contact.city || '', state: contact.state || '', whatsappNumber: contact.whatsappNumber || '',
    companyName: p?.companyName || '', alternatePhone: p?.alternatePhone || '', address: p?.address || '', pinCode: p?.pinCode || '', gstNumber: p?.gstNumber || '',
    lifecycle: p?.lifecycle || 'LEAD', contactTypes: p?.contactTypes || [], tags: p?.tags || [], notes: p?.notes || '', doNotContact: Boolean(p?.doNotContact),
    preferredLanguage: p?.preferredLanguage || '', ownerId: p?.ownerId || p?.owner?.id || '',
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const phoneError = validateContactPhones({
      mobile: sanitizePhoneInput(contact.mobile || ''),
      whatsappNumber: sanitizePhoneInput(form.whatsappNumber),
      alternatePhone: sanitizePhoneInput(form.alternatePhone),
    });
    if (phoneError) {
      toast.error(phoneError);
      return;
    }
    setBusy(true);
    try {
      const { ownerId, ...rest } = form;
      await api.patch(`/crm/contacts/${contact.id}`, { ...rest, ...(meta?.access.canAssign ? { ownerId: ownerId || null } : {}) });
      toast.success('Contact updated.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not update the contact.'));
    } finally {
      setBusy(false);
    }
  };
  const toggle = (key: 'contactTypes' | 'tags', value: string) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`;
  return (
    <Modal title="Edit contact" onClose={onClose} wide>
      <div className="grid gap-3 p-5 sm:p-7 md:grid-cols-3">
        <Field label="Mobile Number"><input value={contact.mobile || ''} readOnly className={`${inputClass} bg-slate-50 text-slate-500`} /></Field>
        <Field label="Full Name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
        <Field label="Company / Entity Name"><input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputClass} /></Field>
        <Field label="Email Address"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} /></Field>
        <Field label="Contact lifecycle"><CrmSelect options={(meta?.enums.lifecycles || []).map((l) => ({ id: l, name: label(l) }))} value={form.lifecycle} onChange={(next) => setForm({ ...form, lifecycle: next })} className="w-full" /></Field>
        {pipelineStage ? <Field label="Pipeline stage"><div className="flex h-9 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">{pipelineStage.name}</div></Field> : null}
        <Field label="WhatsApp Number"><input value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: sanitizePhoneInput(e.target.value) })} className={inputClass} inputMode="tel" maxLength={10} pattern="[6-9][0-9]{9}" autoComplete="tel-national" /></Field>
        <Field label="Alternate Phone"><input value={form.alternatePhone} onChange={(e) => setForm({ ...form, alternatePhone: sanitizePhoneInput(e.target.value) })} className={inputClass} inputMode="tel" maxLength={10} pattern="[6-9][0-9]{9}" autoComplete="tel-national" /></Field>
        <Field label="GSTIN"><input data-sanitize="gstin" value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} className={inputClass} /></Field>
        <div className="md:col-span-2"><LocationFields state={form.state} city={form.city} onStateChange={(next) => setForm((current) => ({ ...current, state: next, city: '' }))} onCityChange={(next) => setForm((current) => ({ ...current, city: next }))} /></div>
        <Field label="PIN code"><input data-sanitize="pincode" value={form.pinCode} onChange={(e) => setForm({ ...form, pinCode: e.target.value })} className={inputClass} /></Field>
        <div className="md:col-span-3"><Field label="Address"><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} /></Field></div>
        <div className="md:col-span-3"><Field label="Contact Classification"><div className="flex flex-wrap gap-1.5">{CONTACT_TYPES.map((t) => <button key={t} type="button" onClick={() => toggle('contactTypes', t)} className={chip(form.contactTypes.includes(t))}>{label(t)}</button>)}</div></Field></div>
        <div className="md:col-span-3"><Field label="Tags"><div className="flex flex-wrap gap-1.5">{[...new Set([...(meta?.config.tags || []), ...form.tags])].map((t) => <button key={t} type="button" onClick={() => toggle('tags', t)} className={chip(form.tags.includes(t))}>{t}</button>)}</div></Field></div>
        {meta?.access.canAssign ? (
          <Field label="Account owner"><CrmSelect options={[{ id: '', name: 'None' }, ...meta.staff.map((s) => ({ id: s.id, name: s.name }))]} value={form.ownerId} onChange={(next) => setForm({ ...form, ownerId: next })} searchable className="w-full" /></Field>
        ) : null}
        <Field label="Preferred language"><input value={form.preferredLanguage} onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })} className={inputClass} placeholder="Hindi / English…" /></Field>
        <div className="flex items-end pb-2"><Toggle checked={form.doNotContact} onChange={(v) => setForm({ ...form, doNotContact: v })} label="Do not contact (no automated messages)" /></div>
        <div className="md:col-span-3"><Field label="Notes"><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} placeholder="Fleet size, machinery interests, financial requirements..." /></Field></div>
        <div className="md:col-span-3">
          <ModalFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" busy={busy} onClick={save}>Save</Button>
          </ModalFooter>
        </div>
      </div>
    </Modal>
  );
}

export default function CrmContactDetail({ contactId }: { contactId: string }) {
  return <CrmMetaProvider><View contactId={contactId} /></CrmMetaProvider>;
}
