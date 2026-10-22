'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'react-toastify';
import { Megaphone, Plus, Trash2, Users } from 'lucide-react';
import api from '@/lib/api';
import { Button, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, Toggle } from '@/components/financeWorkspace/ui';
import { CONTACT_TYPES, CrmErrorBanner, crmError, CrmPageFrame, getJson, label, LEAD_TYPE_LABELS, PageHeader, useCrmBase, useCrmMeta, useCrmResource, type ContactLite } from './crmShared';

type Filters = {
  lifecycles: string[]; contactTypes: string[]; tags: string[]; states: string[]; cities: string[]; leadStatuses: string[];
  leadTypes: string[]; temperatures: string[]; sources: string[]; primeOnly: boolean; openLeadOnly: boolean; inactiveDays: number | null;
};
type Segment = { id: string; name: string; description: string | null; filters: Filters; count: number };
type Template = { id: string; name: string; language: string; category: string; needsVariables: boolean };

const emptyFilters = (): Filters => ({ lifecycles: [], contactTypes: [], tags: [], states: [], cities: [], leadStatuses: [], leadTypes: [], temperatures: [], sources: [], primeOnly: false, openLeadOnly: false, inactiveDays: null });

function Chips({ options, value, onChange, nameOf = label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; nameOf?: (v: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{nameOf(o)}</button>;
      })}
    </div>
  );
}

const describe = (f: Filters) => [
  f.lifecycles.length ? f.lifecycles.map(label).join('/') : null,
  f.contactTypes.length ? f.contactTypes.map(label).join('/') : null,
  f.leadTypes.length ? f.leadTypes.map((t) => LEAD_TYPE_LABELS[t] || t).join('/') : null,
  f.leadStatuses.length ? `status ${f.leadStatuses.map(label).join('/')}` : null,
  f.temperatures.length ? f.temperatures.map(label).join('/') : null,
  f.states.length ? f.states.join(', ') : null,
  f.cities.length ? f.cities.join(', ') : null,
  f.tags.length ? `tags ${f.tags.join(', ')}` : null,
  f.primeOnly ? 'Prime only' : null,
  f.openLeadOnly ? 'with open lead' : null,
  f.inactiveDays ? `quiet ${f.inactiveDays}+ days` : null,
].filter(Boolean).join(' · ') || 'All customers';

