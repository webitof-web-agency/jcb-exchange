'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { AlertTriangle, UserCheck } from 'lucide-react';
import api from '@/lib/api';
import { Button, Field, inputClass, Modal, ModalFooter } from '@/components/financeWorkspace/ui';
import { emptyNextStep, NextStepFields, type NextStep } from './CrmModals';
import {
  crmError,
  crmErrorCode,
  crmErrorDetails,
  fromLocalInput,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  selectClass,
  useCrmBase,
  useCrmMeta,
  type ContactLite,
} from './crmShared';

type Option = { id: string; name: string };

/** Categories / brands, and models for the chosen brand (master data). */
export const useCatalog = (brandId: string) => {
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [models, setModels] = useState<Option[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/master/categories'), api.get('/master/brands')])
      .then(([c, b]) => { if (!cancelled) { setCategories(c.data?.data || []); setBrands(b.data?.data || []); } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!brandId) return () => { cancelled = true; };
    api.get(`/master/models/${brandId}`)
      .then((r) => { if (!cancelled) setModels(r.data?.data || []); })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, [brandId]);
  return { categories, brands, models: brandId ? models : [] };
};

export type RequirementState = {
  categoryId: string; brandId: string; modelId: string; yearFrom: string; yearTo: string; budgetMin: string; budgetMax: string;
  requirementCity: string; requirementState: string; requirementNotes: string;
};

export const emptyRequirement = (): RequirementState => ({ categoryId: '', brandId: '', modelId: '', yearFrom: '', yearTo: '', budgetMin: '', budgetMax: '', requirementCity: '', requirementState: '', requirementNotes: '' });

export const requirementPayload = (r: RequirementState) => ({
  categoryId: r.categoryId || null,
  brandId: r.brandId || null,
  modelId: r.modelId || null,
  yearFrom: r.yearFrom ? Number(r.yearFrom) : null,
  yearTo: r.yearTo ? Number(r.yearTo) : null,
  budgetMin: r.budgetMin ? Number(r.budgetMin) : null,
  budgetMax: r.budgetMax ? Number(r.budgetMax) : null,
  requirementCity: r.requirementCity || null,
  requirementState: r.requirementState || null,
  requirementNotes: r.requirementNotes || null,
});

export function RequirementFields({ value, onChange }: { value: RequirementState; onChange: (next: RequirementState) => void }) {
  const { categories, brands, models } = useCatalog(value.brandId);
  const set = (patch: Partial<RequirementState>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Category">
        <select value={value.categoryId} onChange={(e) => set({ categoryId: e.target.value })} className={selectClass}>
          <option value="">Any</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Brand">
        <select value={value.brandId} onChange={(e) => set({ brandId: e.target.value, modelId: '' })} className={selectClass}>
          <option value="">Any</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Model">
        <select value={value.modelId} onChange={(e) => set({ modelId: e.target.value })} disabled={!value.brandId} className={selectClass}>
          <option value="">Any</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Field>
      <Field label="Year from"><input type="number" value={value.yearFrom} onChange={(e) => set({ yearFrom: e.target.value })} className={inputClass} placeholder="2018" /></Field>
      <Field label="Year to"><input type="number" value={value.yearTo} onChange={(e) => set({ yearTo: e.target.value })} className={inputClass} /></Field>
      <div />
      <Field label="Budget min (₹)"><input type="number" min={0} value={value.budgetMin} onChange={(e) => set({ budgetMin: e.target.value })} className={inputClass} /></Field>
      <Field label="Budget max (₹)"><input type="number" min={0} value={value.budgetMax} onChange={(e) => set({ budgetMax: e.target.value })} className={inputClass} /></Field>
      <div />
      <Field label="Required in city"><input value={value.requirementCity} onChange={(e) => set({ requirementCity: e.target.value })} className={inputClass} /></Field>
      <Field label="State"><input value={value.requirementState} onChange={(e) => set({ requirementState: e.target.value })} className={inputClass} /></Field>
      <div className="md:col-span-3">
        <Field label="Requirement notes"><textarea rows={2} value={value.requirementNotes} onChange={(e) => set({ requirementNotes: e.target.value })} className={inputClass} /></Field>
      </div>
    </div>
  );
}

type Lookup = { mobile: string | null; contact: ContactLite | null; openLeads: Array<{ id: string; status: string; leadType: string; listingTitleSnapshot: string | null; owner: { name: string | null } | null }> };

export default function LeadForm({ onClose, onCreated, presetContact }: { onClose: () => void; onCreated: (leadId: string) => void; presetContact?: ContactLite }) {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const [contact, setContact] = useState({ mobile: presetContact?.mobile || '', name: presetContact?.name || '', city: presetContact?.city || '', state: presetContact?.state || '', email: '', whatsappNumber: '' });
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [leadType, setLeadType] = useState('BUY');
  const [source, setSource] = useState('PHONE');
  const [priority, setPriority] = useState('MEDIUM');
  const [message, setMessage] = useState('');
  const [expectedValue, setExpectedValue] = useState('');
  const [ownerId, setOwnerId] = useState(meta?.access.canAssign ? 'none' : '');
  const [requirement, setRequirement] = useState<RequirementState>(emptyRequirement());
  const [followUp, setFollowUp] = useState<NextStep>(emptyNextStep());
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isPartner = Boolean(meta?.access.isPartner);

  const checkMobile = async () => {
    const digits = contact.mobile.replace(/\D/g, '');
    if (digits.length < 10) { setLookup(null); return; }
    try {
      const result = (await api.get('/crm/contacts/lookup', { params: { mobile: contact.mobile } })).data as Lookup;
      setLookup(result);
      if (result.contact) {
        setContact((c) => ({ ...c, name: c.name || result.contact?.name || '', city: c.city || result.contact?.city || '', state: c.state || result.contact?.state || '' }));
      }
    } catch {
      setLookup(null);
    }
  };

  const submit = async (allowDuplicate = false) => {
    setBusy(true);
    try {
      const response = await api.post('/crm/leads', {
        contact,
        leadType,
        source,
        priority,
        message: message || undefined,
        expectedValue: expectedValue ? Number(expectedValue) : undefined,
        ...(ownerId ? { ownerId } : {}),
        ...requirementPayload({ ...requirement, requirementCity: requirement.requirementCity || contact.city, requirementState: requirement.requirementState || contact.state }),
        ...(followUp.dueAt ? { followUp: { type: followUp.type, dueAt: fromLocalInput(followUp.dueAt), notes: followUp.notes || undefined } } : {}),
        ...(allowDuplicate ? { allowDuplicate: true } : {}),
      });
      toast.success('Lead created.');
      onCreated(response.data.lead.id);
    } catch (error) {
      if (crmErrorCode(error) === 'DUPLICATE_LEAD') setDuplicateId(crmErrorDetails(error)?.leadId || null);
      toast.error(crmError(error, 'Could not create the lead.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="New lead" subtitle="Walk-in, phone call, referral or any other enquiry" onClose={onClose} wide>
      <div className="space-y-5 p-5 sm:p-7">
        <section>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Customer</p>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Mobile *">
              <input value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} onBlur={checkMobile} className={inputClass} placeholder="10-digit mobile" inputMode="tel" />
            </Field>
            <Field label="Name"><input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={inputClass} /></Field>
            <Field label="WhatsApp (if different)"><input value={contact.whatsappNumber} onChange={(e) => setContact({ ...contact, whatsappNumber: e.target.value })} className={inputClass} inputMode="tel" /></Field>
            <Field label="City"><input value={contact.city} onChange={(e) => setContact({ ...contact, city: e.target.value })} className={inputClass} /></Field>
            <Field label="State"><input value={contact.state} onChange={(e) => setContact({ ...contact, state: e.target.value })} className={inputClass} /></Field>
            <Field label="Email"><input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={inputClass} /></Field>
          </div>
          {lookup?.contact ? (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              <p className="flex items-center gap-1.5 font-semibold"><UserCheck className="h-4 w-4" />Existing contact: {lookup.contact.name || lookup.contact.mobile}</p>
              {lookup.openLeads.length ? (
                <ul className="mt-1.5 space-y-1">
                  {lookup.openLeads.map((l) => (
                    <li key={l.id}><Link className="font-semibold underline" href={leadHref(base, l.id)}>{LEAD_TYPE_LABELS[l.leadType] || l.leadType} · {label(l.status)}</Link>{l.listingTitleSnapshot ? ` — ${l.listingTitleSnapshot}` : ''}{l.owner?.name ? ` (${l.owner.name})` : ''}</li>
                  ))}
                </ul>
              ) : <p className="mt-1">No open leads.</p>}
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Field label="Lead type">
            <select value={leadType} onChange={(e) => setLeadType(e.target.value)} className={selectClass}>
              {(meta?.enums.leadTypes || Object.keys(LEAD_TYPE_LABELS)).map((t) => <option key={t} value={t}>{LEAD_TYPE_LABELS[t] || label(t)}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select value={source} onChange={(e) => setSource(e.target.value)} className={selectClass}>
              {(meta?.config.sources || ['PHONE']).map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={selectClass}>
              {(meta?.enums.priorities || ['LOW', 'MEDIUM', 'HIGH', 'URGENT']).map((p) => <option key={p} value={p}>{label(p)}</option>)}
            </select>
          </Field>
          {!isPartner ? (
            <Field label="Owner">
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={selectClass} disabled={!meta?.access.canAssign}>
                {meta?.access.canAssign ? <option value="none">Unassigned (auto-assign if on)</option> : <option value="">Me</option>}
                {meta?.access.canAssign ? meta.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>) : null}
              </select>
            </Field>
          ) : null}
        </section>

        <section>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{leadType === 'SELL' ? 'Machine the customer is selling' : 'Requirement'}</p>
          <RequirementFields value={requirement} onChange={setRequirement} />
        </section>

        <section className="grid gap-3 md:grid-cols-[2fr_1fr]">
          <Field label="Enquiry / notes"><textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass} /></Field>
          <Field label="Expected deal value (₹)"><input type="number" min={0} value={expectedValue} onChange={(e) => setExpectedValue(e.target.value)} className={inputClass} /></Field>
        </section>

        <NextStepFields value={followUp} onChange={setFollowUp} title={meta?.config.requireNextFollowUp ? 'First follow-up (a first call is planned automatically if left empty)' : 'First follow-up'} />

        {duplicateId ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <span>This customer already has an open {LEAD_TYPE_LABELS[leadType] || leadType} lead.</span>
            <Link href={leadHref(base, duplicateId)} className="font-semibold underline">Open it</Link>
            <button type="button" onClick={() => submit(true)} className="font-semibold underline">Create a separate lead anyway</button>
          </div>
        ) : null}

        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={contact.mobile.replace(/\D/g, '').length < 10} onClick={() => submit(false)}>Create lead</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
