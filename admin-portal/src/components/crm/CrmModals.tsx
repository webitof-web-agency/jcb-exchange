'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';
import { Button, Field, inputClass, Modal, ModalFooter } from '@/components/financeWorkspace/ui';
import {
  crmError,
  crmErrorCode,
  fromLocalInput,
  label,
  OUTCOME_LABELS,
  quickTimes,
  selectClass,
  toLocalInput,
  useCrmMeta,
  type FollowUp,
} from './crmShared';

export type NextStep = { type: string; dueAt: string; notes: string };

export const emptyNextStep = (type = 'CALL'): NextStep => ({ type, dueAt: '', notes: '' });

/** Follow-up type + when + note, with quick time picks. */
export function NextStepFields({ value, onChange, required, title = 'Next follow-up' }: { value: NextStep; onChange: (next: NextStep) => void; required?: boolean; title?: string }) {
  const { meta } = useCrmMeta();
  const types = meta?.enums.followUpTypes || ['CALL', 'WHATSAPP', 'VISIT', 'INSPECTION', 'MEETING'];
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock className="h-4 w-4 text-amber-600" />{title}{required ? <span className="text-xs font-semibold text-red-600">required</span> : null}</p>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field label="Type">
          <select value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value })} className={selectClass}>
            {types.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
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

export function StatusChangeModal({ leadId, currentStatus, initialStatus, onClose, onDone }: { leadId: string; currentStatus: string; initialStatus?: string; onClose: () => void; onDone: () => void }) {
  const { meta } = useCrmMeta();
  const [status, setStatus] = useState(initialStatus || currentStatus);
  const [lostReason, setLostReason] = useState('');
  const [note, setNote] = useState('');
  const [wonAmount, setWonAmount] = useState('');
  const [next, setNext] = useState<NextStep>(emptyNextStep());
  const [busy, setBusy] = useState(false);
  const [needsNext, setNeedsNext] = useState(false);
  const closing = status === 'WON' || status === 'LOST';
  const statuses = meta?.enums.statuses || [];

  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/crm/leads/${leadId}/status`, {
        status,
        note: note || undefined,
        ...(status === 'LOST' ? { lostReason } : {}),
        ...(status === 'WON' && wonAmount ? { wonAmount: Number(wonAmount) } : {}),
        ...(!closing ? { nextFollowUp: nextPayload(next) } : {}),
      });
      toast.success(`Lead moved to ${label(status)}.`);
      onDone();
    } catch (error) {
      if (crmErrorCode(error) === 'NEXT_FOLLOW_UP_REQUIRED') setNeedsNext(true);
      toast.error(crmError(error, 'Could not change the status.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Change lead status" subtitle={`Currently ${label(currentStatus)}`} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${status === s ? (s === 'WON' ? 'border-emerald-600 bg-emerald-600 text-white' : s === 'LOST' ? 'border-red-600 bg-red-600 text-white' : 'border-slate-900 bg-slate-900 text-white') : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{label(s)}</button>
          ))}
        </div>
        {status === 'LOST' ? (
          <Field label="Why was it lost? *">
            <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={selectClass}>
              <option value="">Choose a reason</option>
              {(meta?.config.lostReasons || []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        ) : null}
        {status === 'WON' ? (
          <Field label="Deal value (₹)" hint="Optional. Used in revenue reports.">
            <input type="number" min={0} value={wonAmount} onChange={(e) => setWonAmount(e.target.value)} className={inputClass} />
          </Field>
        ) : null}
        <Field label="Note">
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="What happened?" />
        </Field>
        {!closing ? <NextStepFields value={next} onChange={setNext} required={needsNext} title={needsNext ? 'Schedule the next follow-up' : 'Next follow-up (if not already planned)'} /> : null}
        {closing ? <p className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-500">Open follow-ups on this lead will be closed automatically.</p> : null}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={status === currentStatus && !note && !next.dueAt} onClick={save}>Save</Button>
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
  const closing = newStatus === 'WON' || newStatus === 'LOST';
  const leadOpen = Boolean(followUp.leadId) && leadStatus !== 'WON' && leadStatus !== 'LOST';
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
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className={selectClass}>
                <option value="">Keep {label(leadStatus)}</option>
                {(meta?.enums.statuses || []).filter((s) => s !== leadStatus).map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </Field>
            {newStatus === 'LOST' ? (
              <Field label="Lost reason *">
                <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={selectClass}>
                  <option value="">Choose a reason</option>
                  {(meta?.config.lostReasons || []).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
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
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectClass}>
              <option value="">Lead owner / me</option>
              {meta.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
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
              <select value={direction} onChange={(e) => setDirection(e.target.value)} className={selectClass}>
                <option value="OUTBOUND">Outgoing</option>
                <option value="INBOUND">Incoming</option>
              </select>
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
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectClass}>
            <option value="">Unassigned</option>
            {(meta?.staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.roleName ? ` · ${s.roleName}` : ''}</option>)}
          </select>
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