function Campaigns() {
  const segments = useCrmResource(() => getJson<Segment[]>('/crm/segments'), 'crm-segments');
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const [sending, setSending] = useState<Segment | null>(null);
  const remove = async (segment: Segment) => {
    if (!window.confirm(`Delete segment "${segment.name}"?`)) return;
    try { await api.delete(`/crm/segments/${segment.id}`); segments.reload(); } catch (error) { toast.error(crmError(error, 'Could not delete.')); }
  };
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Save a customer group, then create a WhatsApp campaign draft for it. Only marketing opt-ins receive messages; do-not-contact customers are always excluded."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New segment</Button>}
      />
      <Panel title="Saved segments" description="Customer counts update live from the filters.">
        {segments.loading && !segments.data ? <LoadingState /> : segments.error ? <CrmErrorBanner message={segments.error} schemaMissing={segments.schemaMissing} /> : !segments.data?.length ? (
          <EmptyState title="No segments yet" description="Example: Hot buyers in Chhattisgarh with no activity for 14 days." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {segments.data.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{s.name} <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><Users className="h-3.5 w-3.5" />{s.count}</span></p>
                  <p className="truncate text-xs text-slate-500">{s.description ? `${s.description} · ` : ''}{describe(s.filters)}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setEditing(s)}>Edit</Button>
                  <Button variant="primary" icon={<Megaphone className="h-4 w-4" />} onClick={() => setSending(s)}>Campaign</Button>
                  <button type="button" onClick={() => remove(s)} className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete segment"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {editing ? <SegmentEditor segment={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); segments.reload(); }} /> : null}
        {sending ? <CampaignModal segment={sending} onClose={() => setSending(null)} /> : null}
      </Panel>
    </>
  );
}

function SegmentEditor({ segment, onClose, onSaved }: { segment: Segment | null; onClose: () => void; onSaved: () => void }) {
  const { meta } = useCrmMeta();
  const [name, setName] = useState(segment?.name || '');
  const [description, setDescription] = useState(segment?.description || '');
  const [filters, setFilters] = useState<Filters>(segment?.filters ? { ...emptyFilters(), ...segment.filters } : emptyFilters());
  const [statesText, setStatesText] = useState(filters.states.join(', '));
  const [citiesText, setCitiesText] = useState(filters.cities.join(', '));
  const [preview, setPreview] = useState<{ count: number; sample: ContactLite[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const full = (): Filters => ({ ...filters, states: statesText.split(',').map((s) => s.trim()).filter(Boolean), cities: citiesText.split(',').map((s) => s.trim()).filter(Boolean) });
  const set = (patch: Partial<Filters>) => { setFilters((f) => ({ ...f, ...patch })); setPreview(null); };
  const runPreview = async () => {
    try { setPreview((await api.post('/crm/segments/preview', { filters: full() })).data); } catch (error) { toast.error(crmError(error, 'Preview failed.')); }
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = { name, description, filters: full() };
      if (segment) await api.put(`/crm/segments/${segment.id}`, body); else await api.post('/crm/segments', body);
      toast.success('Segment saved.');
      onSaved();
    } catch (error) {
      toast.error(crmError(error, 'Could not save the segment.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={segment ? 'Edit segment' : 'New segment'} onClose={onClose} wide>
      <div className="space-y-4 p-5 sm:p-7">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name *"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
          <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="Contact stage"><Chips options={meta?.enums.lifecycles || []} value={filters.lifecycles} onChange={(v) => set({ lifecycles: v })} /></Field>
        <Field label="Contact type"><Chips options={CONTACT_TYPES} value={filters.contactTypes} onChange={(v) => set({ contactTypes: v })} /></Field>
        <Field label="Has a lead of type"><Chips options={meta?.enums.leadTypes || []} value={filters.leadTypes} onChange={(v) => set({ leadTypes: v })} nameOf={(t) => LEAD_TYPE_LABELS[t] || label(t)} /></Field>
        <Field label="Lead status"><Chips options={meta?.enums.statuses || []} value={filters.leadStatuses} onChange={(v) => set({ leadStatuses: v })} /></Field>
        <Field label="Heat"><Chips options={meta?.enums.temperatures || []} value={filters.temperatures} onChange={(v) => set({ temperatures: v })} /></Field>
        <Field label="Lead source"><Chips options={meta?.config.sources || []} value={filters.sources} onChange={(v) => set({ sources: v })} /></Field>
        <Field label="Contact tags"><Chips options={meta?.config.tags || []} value={filters.tags} onChange={(v) => set({ tags: v })} /></Field>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="States (comma separated)"><input value={statesText} onChange={(e) => { setStatesText(e.target.value); setPreview(null); }} className={inputClass} /></Field>
          <Field label="Cities (comma separated)"><input value={citiesText} onChange={(e) => { setCitiesText(e.target.value); setPreview(null); }} className={inputClass} /></Field>
          <Field label="No activity for (days)"><input type="number" min={0} value={filters.inactiveDays ?? ''} onChange={(e) => set({ inactiveDays: e.target.value ? Number(e.target.value) : null })} className={inputClass} /></Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <Toggle checked={filters.primeOnly} onChange={(v) => set({ primeOnly: v })} label="Prime members only" />
          <Toggle checked={filters.openLeadOnly} onChange={(v) => set({ openLeadOnly: v })} label="Has an open lead" />
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-slate-600">{describe(full())}</span><Button onClick={runPreview}>Preview</Button></div>
          {preview ? (
            <div className="mt-2">
              <p className="font-semibold text-slate-900">{preview.count} customers</p>
              <p className="mt-1 text-xs text-slate-500">{preview.sample.map((c) => c.name || c.mobile).join(', ')}{preview.count > preview.sample.length ? '…' : ''}</p>
            </div>
          ) : null}
        </div>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!name.trim()} onClick={save}>Save segment</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function CampaignModal({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const { base } = useCrmBase();
  const templates = useCrmResource(() => getJson<Template[]>('/crm/templates'), 'crm-templates');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState(`CRM: ${segment.name}`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ selected: number; optedIn: number; recipients: number } | null>(null);
  const marketing = (templates.data || []).filter((t) => t.category === 'MARKETING');
  const create = async () => {
    setBusy(true);
    try {
      setResult((await api.post(`/crm/segments/${segment.id}/campaign`, { templateId, name })).data);
      toast.success('Campaign draft created.');
    } catch (error) {
      toast.error(crmError(error, 'Could not create the campaign.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Create WhatsApp campaign" subtitle={`${segment.name} · ${segment.count} customers`} onClose={onClose}>
      <div className="space-y-4 p-5 sm:p-7">
        {result ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">Draft created with {result.recipients} recipients.</p>
            <p className="mt-1 text-xs">{result.selected} customers in the segment, {result.optedIn} opted in to marketing messages (max 200 per campaign). Review and confirm it on the WhatsApp page.</p>
            <Link href={`${base.replace(/\/crm$/, '')}/whatsapp`} className="mt-2 inline-block text-xs font-bold underline">Open WhatsApp campaigns</Link>
          </div>
        ) : (
          <>
            <Field label="Campaign name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
            <Field label="Approved marketing template *" hint={!marketing.length && !templates.loading ? 'No approved marketing template yet. Sync templates on the WhatsApp page.' : undefined}>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputClass}>
                <option value="">Choose…</option>
                {marketing.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
              </select>
            </Field>
          </>
        )}
        <ModalFooter>
          <Button onClick={onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {!result ? <Button variant="primary" busy={busy} disabled={!templateId} onClick={create}>Create draft</Button> : null}
        </ModalFooter>
      </div>
    </Modal>
  );
}

export default function CrmCampaignsPage() {
  return <CrmPageFrame><Campaigns /></CrmPageFrame>;
}
