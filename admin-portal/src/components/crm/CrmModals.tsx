'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { ArrowRightLeft, CalendarClock, Check, CheckCircle2, Edit3, IndianRupee, PackageX, Search, Truck } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { getAccountCreatePermissions } from '@/lib/accountsPermissions';
import { Button, Field, inputClass, Modal, ModalFooter } from '@/components/financeWorkspace/ui';
import {
  crmError,
  crmErrorCode,
  CrmSelect,
  fmtInr,
  fromLocalInput,
  label,
  OUTCOME_LABELS,
  quickTimes,
  toLocalInput,
  useCrmBase,
  useCrmMeta,
  type FollowUp,
} from './crmShared';

export type NextStep = { type: string; dueAt: string; notes: string };

export const emptyNextStep = (type = 'CALL'): NextStep => ({ type, dueAt: '', notes: '' });

/** Follow-up type + when + note, with quick time picks. */
export function NextStepFields({ value, onChange, required, title = 'Next follow-up' }: { value: NextStep; onChange: (next: NextStep) => void; required?: boolean; title?: string }) {
  const { meta } = useCrmMeta();
  const types = meta?.enums.followUpTypes || ['CALL', 'WHATSAPP', 'SMS', 'VISIT', 'INSPECTION', 'MEETING', 'EMAIL', 'PAYMENT', 'OTHER'];
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock className="h-4 w-4 text-amber-600" />{title}{required ? <span className="text-xs font-semibold text-red-600">required</span> : null}</p>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Type">
          <CrmSelect options={types.map((t) => ({ id: t, name: label(t) }))} value={value.type} onChange={(next) => onChange({ ...value, type: next })} className="w-full" />
        </Field>
        <Field label={required ? 'When *' : 'When'}>
          <input type="datetime-local" value={value.dueAt} min={toLocalInput(new Date())} onChange={(e) => onChange({ ...value, dueAt: e.target.value })} className={inputClass} />
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {quickTimes().map((q) => (
          <button key={q.label} type="button" onClick={() => onChange({ ...value, dueAt: q.value })} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{q.label}</button>
        ))}
      </div>
      <div className="mt-3">
        <Field label="Note for that follow-up">
          <input value={value.notes} onChange={(e) => onChange({ ...value, notes: e.target.value })} className={inputClass} placeholder="e.g. Share 2 more 3DX options" />
        </Field>
      </div>
    </div>
  );
}

const nextPayload = (step: NextStep) => (step.dueAt ? { type: step.type, dueAt: fromLocalInput(step.dueAt), notes: step.notes || undefined } : undefined);

const QUICK_REASONS = [
  'Budget did not match',
  'Preferred a different make/model',
  'Enquired machine was already sold',
  'Wanted fewer operating hours',
  'Needed a higher capacity machine',
];

type SoldVehicleMode = 'ENQUIRED' | 'ALTERNATE' | 'OFF_INVENTORY';

/** The lead fields the status modal reads (detail and pipeline leads both fit). */
type StatusModalLead = {
  listingId?: string | null;
  listingTitleSnapshot?: string | null;
  listingPriceSnapshot?: number | string | null;
  listingLocationCitySnapshot?: string | null;
  listingLocationStateSnapshot?: string | null;
  wonAmount?: number | string | null;
  listing?: { id: string; title?: string | null; price?: number | null; locationCity?: string | null; locationState?: string | null } | null;
};

type InventoryItem = {
  id: string;
  title: string;
  status: string;
  price: number;
  manufacturingYear?: number | null;
  locationCity?: string | null;
  locationState?: string | null;
  categoryName?: string;
};

