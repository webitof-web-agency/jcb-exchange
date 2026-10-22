'use client';

import { useState } from 'react';
import { toast } from 'react-toastify';
import { Copy, KeyRound, Play, Plus, Save, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Badge, Button, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, Toggle } from '@/components/financeWorkspace/ui';
import { crmError, CrmMetaProvider, fmtDateTime, getJson, label, LEAD_TYPE_LABELS, selectClass, useCrmMeta, useCrmResource, type CrmMeta } from './crmShared';

type Config = NonNullable<CrmMeta['config']>;
type Rule = { id: string; name: string; enabled: boolean; sortOrder: number; strategy: string; assigneeIds: string[]; conditions: { leadTypes?: string[]; sources?: string[]; states?: string[]; cities?: string[]; priorities?: string[] } | null };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/+$/, '');

const AUTOMATION_ITEMS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'autoAssign', label: 'Auto-assign new leads', hint: 'Uses the assignment rules below (platform leads only; partner leads stay with the partner).' },
  { key: 'autoFirstFollowUp', label: 'Plan a first call for website leads', hint: 'Creates a "First call" follow-up when a website / Prime / form lead arrives.' },
  { key: 'slaEscalation', label: 'Escalate SLA misses', hint: 'Notifies managers when a lead is not contacted within its SLA.' },
  { key: 'scoring', label: 'Lead scoring (hot / warm / cold)', hint: 'Re-scores open leads every hour from Prime status, repeat enquiries and site activity.' },
  { key: 'leadAcknowledgement', label: 'Thank-you message to new leads', hint: 'WhatsApp/SMS event CRM_LEAD_ACKNOWLEDGEMENT.' },
  { key: 'customerReminders', label: 'Visit / inspection reminders to customers', hint: 'Sent ~24h before; event CRM_APPOINTMENT_REMINDER.' },
  { key: 'matchAlerts', label: 'New matching machine alerts', hint: 'For leads with alerts on; event CRM_MATCHING_LISTING.' },
  { key: 'reengagement', label: 'Re-engage lost / on-hold leads', hint: 'One message after the quiet period; event CRM_REENGAGEMENT.' },
];

function SettingsLoader() {
  const { meta, reloadMeta } = useCrmMeta();
  if (!meta) return <Panel><LoadingState /></Panel>;
  if (!meta.access.canSettings) return <Panel><EmptyState title="No access to CRM settings" description="Ask a super admin for the crm.settings permission." /></Panel>;
  return <SettingsForm key={JSON.stringify(meta.config)} meta={meta} onSaved={reloadMeta} />;
}

/** CRM settings, shown under Administration → Settings → CRM Settings. */
export default function CrmSettingsPanel() {
  return <CrmMetaProvider><SettingsLoader /></CrmMetaProvider>;
}

