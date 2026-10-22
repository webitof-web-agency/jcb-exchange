'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'react-toastify';
import {
  ArrowLeft, Bell, CalendarPlus, CheckCircle2, Clock, Copy, Edit3, ExternalLink, GitMerge, IndianRupee, MessageCircle, MessageSquareText,
  Phone, PhoneCall, Receipt, Send, Shuffle, StickyNote, Truck, UserCog, XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { Badge, Button, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, Toggle } from '@/components/financeWorkspace/ui';
import { AssignModal, CompleteFollowUpModal, LogActivityModal, RescheduleModal, ScheduleFollowUpModal, StatusChangeModal } from './CrmModals';
import { FollowUpRow } from './FollowUpRow';
import { emptyRequirement, RequirementFields, requirementPayload, type RequirementState } from './LeadForm';
import {
  contactHref,
  CrmErrorBanner,
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
  PriorityBadge,
  selectClass,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type FollowUp,
  type LeadRow,
} from './crmShared';

type Activity = { id: string; type: string; title: string; content: string | null; metadata: Record<string, unknown> | null; createdAt: string; actor: { id: string; name: string | null; role: string } | null };
type LeadDetail = LeadRow & {
  categoryId: string | null; brandId: string | null; modelId: string | null; yearFrom: number | null; yearTo: number | null; requirementNotes: string | null;
  matchAlertsEnabled: boolean; enquiryType: string; assignedAt: string | null; wonSellAccountId: string | null;
  customer: LeadRow['customer'] & { crmProfile: { companyName: string | null; lifecycle: string; tags: string[]; doNotContact: boolean; notes: string | null; alternatePhone: string | null } | null };
  dealer: LeadRow['dealer'] & { mobile: string | null; whatsappNumber: string | null };
  listing: { id: string; title: string; price: number | null; status: string; manufacturingYear: number; locationCity: string; locationState: string; brand: { name: string }; model: { name: string }; category: { name: string } } | null;
  activities: Activity[];
  followUps: FollowUp[];
  requirement: { category: { name: string } | null; brand: { name: string } | null; model: { name: string } | null };
  wonDeal: { id: string; recordNumber: string; listingTitle: string | null; sellAmount: number | null } | null;
};
type Match = { id: string; title: string; price: number; manufacturingYear: number; locationCity: string; locationState: string; matchScore: number; operatingHours: number | null };
type Payment = { id: string; status: string; amount: number | null; method: string; transactionRef: string | null; paymentNote: string | null; receiptUrl: string | null; submittedAt: string; rejectionReason: string | null };
type Detail = { lead: LeadDetail; otherLeads: Array<{ id: string; status: string; leadType: string; createdAt: string; listingTitleSnapshot: string | null }>; matches: Match[]; payments: Payment[] };

const STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'INTERESTED', 'INSPECTION_SCHEDULED', 'NEGOTIATION'];

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  CALL: PhoneCall, WHATSAPP: MessageCircle, SMS: MessageSquareText, NOTE: StickyNote, FOLLOW_UP: Bell, STATUS_CHANGE: Shuffle,
  ASSIGNED: UserCog, CREATED: CheckCircle2, MERGED: GitMerge, VISIT: Truck, INSPECTION: Truck, MEETING: UserCog, UPDATED: Edit3, ROUTING_UPDATE: Send,
};

function StageStepper({ status }: { status: string }) {
  const closed = status === 'WON' || status === 'LOST';
  const index = STAGES.indexOf(status);
  return (
    <ol className="flex gap-1 overflow-x-auto">
      {STAGES.map((stage, i) => {
        const done = closed ? status === 'WON' : index >= 0 && i <= index;
        return (
          <li key={stage} className={`flex-1 shrink-0 rounded-lg px-2 py-1.5 text-center text-[11px] font-bold ${stage === status ? 'bg-slate-900 text-white' : done ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-400'}`}>{label(stage)}</li>
        );
      })}
      <li className={`shrink-0 rounded-lg px-3 py-1.5 text-center text-[11px] font-bold ${status === 'WON' ? 'bg-emerald-600 text-white' : status === 'LOST' ? 'bg-red-600 text-white' : status === 'ON_HOLD' ? 'bg-slate-500 text-white' : 'bg-slate-100 text-slate-400'}`}>{status === 'LOST' ? 'Lost' : status === 'ON_HOLD' ? 'On hold' : 'Won'}</li>
    </ol>
  );
}