export function StatusChangeModal({
  leadId,
  currentStatus,
  initialStatus,
  lead,
  onClose,
  onDone,
}: {
  leadId: string;
  currentStatus: string;
  initialStatus?: string;
  lead?: StatusModalLead;
  onClose: () => void;
  onDone: () => void;
}) {
  const { meta } = useCrmMeta();
  const router = useRouter();
  const { base, isPartnerPortal } = useCrmBase();
  const user = useAuthStore((s) => s.user);
  // Same rule as the Accounts → Sold Vehicles create page.
  const canCreateSoldVehicle = !isPartnerPortal && (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || hasAnyPermission(user?.permissions || [], getAccountCreatePermissions('sell-accounts')));
  const [status, setStatus] = useState(initialStatus || currentStatus);
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');

  // The machine the customer enquired about, if any
  const enquiredListingId: string | null = lead?.listingId || lead?.listing?.id || null;
  const enquiredListingTitle: string = lead?.listingTitleSnapshot || lead?.listing?.title || '';
  const enquiredPrice = Number(lead?.listingPriceSnapshot || lead?.listing?.price || 0);
  const enquiredLocation = [
    lead?.listingLocationCitySnapshot || lead?.listing?.locationCity,
    lead?.listingLocationStateSnapshot || lead?.listing?.locationState,
  ].filter(Boolean).join(', ');

  const [mode, setMode] = useState<SoldVehicleMode>(enquiredListingId ? 'ENQUIRED' : 'ALTERNATE');
  const [wonAmount, setWonAmount] = useState(() => (lead?.wonAmount ? String(lead.wonAmount) : enquiredPrice ? String(enquiredPrice) : ''));
  const [alternate, setAlternate] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [offInventoryVehicle, setOffInventoryVehicle] = useState('');
  const [alternateReason, setAlternateReason] = useState('');
  const [markListingAsSold, setMarkListingAsSold] = useState(true);
  const [openSoldVehicleForm, setOpenSoldVehicleForm] = useState(true);

  const [next, setNext] = useState<NextStep>(emptyNextStep());
  const [busy, setBusy] = useState(false);
  const [needsNext, setNeedsNext] = useState(false);
  const statuses = meta?.enums.statuses || [];
  const stageName = (value: string) => meta?.pipelineStages?.find((stage) => stage.code === value)?.name || label(value);
  const selectedStage = meta?.pipelineStages?.find((stage) => stage.code === status);
  const closing = Boolean(selectedStage?.isTerminal) || status === 'WON' || status === 'LOST';
  const isWon = status === 'WON';
  // A reason is needed whenever the customer did not buy the machine they enquired about.
  const boughtSomethingElse = Boolean(enquiredListingId) && mode !== 'ENQUIRED';
  const soldFromInventory = mode === 'ENQUIRED' || mode === 'ALTERNATE';

  useEffect(() => {
    if (!isWon || mode !== 'ALTERNATE' || alternate) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      api.get<InventoryItem[]>('/crm/inventory', { params: { q: search || undefined, excludeId: enquiredListingId || undefined } })
        .then((res) => { if (active) setInventory(Array.isArray(res.data) ? res.data : []); })
        .catch(() => { if (active) setInventory([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isWon, mode, alternate, search, enquiredListingId]);

  useEffect(() => {
    if (!showResults) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [showResults]);

  const chooseMode = (nextMode: SoldVehicleMode) => {
    setMode(nextMode);
    if (nextMode === 'ENQUIRED' && enquiredPrice) setWonAmount(String(enquiredPrice));
    if (nextMode === 'ALTERNATE' && alternate?.price) setWonAmount(String(alternate.price));
  };

  const pickAlternate = (item: InventoryItem) => {
    setAlternate(item);
    setShowResults(false);
    if (item.price) setWonAmount(String(item.price));
  };

  const save = async () => {
    if (isWon) {
      if (mode === 'ALTERNATE' && !alternate) return toast.error('Search and select the machine the customer bought.');
      if (mode === 'OFF_INVENTORY' && !offInventoryVehicle.trim()) return toast.error('Enter which machine the customer bought.');
      if (boughtSomethingElse && !alternateReason.trim()) return toast.error('Enter why the customer bought a different machine.');
      if (!(Number(wonAmount) > 0)) return toast.error('Enter the final agreed deal value.');
    }

    setBusy(true);
    try {
      await api.post(`/crm/leads/${leadId}/status`, {
        status,
        note: note || undefined,
        ...(status === 'LOST' ? { lostReason } : {}),
        ...(isWon ? {
          soldVehicleMode: mode,
          wonAmount: Number(wonAmount),
          soldListingId: mode === 'ALTERNATE' ? alternate?.id : undefined,
          offInventoryVehicle: mode === 'OFF_INVENTORY' ? offInventoryVehicle.trim() : undefined,
          alternateSoldReason: boughtSomethingElse ? alternateReason.trim() : undefined,
          markListingAsSold: soldFromInventory && markListingAsSold,
        } : {}),
        ...(!closing ? { nextFollowUp: nextPayload(next) } : {}),
      });

      if (isWon) {
        toast.success(`Deal closed as WON${soldFromInventory && markListingAsSold ? ' — listing marked SOLD' : ''}.`);
      } else {
        toast.success(`Lead moved to ${stageName(status)}.`);
      }
      if (isWon && canCreateSoldVehicle && openSoldVehicleForm) {
        // Same flow as the Sell Vehicle button on a listing row; the form opens the machine's
        // existing record if there is one, and links the new record back to this lead on save.
        const soldListingId = mode === 'ENQUIRED' ? enquiredListingId : mode === 'ALTERNATE' ? alternate?.id : null;
        const params = new URLSearchParams({ leadId, ...(soldListingId ? { listingId: soldListingId } : {}) });
        router.push(`${base.replace(/\/crm$/, '')}/accounts/sell-accounts/new?${params.toString()}`);
        return;
      }
      onDone();
    } catch (error) {
      if (crmErrorCode(error) === 'NEXT_FOLLOW_UP_REQUIRED') setNeedsNext(true);
      toast.error(crmError(error, 'Could not change the status.'));
    } finally {
      setBusy(false);
    }
  };

  const modeButton = (value: SoldVehicleMode, text: string, Icon: typeof Check) => (
    <button
      key={value}
      type="button"
      onClick={() => chooseMode(value)}
      className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition-all ${
        mode === value ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {text}
    </button>
  );

  return (
    <Modal title="Change lead status" subtitle={`Currently ${stageName(currentStatus)}`} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                status === s
                  ? s === 'WON'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                    : s === 'LOST'
                      ? 'border-red-600 bg-red-600 text-white shadow-xs'
                      : 'border-slate-900 bg-slate-900 text-white shadow-xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {stageName(s)}
            </button>
          ))}
        </div>

        {status === 'LOST' ? (
          <Field label="Why was it lost? *">
            <CrmSelect options={[{ id: '', name: 'Choose a reason' }, ...(meta?.config.lostReasons || []).map((r) => ({ id: r, name: r }))]} value={lostReason} onChange={(next) => setLostReason(next)} searchable className="w-full" />
          </Field>
        ) : null}

        {isWon ? (
          <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-emerald-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900">Vehicle sold & deal closing</h4>
                  <p className="text-[11px] text-emerald-700">Choose the machine that was sold and start the sold vehicle process.</p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">Deal won</span>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-800">Which machine did the customer buy?</label>
              <div className={`grid gap-2 ${enquiredListingId ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                {enquiredListingId ? modeButton('ENQUIRED', 'Enquired machine', Check) : null}
                {modeButton('ALTERNATE', enquiredListingId ? 'Different machine' : 'From our inventory', ArrowRightLeft)}
                {modeButton('OFF_INVENTORY', 'Outside our inventory', PackageX)}
              </div>
            </div>

            {mode === 'ENQUIRED' ? (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Enquired machine</span>
                  {enquiredPrice ? <span className="text-xs font-extrabold text-slate-900">{fmtInr(enquiredPrice)}</span> : null}
                </div>
                <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Truck className="h-4 w-4 text-emerald-600" />{enquiredListingTitle || 'Enquired machine'}</p>
                {enquiredLocation ? <p className="text-xs text-slate-500">{enquiredLocation}</p> : null}
              </div>
            ) : null}

            {boughtSomethingElse ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/70 p-2.5 text-xs text-amber-900">
                <span>Customer enquired for: <strong>{enquiredListingTitle || 'another machine'}</strong></span>
                <span className="shrink-0 text-[10px] font-bold text-amber-700">Did not buy this</span>
              </div>
            ) : null}

            {mode === 'ALTERNATE' ? (
              alternate ? (
                <div className="space-y-1.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800"><Check className="h-3 w-3" />Machine sold</span>
                    <button type="button" onClick={() => { setAlternate(null); setShowResults(true); }} className="text-xs font-bold text-emerald-700 hover:text-emerald-900 hover:underline">Change machine</button>
                  </div>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Truck className="h-4 w-4 text-emerald-700" />{alternate.title}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                    {alternate.price ? <span>Listed: <strong>{fmtInr(alternate.price)}</strong></span> : null}
                    {alternate.manufacturingYear ? <span>• {alternate.manufacturingYear}</span> : null}
                    {alternate.locationCity ? <span>• {[alternate.locationCity, alternate.locationState].filter(Boolean).join(', ')}</span> : null}
                    {alternate.status !== 'PUBLISHED' ? <span className="font-semibold text-amber-700">• {label(alternate.status)}</span> : null}
                  </div>
                </div>
              ) : (
                <div ref={searchBoxRef} className="relative space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800">Machine sold to the customer *</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
                      onFocus={() => setShowResults(true)}
                      placeholder="Search live listings by name, brand, model or city"
                      className={`${inputClass} pl-9`}
                    />
                    {searching ? <span className="absolute right-3 top-2.5 animate-pulse text-xs text-slate-400">Searching…</span> : null}
                  </div>
                  {showResults ? (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      {inventory.length === 0 ? (
                        <p className="p-3 text-center text-xs text-slate-500">{searching ? 'Loading machines…' : 'No live listing matches this search.'}</p>
                      ) : inventory.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => pickAlternate(item)}
                          className="flex w-full items-center justify-between gap-3 border-b border-slate-100 p-2 text-left transition-colors last:border-0 hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-slate-900">{item.title}</p>
                            <p className="text-[11px] text-slate-500">
                              {[item.categoryName, item.locationCity, item.manufacturingYear].filter(Boolean).join(' • ')}
                              {item.status !== 'PUBLISHED' ? ` • ${label(item.status)}` : ''}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-extrabold text-emerald-700">{item.price ? fmtInr(item.price) : '—'}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            ) : null}

            {mode === 'OFF_INVENTORY' ? (
              <Field label="Machine sold *">
                <input value={offInventoryVehicle} onChange={(e) => setOffInventoryVehicle(e.target.value)} className={inputClass} placeholder="e.g. JCB 3DX Super 2021, arranged from another dealer" />
              </Field>
            ) : null}

            {boughtSomethingElse ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800">Why did the customer buy a different machine? *</label>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REASONS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setAlternateReason(chip)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        alternateReason === chip ? 'border-emerald-600 bg-emerald-100/70 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <textarea rows={2} value={alternateReason} onChange={(e) => setAlternateReason(e.target.value)} className={inputClass} placeholder="e.g. Budget was ₹12 lakh, so we closed a JCB 3DX instead of the CASE 770." />
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">Final agreed deal value (₹) *</label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input type="number" min={0} value={wonAmount} onChange={(e) => setWonAmount(e.target.value)} placeholder="e.g. 1550000" className={`${inputClass} pl-9 font-bold text-slate-900`} />
              </div>
              {Number(wonAmount) > 0 ? <p className="text-[11px] font-bold text-emerald-700">Deal value: {fmtInr(Number(wonAmount))}</p> : null}
            </div>

            {soldFromInventory || canCreateSoldVehicle ? (
              <div className="space-y-2 border-t border-emerald-200/60 pt-3">
                {soldFromInventory ? (
                  <label className="flex cursor-pointer items-start gap-2.5 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={markListingAsSold} onChange={(e) => setMarkListingAsSold(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <span>
                      <span className="font-bold text-slate-900">Mark the listing SOLD on the marketplace</span>
                      <span className="block text-[11px] text-slate-500">Hides it from other buyers, saves this customer as the buyer and tags other open leads on this machine.</span>
                    </span>
                  </label>
                ) : null}
                {canCreateSoldVehicle ? (
                  <label className="flex cursor-pointer items-start gap-2.5 text-xs font-medium text-slate-700">
                    <input type="checkbox" checked={openSoldVehicleForm} onChange={(e) => setOpenSoldVehicleForm(e.target.checked)} className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                    <span>
                      <span className="font-bold text-slate-900">Continue to the Sold Vehicle form (paperwork & RTO)</span>
                      <span className="block text-[11px] text-slate-500">Opens Accounts → Sold Vehicles with the machine, customer and deal value filled in. Saving it links the record to this lead.</span>
                    </span>
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <Field label="Note">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder={isWon ? 'Delivery timeline or agreed terms' : 'What happened?'} />
        </Field>

        {!closing ? (
          <NextStepFields value={next} onChange={setNext} required={needsNext} title={needsNext ? 'Schedule the next follow-up' : 'Next follow-up (if not already planned)'} />
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">Open follow-ups on this lead will be closed automatically.</p>
        )}

        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={status === currentStatus && !note && !next.dueAt} onClick={save}>
            {isWon ? (canCreateSoldVehicle && openSoldVehicleForm ? 'Close deal & continue' : 'Close deal as WON') : 'Save'}
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export function CompleteFollowUpModal({ followUp, leadStatus, onClose, onDone }: { followUp: FollowUp; leadStatus?: string | null; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const [outcome, setOutcome] = useState('');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [next, setNext] = useState<NextStep>(emptyNextStep(followUp.type));
  const [busy, setBusy] = useState(false);
  const stageName = (value: string | null | undefined) => meta?.pipelineStages?.find((stage) => stage.code === value)?.name || label(value || '');
  const currentStage = meta?.pipelineStages?.find((stage) => stage.code === leadStatus);
  const selectedStage = meta?.pipelineStages?.find((stage) => stage.code === newStatus);
  const closing = Boolean(selectedStage?.isTerminal) || newStatus === 'WON' || newStatus === 'LOST';
  const leadOpen = Boolean(followUp.leadId) && !currentStage?.isTerminal && leadStatus !== 'WON' && leadStatus !== 'LOST';
  // Won deals are closed from the lead's Close Deal form (machine, value, Sold Vehicle record).
  const statusOptions = ((meta?.pipelineStages || []).length
    ? (meta?.pipelineStages || []).map((stage) => ({ id: stage.code, name: stage.name }))
    : (meta?.enums.statuses || []).map((status) => ({ id: status, name: stageName(status) })))
    .filter((option) => option.id !== 'WON');
  const requireNext = Boolean(meta?.config.requireNextFollowUp) && leadOpen && !closing;

  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/crm/followups/${followUp.id}/complete`, {
        outcome,
        outcomeNotes: outcomeNotes || undefined,
        ...(newStatus ? { leadStatus: newStatus } : {}),
        ...(newStatus === 'LOST' ? { lostReason } : {}),
        ...(!closing && next.dueAt ? { next: nextPayload(next) } : {}),
      });
      toast.success('Follow-up completed.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not complete the follow-up.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Complete follow-up" subtitle={`${label(followUp.type)}${followUp.contact?.name ? ` · ${followUp.contact.name}` : ''}`} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="Outcome *">
          <div className="flex flex-wrap gap-1.5">
            {(meta?.enums.outcomes || Object.keys(OUTCOME_LABELS)).map((o) => (
              <button key={o} type="button" onClick={() => setOutcome(o)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${outcome === o ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{OUTCOME_LABELS[o] || label(o)}</button>
            ))}
          </div>
        </Field>
        <Field label="What did the customer say?">
          <textarea rows={2} value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} className={inputClass} />
        </Field>
        {leadOpen ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Move lead to (optional)">
              <CrmSelect options={[{ id: '', name: `Keep ${stageName(leadStatus)}` }, ...statusOptions.filter((option) => option.id !== leadStatus)]} value={newStatus} onChange={(next) => setNewStatus(next)} searchable className="w-full" />
            </Field>
            {newStatus === 'LOST' ? (
              <Field label="Lost reason *">
                <CrmSelect options={[{ id: '', name: 'Choose a reason' }, ...(meta?.config.lostReasons || []).map((r) => ({ id: r, name: r }))]} value={lostReason} onChange={(next) => setLostReason(next)} searchable className="w-full" />
              </Field>
            ) : null}
          </div>
        ) : null}
        {!closing ? <NextStepFields value={next} onChange={setNext} required={requireNext} /> : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<CheckCircle2 className="h-4 w-4" />} busy={busy} disabled={!outcome || (requireNext && !next.dueAt) || (newStatus === 'LOST' && !lostReason)} onClick={save}>Mark done</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export function RescheduleModal({ followUp, onClose, onDone }: { followUp: FollowUp; onClose: () => void; onDone: () => void }) {
  const [dueAt, setDueAt] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/crm/followups/${followUp.id}/reschedule`, { dueAt: fromLocalInput(dueAt), reason });
      toast.success('Follow-up rescheduled.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not reschedule.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Reschedule follow-up" subtitle={followUp.rescheduleCount ? `Already moved ${followUp.rescheduleCount}×` : undefined} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="New date & time *">
          <input type="datetime-local" value={dueAt} min={toLocalInput(new Date())} onChange={(e) => setDueAt(e.target.value)} className={inputClass} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {quickTimes().map((q) => <button key={q.label} type="button" onClick={() => setDueAt(q.value)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{q.label}</button>)}
        </div>
        <Field label="Reason *">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Customer asked to call after Diwali" />
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!dueAt || !reason.trim()} onClick={save}>Reschedule</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export function EditFollowUpModal({ followUp, onClose, onDone }: { followUp: FollowUp; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const [step, setStep] = useState<NextStep>({
    type: followUp.type,
    dueAt: toLocalInput(new Date(followUp.dueAt)),
    notes: followUp.notes || '',
  });
  const [title, setTitle] = useState(followUp.title || '');
  const [ownerId, setOwnerId] = useState(followUp.ownerId || followUp.owner?.id || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!step.dueAt) return toast.error('Choose when to follow up.');
    setBusy(true);
    try {
      await api.patch(`/crm/followups/${followUp.id}`, {
        type: step.type,
        dueAt: fromLocalInput(step.dueAt),
        title: title.trim() || null,
        notes: step.notes.trim() || null,
        ...(meta?.access.canAssign ? { ownerId: ownerId || null } : {}),
      });
      toast.success('Follow-up updated.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not update the follow-up.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit follow-up" subtitle={followUp.contact?.name || followUp.contact?.mobile || 'Customer follow-up'} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Share inspection report" />
        </Field>
        <NextStepFields value={step} onChange={setStep} required title="When and how" />
        {meta?.access.canAssign ? (
          <Field label="Assign to" hint="Leave empty to keep this follow-up unassigned.">
            <CrmSelect options={[{ id: '', name: 'Unassigned' }, ...meta.staff.map((s) => ({ id: s.id, name: s.name }))]} value={ownerId} onChange={(next) => setOwnerId(next)} searchable className="w-full" />
          </Field>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<Edit3 className="h-4 w-4" />} busy={busy} disabled={!step.dueAt} onClick={save}>Save changes</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export function ScheduleFollowUpModal({ leadId, contactUserId, onClose, onDone }: { leadId?: string; contactUserId?: string; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const [step, setStep] = useState<NextStep>(emptyNextStep());
  const [title, setTitle] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post('/crm/followups', { leadId, contactUserId, type: step.type, dueAt: fromLocalInput(step.dueAt), notes: step.notes || undefined, title: title || undefined, ...(ownerId ? { ownerId } : {}) });
      toast.success('Follow-up scheduled.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not schedule the follow-up.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Schedule follow-up" onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Share inspection report" />
        </Field>
        <NextStepFields value={step} onChange={setStep} required title="When and how" />
        {meta?.access.canAssign ? (
          <Field label="Assign to" hint="Leave empty to give it to the lead owner (or yourself).">
            <CrmSelect options={[{ id: '', name: 'Lead owner / me' }, ...meta.staff.map((s) => ({ id: s.id, name: s.name }))]} value={ownerId} onChange={(next) => setOwnerId(next)} searchable className="w-full" />
          </Field>
        ) : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!step.dueAt} onClick={save}>Schedule</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

const ACTIVITY_TYPES = [
  { key: 'CALL', label: 'Call' },
  { key: 'WHATSAPP', label: 'WhatsApp' },
  { key: 'SMS', label: 'SMS' },
  { key: 'VISIT', label: 'Visit' },
  { key: 'INSPECTION', label: 'Inspection' },
  { key: 'MEETING', label: 'Meeting' },
  { key: 'EMAIL', label: 'Email' },
  { key: 'NOTE', label: 'Note' },
];

export function LogActivityModal({ endpoint, initialType = 'CALL', onClose, onDone }: { endpoint: string; initialType?: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState(initialType);
  const [content, setContent] = useState('');
  const [minutes, setMinutes] = useState('');
  const [direction, setDirection] = useState('OUTBOUND');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.post(endpoint, {
        type,
        content,
        metadata: type === 'CALL' ? { direction, ...(minutes ? { durationSec: Math.round(Number(minutes) * 60) } : {}) } : undefined,
      });
      toast.success('Activity logged.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not log the activity.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Log activity" onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <div className="flex flex-wrap gap-1.5">
          {ACTIVITY_TYPES.map((t) => <button key={t.key} type="button" onClick={() => setType(t.key)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${type === t.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{t.label}</button>)}
        </div>
        {type === 'CALL' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Direction">
              <CrmSelect options={[{ id: 'OUTBOUND', name: 'Outgoing' }, { id: 'INBOUND', name: 'Incoming' }]} value={direction} onChange={(next) => setDirection(next)} className="w-full" />
            </Field>
            <Field label="Duration (minutes)">
              <input type="number" min={0} step={0.5} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={inputClass} />
            </Field>
          </div>
        ) : null}
        <Field label="What happened? *">
          <textarea rows={4} value={content} onChange={(e) => setContent(e.target.value)} className={inputClass} />
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!content.trim()} onClick={save}>Save</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export function AssignModal({ leadIds, currentOwnerId, onClose, onDone }: { leadIds: string[]; currentOwnerId?: string | null; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const [ownerId, setOwnerId] = useState(currentOwnerId || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (leadIds.length === 1) await api.post(`/crm/leads/${leadIds[0]}/assign`, { ownerId: ownerId || null, reason: reason || undefined });
      else await api.post('/crm/leads/bulk', { ids: leadIds, action: 'assign', ownerId: ownerId || null });
      toast.success(ownerId ? 'Lead assigned.' : 'Lead unassigned.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not assign.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={leadIds.length > 1 ? `Assign ${leadIds.length} leads` : 'Assign lead'} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <Field label="Owner">
          <CrmSelect options={[{ id: '', name: 'Unassigned' }, ...(meta?.staff || []).map((s) => ({ id: s.id, name: `${s.name}${s.roleName ? ` · ${s.roleName}` : ''}` }))]} value={ownerId} onChange={(next) => setOwnerId(next)} searchable className="w-full" />
        </Field>
        {leadIds.length === 1 ? (
          <Field label="Reason (shown in the timeline)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </Field>
        ) : null}
        <p className="text-xs text-slate-500">Open follow-ups move to the new owner, who gets a notification.</p>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={save}>Save</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