function SettingsForm({ meta, onSaved }: { meta: CrmMeta; onSaved: () => void }) {
  const config = meta.config as Required<Config>;
  const [draft, setDraft] = useState(config);
  const [sources, setSources] = useState(config.sources.join('\n'));
  const [lostReasons, setLostReasons] = useState(config.lostReasons.join('\n'));
  const [tags, setTags] = useState(config.tags.join('\n'));
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const state = (meta.automation || {}) as { lastRunAt?: string; lastRunSummary?: Record<string, number> };
  const auto = draft.automation as Record<string, boolean | number>;
  const setAuto = (key: string, value: boolean | number) => setDraft((d) => ({ ...d, automation: { ...d.automation, [key]: value } }));

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/crm/settings', { ...draft, sources: lines(sources), lostReasons: lines(lostReasons), tags: lines(tags) });
      toast.success('CRM settings saved.');
      onSaved();
    } catch (error) {
      toast.error(crmError(error, 'Could not save settings.'));
    } finally {
      setBusy(false);
    }
  };
  const runNow = async () => {
    setRunning(true);
    try {
      const summary = (await api.post('/crm/automation/run')).data as Record<string, number>;
      toast.success(`Automation ran: ${Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing to do'}`);
      onSaved();
    } catch (error) {
      toast.error(crmError(error, 'Run failed.'));
    } finally {
      setRunning(false);
    }
  };
  const generateKey = async () => {
    if (config.webhook?.configured && !window.confirm('Generate a new key? The old key stops working immediately.')) return;
    try {
      const result = (await api.post('/crm/settings/webhook-key', { enabled: true })).data as { key: string };
      setNewKey(result.key);
      onSaved();
    } catch (error) { toast.error(crmError(error, 'Could not create a key.')); }
  };
  const toggleWebhook = async (enabled: boolean) => {
    try { await api.put('/crm/settings/webhook', { enabled }); onSaved(); } catch (error) { toast.error(crmError(error, 'Could not update the API.')); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Follow-up rules" description="How strictly the team must plan the next step." actions={<Button variant="primary" icon={<Save className="h-4 w-4" />} busy={busy} onClick={save}>Save settings</Button>}>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-3">
            <Toggle checked={draft.requireNextFollowUp} onChange={(v) => setDraft({ ...draft, requireNextFollowUp: v })} label="Every open lead must have a next follow-up" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Working hours from"><input type="time" value={draft.workingHours.start} onChange={(e) => setDraft({ ...draft, workingHours: { ...draft.workingHours, start: e.target.value } })} className={inputClass} /></Field>
              <Field label="to"><input type="time" value={draft.workingHours.end} onChange={(e) => setDraft({ ...draft, workingHours: { ...draft.workingHours, end: e.target.value } })} className={inputClass} /></Field>
            </div>
            <Field label="Working days">
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d, i) => {
                  const on = draft.workingHours.days.includes(i);
                  return <button key={d} type="button" onClick={() => setDraft({ ...draft, workingHours: { ...draft.workingHours, days: on ? draft.workingHours.days.filter((x) => x !== i) : [...draft.workingHours.days, i].sort() } })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{d}</button>;
                })}
              </div>
            </Field>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600">First-response SLA (minutes)</p>
            <div className="grid grid-cols-2 gap-3">
              {(['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((p) => (
                <Field key={p} label={label(p)}><input type="number" min={5} value={draft.sla[p] ?? ''} onChange={(e) => setDraft({ ...draft, sla: { ...draft.sla, [p]: Number(e.target.value) } })} className={inputClass} /></Field>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Reminders & escalation">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-3">
            <Field label="Remind owner this many minutes before"><input type="number" min={0} value={draft.reminders.minutesBefore} onChange={(e) => setDraft({ ...draft, reminders: { ...draft.reminders, minutesBefore: Number(e.target.value) } })} className={inputClass} /></Field>
            <Toggle checked={draft.reminders.inApp} onChange={(v) => setDraft({ ...draft, reminders: { ...draft.reminders, inApp: v } })} label="In-app notification" />
            <Toggle checked={draft.reminders.push} onChange={(v) => setDraft({ ...draft, reminders: { ...draft.reminders, push: v } })} label="Mobile / browser push" />
            <Toggle checked={draft.reminders.whatsappToOwner} onChange={(v) => setDraft({ ...draft, reminders: { ...draft.reminders, whatsappToOwner: v } })} label="WhatsApp to staff (event CRM_FOLLOW_UP_REMINDER)" />
            <Toggle checked={draft.reminders.smsToOwner} onChange={(v) => setDraft({ ...draft, reminders: { ...draft.reminders, smsToOwner: v } })} label="SMS to staff (same event)" />
          </div>
          <div className="space-y-3">
            <Field label="Mark missed after (minutes past due)"><input type="number" min={15} value={draft.missed.graceMinutes} onChange={(e) => setDraft({ ...draft, missed: { ...draft.missed, graceMinutes: Number(e.target.value) } })} className={inputClass} /></Field>
            <Toggle checked={draft.missed.escalate} onChange={(v) => setDraft({ ...draft, missed: { ...draft.missed, escalate: v } })} label="Notify managers about missed follow-ups" />
            <Field label="Managers" hint="Get escalations and new unassigned leads. Empty = all super admins.">
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {meta.staff.map((s) => {
                  const on = draft.missed.managerUserIds.includes(s.id);
                  return <button key={s.id} type="button" onClick={() => setDraft({ ...draft, missed: { ...draft.missed, managerUserIds: on ? draft.missed.managerUserIds.filter((x) => x !== s.id) : [...draft.missed.managerUserIds, s.id] } })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{s.name}</button>;
                })}
              </div>
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Automation" description="Everything here is off until you switch it on. Customer messages also need an approved template mapped to the event on the WhatsApp / SMS pages.">
        <div className="space-y-3 p-5">
          <Toggle checked={Boolean(auto.enabled)} onChange={(v) => setAuto('enabled', v)} label="Enable CRM automation" />
          <div className={`grid gap-3 md:grid-cols-2 ${auto.enabled ? '' : 'pointer-events-none opacity-50'}`}>
            {AUTOMATION_ITEMS.map((item) => (
              <div key={item.key} className="rounded-xl border border-slate-200 p-3">
                <Toggle checked={Boolean(auto[item.key])} onChange={(v) => setAuto(item.key, v)} label={item.label} />
                <p className="mt-1 pl-6 text-[11px] leading-4 text-slate-500">{item.hint}</p>
                {item.key === 'autoFirstFollowUp' ? <div className="mt-2 pl-6"><Field label="Minutes after the lead arrives"><input type="number" min={5} value={Number(auto.firstFollowUpMinutes) || 30} onChange={(e) => setAuto('firstFollowUpMinutes', Number(e.target.value))} className={inputClass} /></Field></div> : null}
                {item.key === 'reengagement' ? <div className="mt-2 pl-6"><Field label="Quiet days before re-engaging"><input type="number" min={7} value={Number(auto.reengageAfterDays) || 30} onChange={(e) => setAuto('reengageAfterDays', Number(e.target.value))} className={inputClass} /></Field></div> : null}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <span>Last run: {fmtDateTime(state.lastRunAt)}{state.lastRunSummary ? ` · ${Object.entries(state.lastRunSummary).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}</span>
            <Button icon={<Play className="h-4 w-4" />} busy={running} onClick={runNow}>Run now</Button>
          </div>
        </div>
      </Panel>

      <Panel title="Lists">
        <div className="grid gap-4 p-5 md:grid-cols-3">
          <Field label="Lead sources (one per line)"><textarea rows={8} value={sources} onChange={(e) => setSources(e.target.value)} className={inputClass} /></Field>
          <Field label="Lost reasons"><textarea rows={8} value={lostReasons} onChange={(e) => setLostReasons(e.target.value)} className={inputClass} /></Field>
          <Field label="Tags"><textarea rows={8} value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} /></Field>
        </div>
      </Panel>

      <Panel title="Website forms & lead-capture API">
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <Toggle checked={draft.publicForms.enabled} onChange={(v) => setDraft({ ...draft, publicForms: { enabled: v } })} label='Accept "Sell your machine" and "Post requirement" forms' />
            <p className="text-xs text-slate-500">Public pages: <code>/sell-machine</code> and <code>/post-requirement</code> on the website. Submissions become platform leads (source Website form).</p>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <KeyRound className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-800">Lead-capture API</span>
              {config.webhook?.configured ? <Badge tone={config.webhook.enabled ? 'green' : 'slate'}>{config.webhook.enabled ? 'On' : 'Off'} · key {config.webhook.keyHint}</Badge> : <Badge>No key</Badge>}
            </div>
            <p className="text-xs text-slate-500">POST <code>{API_BASE}/crm/webhook/leads</code> with header <code>X-CRM-Key</code> and JSON <code>{'{ name, mobile, city, state, source, leadType, message, budgetMax }'}</code>.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={generateKey}>{config.webhook?.configured ? 'Rotate key' : 'Generate key'}</Button>
              {config.webhook?.configured ? <Button onClick={() => toggleWebhook(!config.webhook?.enabled)}>{config.webhook.enabled ? 'Turn off' : 'Turn on'}</Button> : null}
            </div>
          </div>
        </div>
      </Panel>

      <AssignmentRules meta={meta} />

      {newKey ? (
        <Modal title="Your new API key" subtitle="Copy it now — it will not be shown again." onClose={() => setNewKey(null)}>
          <div className="space-y-4 p-5 sm:p-7">
            <code className="block break-all rounded-xl bg-slate-900 p-4 text-sm text-emerald-300">{newKey}</code>
            <ModalFooter>
              <Button icon={<Copy className="h-4 w-4" />} onClick={() => { void navigator.clipboard.writeText(newKey); toast.success('Copied.'); }}>Copy</Button>
              <Button variant="primary" onClick={() => setNewKey(null)}>Done</Button>
            </ModalFooter>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function AssignmentRules({ meta }: { meta: CrmMeta }) {
  const rules = useCrmResource(() => getJson<Rule[]>('/crm/assignment-rules'), 'crm-rules');
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const remove = async (rule: Rule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return;
    try { await api.delete(`/crm/assignment-rules/${rule.id}`); rules.reload(); } catch (error) { toast.error(crmError(error, 'Could not delete.')); }
  };
  const names = (ids: string[]) => ids.map((id) => meta.staff.find((s) => s.id === id)?.name || 'Removed user').join(', ');
  return (
    <Panel title="Assignment rules" description="Checked top to bottom; the first matching rule assigns the lead. Runs only when automation + auto-assign are on." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Add rule</Button>}>
      {rules.loading && !rules.data ? <LoadingState /> : !rules.data?.length ? <EmptyState title="No rules" description="Example: Chhattisgarh buy leads → round-robin between Asha and Ravi." /> : (
        <ul className="divide-y divide-slate-100">
          {rules.data.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{r.sortOrder}. {r.name} {r.enabled ? null : <Badge>Off</Badge>}</p>
                <p className="text-xs text-slate-500">
                  {[r.conditions?.leadTypes?.length ? r.conditions.leadTypes.map((t) => LEAD_TYPE_LABELS[t] || t).join('/') : 'Any type', r.conditions?.sources?.length ? r.conditions.sources.map(label).join('/') : 'any source', r.conditions?.states?.length ? r.conditions.states.join(', ') : 'any state', r.conditions?.cities?.length ? r.conditions.cities.join(', ') : null].filter(Boolean).join(' · ')}
                  {' → '}{label(r.strategy)}: {names(r.assigneeIds)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setEditing(r)}>Edit</Button>
                <button type="button" onClick={() => remove(r)} className="rounded-xl p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete rule"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? <RuleEditor meta={meta} rule={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); rules.reload(); }} /> : null}
    </Panel>
  );
}

function RuleEditor({ meta, rule, onClose, onSaved }: { meta: CrmMeta; rule: Rule | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(rule?.name || '');
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [sortOrder, setSortOrder] = useState(String(rule?.sortOrder ?? 0));
  const [strategy, setStrategy] = useState(rule?.strategy || 'ROUND_ROBIN');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(rule?.assigneeIds || []);
  const [leadTypes, setLeadTypes] = useState<string[]>(rule?.conditions?.leadTypes || []);
  const [sources, setSources] = useState<string[]>(rule?.conditions?.sources || []);
  const [states, setStates] = useState((rule?.conditions?.states || []).join(', '));
  const [cities, setCities] = useState((rule?.conditions?.cities || []).join(', '));
  const [busy, setBusy] = useState(false);
  const csv = (text: string) => text.split(',').map((s) => s.trim()).filter(Boolean);
  const toggle = (list: string[], value: string, set: (v: string[]) => void) => set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { name, enabled, sortOrder: Number(sortOrder) || 0, strategy, assigneeIds, conditions: { leadTypes, sources, states: csv(states), cities: csv(cities) } };
      if (rule) await api.put(`/crm/assignment-rules/${rule.id}`, body); else await api.post('/crm/assignment-rules', body);
      toast.success('Rule saved.');
      onSaved();
    } catch (error) {
      toast.error(crmError(error, 'Could not save the rule.'));
    } finally {
      setBusy(false);
    }
  };
  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`;
  return (
    <Modal title={rule ? 'Edit assignment rule' : 'New assignment rule'} onClose={onClose} wide>
      <div className="space-y-4 p-5 sm:p-7">
        <div className="grid gap-3 md:grid-cols-[1fr_120px_200px]">
          <Field label="Name *"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
          <Field label="Order"><input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={inputClass} /></Field>
          <Field label="Strategy">
            <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className={selectClass}>
              <option value="ROUND_ROBIN">Round robin</option>
              <option value="LEAST_LOAD">Fewest open leads</option>
              <option value="SPECIFIC_USER">Always the first person</option>
            </select>
          </Field>
        </div>
        <Field label="Assign to *"><div className="flex flex-wrap gap-1.5">{meta.staff.map((s) => <button key={s.id} type="button" onClick={() => toggle(assigneeIds, s.id, setAssigneeIds)} className={chip(assigneeIds.includes(s.id))}>{s.name}</button>)}</div></Field>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">When (leave empty = any)</p>
        <Field label="Lead types"><div className="flex flex-wrap gap-1.5">{meta.enums.leadTypes.map((t) => <button key={t} type="button" onClick={() => toggle(leadTypes, t, setLeadTypes)} className={chip(leadTypes.includes(t))}>{LEAD_TYPE_LABELS[t] || label(t)}</button>)}</div></Field>
        <Field label="Sources"><div className="flex flex-wrap gap-1.5">{meta.config.sources.map((s) => <button key={s} type="button" onClick={() => toggle(sources, s, setSources)} className={chip(sources.includes(s))}>{label(s)}</button>)}</div></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="States (comma separated)"><input value={states} onChange={(e) => setStates(e.target.value)} className={inputClass} /></Field>
          <Field label="Cities (comma separated)"><input value={cities} onChange={(e) => setCities(e.target.value)} className={inputClass} /></Field>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} label="Rule is active" />
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!name.trim() || !assigneeIds.length} onClick={save}>Save rule</Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