function Detail({ leadId }: { leadId: string }) {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const user = useAuthStore((s) => s.user);
  const [now] = useState(() => Date.now());
  const data = useCrmResource(() => getJson<Detail>(`/crm/leads/${leadId}`), `crm-lead-${leadId}`);
  const [modal, setModal] = useState<null | 'status' | 'schedule' | 'log' | 'assign' | 'edit' | 'merge' | 'template'>(null);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [logType, setLogType] = useState('CALL');
  const close = () => setModal(null);
  const done = () => { setModal(null); setCompleting(null); setRescheduling(null); data.reload(); };

  if (data.loading && !data.data) return <LoadingState label="Loading lead…" />;
  if (data.error || !data.data) return <CrmErrorBanner message={data.error || 'Lead not found.'} schemaMissing={data.schemaMissing} />;
  const { lead, otherLeads, matches, payments } = data.data;
  const access = meta?.access;
  const isPartner = Boolean(access?.isPartner);
  const open = lead.status !== 'WON' && lead.status !== 'LOST';
  const links = phoneLinks(lead.customer.mobile, lead.customer.whatsappNumber);
  const pending = lead.followUps.filter((f) => f.status === 'PENDING' || f.status === 'MISSED').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const history = lead.followUps.filter((f) => f.status === 'DONE' || f.status === 'CANCELLED');
  const backHref = isPartner ? '/partner/leads' : `${base}/leads`;
  const canVerifyPayment = user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions, ['listings.verify_payment']);
  const adminPrefix = base.replace(/\/crm$/, '');
  const logWith = (type: string) => { setLogType(type); setModal('log'); };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to leads</Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                {isPartner ? (lead.customer.name || 'Customer') : <Link href={contactHref(base, lead.customer.id)} className="hover:underline">{lead.customer.name || 'Customer'}</Link>}
              </h1>
              <StatusBadge status={lead.status} />
              <TemperatureBadge temperature={lead.temperature} score={lead.score} />
              <PriorityBadge priority={lead.priority} />
              {lead.customer.crmProfile?.doNotContact ? <Badge tone="red">Do not contact</Badge> : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {lead.customer.mobile}
              <button type="button" onClick={() => { void navigator.clipboard.writeText(lead.customer.mobile || ''); toast.success('Copied.'); }} className="ml-1.5 align-middle text-slate-400 hover:text-slate-700" aria-label="Copy mobile"><Copy className="inline h-3.5 w-3.5" /></button>
              {lead.customer.city ? ` · ${lead.customer.city}` : ''}{lead.customer.state ? `, ${lead.customer.state}` : ''}
              {lead.customer.crmProfile?.companyName ? ` · ${lead.customer.crmProfile.companyName}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType} · {label(lead.source)} · created {fmtDateTime(lead.createdAt)}
              {!isPartner ? ` · ${lead.dealer.role === 'PARTNER' ? `routed to partner ${lead.dealer.name}` : 'platform lead'}` : ''}
              {lead.slaBreachedAt && !lead.firstResponseAt ? <span className="ml-1 font-bold text-red-600">· SLA missed</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {links.tel ? <a href={links.tel} onClick={() => setTimeout(() => logWith('CALL'), 400)} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"><Phone className="h-4 w-4" />Call</a> : null}
            {links.wa ? <a href={links.wa} target="_blank" rel="noreferrer" onClick={() => setTimeout(() => logWith('WHATSAPP'), 400)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"><MessageCircle className="h-4 w-4" />WhatsApp</a> : null}
            {access?.canManage ? <Button variant="primary" icon={<Shuffle className="h-4 w-4" />} onClick={() => setModal('status')}>Change status</Button> : null}
          </div>
        </div>
        <div className="mt-4"><StageStepper status={lead.status} /></div>
        {access?.canManage ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {open ? <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setModal('schedule')}>Schedule follow-up</Button> : null}
            <Button icon={<StickyNote className="h-4 w-4" />} onClick={() => logWith('NOTE')}>Log activity</Button>
            <Button icon={<Edit3 className="h-4 w-4" />} onClick={() => setModal('edit')}>Edit details</Button>
            {access.canAssign ? <Button icon={<UserCog className="h-4 w-4" />} onClick={() => setModal('assign')}>{lead.owner ? `Owner: ${lead.owner.name}` : 'Assign owner'}</Button> : !isPartner ? <span className="self-center text-xs text-slate-500">Owner: {lead.owner?.name || 'Unassigned'}</span> : null}
            {!isPartner ? <Button icon={<Send className="h-4 w-4" />} onClick={() => setModal('template')}>Send WhatsApp template</Button> : null}
            {!isPartner && otherLeads.length ? <Button icon={<GitMerge className="h-4 w-4" />} onClick={() => setModal('merge')}>Merge duplicate</Button> : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <Panel title="Next steps" description={open ? (pending.length ? undefined : 'No follow-up planned — schedule one so this lead is not forgotten.') : 'Lead is closed.'}>
            {pending.length ? (
              <div className="divide-y divide-slate-100">{pending.map((f) => <FollowUpRow key={f.id} followUp={{ ...f, contact: lead.customer, lead: { id: lead.id, status: lead.status, leadType: lead.leadType, priority: lead.priority, temperature: lead.temperature, listingTitleSnapshot: lead.listingTitleSnapshot } }} now={now} showOwner={!isPartner} onComplete={access?.canManage ? () => setCompleting(f) : undefined} onReschedule={access?.canManage ? () => setRescheduling(f) : undefined} />)}</div>
            ) : open && access?.canManage ? <EmptyState title="Nothing planned" action={<Button variant="primary" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setModal('schedule')}>Schedule follow-up</Button>} /> : null}
          </Panel>

          <Panel title="Timeline" description="Calls, messages, follow-ups, status changes and notes.">
            {lead.activities.length ? (
              <ol className="relative space-y-0 p-4">
                {lead.activities.map((a, index) => {
                  const Icon = ACTIVITY_ICON[a.type] || Clock;
                  const meta2 = a.metadata || {};
                  const duration = typeof meta2.durationSec === 'number' ? `${Math.round((meta2.durationSec as number) / 60)} min` : null;
                  return (
                    <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {index < lead.activities.length - 1 ? <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-slate-200" aria-hidden /> : null}
                      <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">{a.title}{duration ? <span className="ml-1.5 text-xs font-normal text-slate-500">({duration}{meta2.direction === 'INBOUND' ? ', incoming' : ''})</span> : null}</p>
                        {a.content ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p> : null}
                        <p className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(a.createdAt)} · {a.actor?.name || (meta2.automated ? 'Automation' : 'System')}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : <EmptyState title="No activity yet" />}
          </Panel>

          {history.length ? (
            <Panel title="Completed follow-ups">
              <div className="divide-y divide-slate-100">{history.map((f) => <FollowUpRow key={f.id} followUp={{ ...f, contact: lead.customer, lead: { id: lead.id, status: lead.status, leadType: lead.leadType, priority: lead.priority, temperature: lead.temperature, listingTitleSnapshot: lead.listingTitleSnapshot } }} now={now} showOwner={!isPartner} />)}</div>
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          <Panel title={lead.leadType === 'SELL' ? 'Machine to buy from customer' : 'Requirement'} actions={access?.canManage ? <button type="button" onClick={() => setModal('edit')} className="text-xs font-semibold text-amber-700 hover:underline">Edit</button> : undefined}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
              {[
                ['Category', lead.requirement.category?.name],
                ['Brand / model', [lead.requirement.brand?.name, lead.requirement.model?.name].filter(Boolean).join(' ') || null],
                ['Year', lead.yearFrom || lead.yearTo ? `${lead.yearFrom || '…'} – ${lead.yearTo || '…'}` : null],
                ['Budget', lead.budgetMin || lead.budgetMax ? `${lead.budgetMin ? fmtInr(lead.budgetMin) : '…'} – ${lead.budgetMax ? fmtInr(lead.budgetMax) : '…'}` : null],
                ['Location', [lead.requirementCity, lead.requirementState].filter(Boolean).join(', ') || null],
                ['Expected value', lead.expectedValue ? fmtInr(lead.expectedValue) : null],
              ].map(([k, v]) => <div key={k as string}><dt className="text-[11px] font-semibold uppercase text-slate-400">{k}</dt><dd className="text-slate-800">{v || '—'}</dd></div>)}
            </dl>
            {lead.requirementNotes || lead.message ? <p className="whitespace-pre-wrap border-t border-slate-100 px-4 py-3 text-sm text-slate-600">{lead.requirementNotes || lead.message}</p> : null}
            {lead.tags.length ? <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-4 py-3">{lead.tags.map((t) => <Badge key={t} tone="violet">{t}</Badge>)}</div> : null}
            {lead.status === 'LOST' && lead.lostReason ? <p className="border-t border-slate-100 px-4 py-3 text-sm text-red-700">Lost: {lead.lostReason}</p> : null}
            {lead.status === 'WON' ? <p className="border-t border-slate-100 px-4 py-3 text-sm font-semibold text-emerald-700">Won{lead.wonAmount ? ` · ${fmtInr(lead.wonAmount)}` : ''}{lead.wonDeal ? ` · ${lead.wonDeal.recordNumber}` : ''}</p> : null}
          </Panel>

          {lead.listing ? (
            <Panel title="Enquired machine">
              <div className="p-4 text-sm">
                <p className="font-semibold text-slate-900">{lead.listing.title}</p>
                <p className="text-xs text-slate-500">{lead.listing.brand.name} {lead.listing.model.name} · {lead.listing.manufacturingYear} · {lead.listing.locationCity}</p>
                <p className="mt-1 font-semibold text-slate-800">{fmtInr(lead.listing.price)} <Badge>{label(lead.listing.status)}</Badge></p>
                {!isPartner ? <Link href={`${adminPrefix}/listings/${lead.listing.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:underline"><ExternalLink className="h-3.5 w-3.5" />Open listing</Link> : null}
              </div>
            </Panel>
          ) : null}

          {!isPartner && payments.length ? (
            <PaymentsPanel payments={payments} canVerify={canVerifyPayment} onChanged={data.reload} paymentHref={(id) => `${adminPrefix}/listings/payments/${id}`} />
          ) : null}

          {!isPartner ? (
            <Panel title="Matching machines" description={lead.matchAlertsEnabled ? 'Alerts on: new matches are sent to the customer (when automation is on).' : 'Published listings that fit the requirement.'}>
              {matches.length ? (
                <ul className="divide-y divide-slate-100">
                  {matches.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <div className="min-w-0"><Link href={`${adminPrefix}/listings/${m.id}`} className="block truncate font-semibold text-slate-800 hover:underline">{m.title}</Link><p className="text-xs text-slate-500">{m.manufacturingYear} · {m.locationCity} · {fmtInr(m.price)}</p></div>
                      <Badge tone={m.matchScore >= 80 ? 'green' : 'slate'}>{m.matchScore}%</Badge>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No matches" description="Add category, brand, budget or year to the requirement." />}
            </Panel>
          ) : null}

          {otherLeads.length ? (
            <Panel title="Other leads of this customer">
              <ul className="divide-y divide-slate-100">
                {otherLeads.map((o) => <li key={o.id}><Link href={leadHref(base, o.id)} className="flex justify-between gap-2 px-4 py-2.5 text-sm hover:bg-slate-50"><span className="truncate">{LEAD_TYPE_LABELS[o.leadType] || o.leadType}{o.listingTitleSnapshot ? ` · ${o.listingTitleSnapshot}` : ''} <span className="text-xs text-slate-400">{fmtDate(o.createdAt)}</span></span><StatusBadge status={o.status} /></Link></li>)}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      {modal === 'status' ? <StatusChangeModal leadId={lead.id} currentStatus={lead.status} onClose={close} onDone={done} /> : null}
      {modal === 'schedule' ? <ScheduleFollowUpModal leadId={lead.id} onClose={close} onDone={done} /> : null}
      {modal === 'log' ? <LogActivityModal endpoint={`/crm/leads/${lead.id}/activities`} initialType={logType} onClose={close} onDone={done} /> : null}
      {modal === 'assign' ? <AssignModal leadIds={[lead.id]} currentOwnerId={lead.owner?.id ?? null} onClose={close} onDone={done} /> : null}
      {modal === 'edit' ? <EditLeadModal lead={lead} onClose={close} onDone={done} /> : null}
      {modal === 'merge' ? <MergeModal leadId={lead.id} others={otherLeads} onClose={close} /> : null}
      {modal === 'template' ? <TemplateModal leadId={lead.id} onClose={close} onDone={done} /> : null}
      {completing ? <CompleteFollowUpModal followUp={{ ...completing, contact: lead.customer }} leadStatus={lead.status} onClose={() => setCompleting(null)} onDone={done} /> : null}
      {rescheduling ? <RescheduleModal followUp={rescheduling} onClose={() => setRescheduling(null)} onDone={done} /> : null}
    </div>
  );
}

function PaymentsPanel({ payments, canVerify, onChanged, paymentHref }: { payments: Payment[]; canVerify: boolean; onChanged: () => void; paymentHref: (id: string) => string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const update = async (payment: Payment, status: 'APPROVED' | 'REJECTED') => {
    const rejectionReason = status === 'REJECTED' ? window.prompt('Why is this payment being declined?')?.trim() : '';
    if (status === 'REJECTED' && !rejectionReason) return;
    setBusy(payment.id);
    try {
      await api.patch(`/superadmin/listing-payments/${payment.id}/status`, { status, rejectionReason });
      toast.success(status === 'APPROVED' ? 'Payment approved.' : 'Payment declined.');
      onChanged();
    } catch (error) {
      toast.error(crmError(error, 'Could not update the payment.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel title="Listing payments" description="Payments this customer submitted for the enquired machine.">
      <ul className="divide-y divide-slate-100">
        {payments.map((p) => (
          <li key={p.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900"><IndianRupee className="mr-0.5 inline h-3.5 w-3.5" />{fmtInr(p.amount)} <span className="text-xs font-normal text-slate-500">{label(p.method)} · {fmtDateTime(p.submittedAt)}</span></p>
              <Badge tone={p.status === 'APPROVED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'}>{label(p.status)}</Badge>
            </div>
            {p.transactionRef ? <p className="text-xs text-slate-500">UTR / ref: {p.transactionRef}</p> : null}
            {p.rejectionReason ? <p className="text-xs text-red-600">{p.rejectionReason}</p> : null}
            <div className="flex flex-wrap gap-2">
              {p.receiptUrl ? <a href={getAbsoluteFileUrl(p.receiptUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline"><Receipt className="h-3.5 w-3.5" />Receipt</a> : null}
              <Link href={paymentHref(p.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:underline"><ExternalLink className="h-3.5 w-3.5" />Details</Link>
              {canVerify && p.status === 'PENDING_VERIFICATION' ? (
                <>
                  <Button variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} busy={busy === p.id} onClick={() => update(p, 'APPROVED')}>Approve</Button>
                  <Button variant="danger" icon={<XCircle className="h-4 w-4" />} busy={busy === p.id} onClick={() => update(p, 'REJECTED')}>Decline</Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function EditLeadModal({ lead, onClose, onDone }: { lead: LeadDetail; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const [leadType, setLeadType] = useState(lead.leadType);
  const [priority, setPriority] = useState(lead.priority);
  const [source, setSource] = useState(lead.source);
  const [expectedValue, setExpectedValue] = useState(lead.expectedValue ? String(lead.expectedValue) : '');
  const [tags, setTags] = useState<string[]>(lead.tags);
  const [alerts, setAlerts] = useState(lead.matchAlertsEnabled);
  const [requirement, setRequirement] = useState<RequirementState>({
    ...emptyRequirement(),
    categoryId: lead.categoryId || '', brandId: lead.brandId || '', modelId: lead.modelId || '',
    yearFrom: lead.yearFrom ? String(lead.yearFrom) : '', yearTo: lead.yearTo ? String(lead.yearTo) : '',
    budgetMin: lead.budgetMin ? String(lead.budgetMin) : '', budgetMax: lead.budgetMax ? String(lead.budgetMax) : '',
    requirementCity: lead.requirementCity || '', requirementState: lead.requirementState || '', requirementNotes: lead.requirementNotes || '',
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/crm/leads/${lead.id}`, { leadType, priority, source, expectedValue: expectedValue ? Number(expectedValue) : null, tags, matchAlertsEnabled: alerts, ...requirementPayload(requirement) });
      toast.success('Lead updated.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not update the lead.'));
    } finally {
      setBusy(false);
    }
  };
  const tagOptions = [...new Set([...(meta?.config.tags || []), ...tags])];
  return (
    <Modal title="Edit lead" onClose={onClose} wide>
      <div className="space-y-5 p-5 sm:p-7">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Lead type"><select value={leadType} onChange={(e) => setLeadType(e.target.value)} className={selectClass}>{(meta?.enums.leadTypes || []).map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t] || t}</option>)}</select></Field>
          <Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>{(meta?.enums.priorities || []).map((p) => <option key={p} value={p}>{label(p)}</option>)}</select></Field>
          <Field label="Source"><select value={source} onChange={(e) => setSource(e.target.value)} className={selectClass}>{[...new Set([...(meta?.config.sources || []), source])].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></Field>
          <Field label="Expected value (₹)"><input type="number" min={0} value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} className={inputClass} /></Field>
        </div>
        <RequirementFields value={requirement} onChange={setRequirement} />
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5">{tagOptions.map((t) => { const on = tags.includes(t); return <button key={t} type="button" onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{t}</button>; })}</div>
        </Field>
        {!meta?.access.isPartner ? <Toggle checked={alerts} onChange={setAlerts} label="Send the customer new matching machines (WhatsApp/SMS, when automation is on)" /> : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={save}>Save</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function MergeModal({ leadId, others, onClose }: { leadId: string; others: Detail['otherLeads']; onClose: () => void }) {
  const { base } = useCrmBase();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const merge = async () => {
    setBusy(true);
    try {
      await api.post(`/crm/leads/${leadId}/merge`, { targetId });
      toast.success('Merged. This lead is closed as a duplicate.');
      window.location.href = leadHref(base, targetId);
    } catch (error) {
      toast.error(crmError(error, 'Could not merge.'));
      setBusy(false);
    }
  };
  return (
    <Modal title="Merge into another lead" subtitle="Timeline and follow-ups move to the lead you keep; this one closes as a duplicate." onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="Keep this lead *">
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={selectClass}>
            <option value="">Choose…</option>
            {others.map((o) => <option key={o.id} value={o.id}>{LEAD_TYPE_LABELS[o.leadType] || o.leadType} · {label(o.status)} · {fmtDate(o.createdAt)}{o.listingTitleSnapshot ? ` · ${o.listingTitleSnapshot}` : ''}</option>)}
          </select>
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" busy={busy} disabled={!targetId} onClick={merge}>Merge</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function TemplateModal({ leadId, onClose, onDone }: { leadId: string; onClose: () => void; onDone: () => void }) {
  const templates = useCrmResource(() => getJson<Array<{ id: string; name: string; language: string; category: string; needsVariables: boolean }>>('/crm/templates'), 'crm-templates');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const usable = (templates.data || []).filter((t) => !t.needsVariables);
  const send = async () => {
    setBusy(true);
    try {
      const result = (await api.post(`/crm/leads/${leadId}/whatsapp`, { templateId })).data as { sent: boolean; error: string | null };
      if (result.sent) toast.success('WhatsApp sent.'); else toast.error(result.error || 'Not delivered — check WhatsApp logs.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not send.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Send WhatsApp template" subtitle="Approved templates without variables. For a free-text chat use the WhatsApp button." onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        {templates.loading ? <LoadingState /> : !usable.length ? <EmptyState title="No sendable templates" description="Approve a template without {{variables}} in Meta and sync it on the WhatsApp page." /> : (
          <Field label="Template">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={selectClass}>
              <option value="">Choose…</option>
              {usable.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language}) · {label(t.category)}</option>)}
            </select>
          </Field>
        )}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Send className="h-4 w-4" />} busy={busy} disabled={!templateId} onClick={send}>Send</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export default function CrmLeadDetail({ leadId }: { leadId: string }) {
  return <CrmMetaProvider><Detail leadId={leadId} /></CrmMetaProvider>;
}
