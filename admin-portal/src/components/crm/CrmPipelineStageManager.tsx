'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { CrmLoadingState, crmError } from './crmShared';

export type CrmPipelineStage = {
  id: string;
  code: string;
  name: string;
  order: number;
  color: string;
  isTerminal: boolean;
  isSystem: boolean;
  usageCount: number;
};

const COLORS = ['blue', 'slate', 'purple', 'indigo', 'amber', 'orange', 'zinc', 'emerald', 'rose', 'cyan', 'teal', 'pink', 'lime', 'green', 'violet', 'red', 'gray'];
const COLOR_DOTS: Record<string, string> = {
  blue: 'bg-blue-500', slate: 'bg-slate-500', purple: 'bg-purple-500', indigo: 'bg-indigo-500', amber: 'bg-amber-500',
  orange: 'bg-orange-500', zinc: 'bg-zinc-400', emerald: 'bg-emerald-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500',
  teal: 'bg-teal-500', pink: 'bg-pink-500', lime: 'bg-lime-500', green: 'bg-green-500', violet: 'bg-violet-500', red: 'bg-red-500', gray: 'bg-gray-500',
};

const stageCodePreview = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'NEW_STAGE';

const readStages = (value: unknown): CrmPipelineStage[] => {
  if (Array.isArray(value)) return value as CrmPipelineStage[];
  if (value && typeof value === 'object') {
    const record = value as { stages?: unknown; data?: unknown };
    if (Array.isArray(record.stages)) return record.stages as CrmPipelineStage[];
    if (Array.isArray(record.data)) return record.data as CrmPipelineStage[];
  }
  return [];
};

const sortStages = (stages: CrmPipelineStage[]) => [...stages].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

export default function CrmPipelineStageManager({ onChanged }: { onChanged: () => void }) {
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<CrmPipelineStage | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const openStageCount = stages.filter((stage) => !stage.isTerminal).length;

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.get('/crm/pipeline-stages');
      setStages(sortStages(readStages(response.data)));
    } catch (err) {
      setError(crmError(err, 'Could not load pipeline stages.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (stage: CrmPipelineStage) => {
    setEditing(stage);
    setFormOpen(true);
  };

  const deleteStage = async (stage: CrmPipelineStage) => {
    if (stage.usageCount > 0 || (!stage.isTerminal && openStageCount <= 1) || stage.code === 'WON' || stage.code === 'LOST') return;
    if (!window.confirm(`Delete the empty stage "${stage.name}"?`)) return;
    try {
      await api.delete(`/crm/pipeline-stages/${encodeURIComponent(stage.code)}`);
      toast.success('Pipeline stage deleted.');
      await load();
      onChanged();
    } catch (err) {
      toast.error(crmError(err, 'Could not delete the pipeline stage.'));
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-[2px] sm:p-6" role="presentation">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="crm-stage-manager-title">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 id="crm-stage-manager-title" className="text-base font-bold text-slate-900">Manage Pipeline Stages</h2>
              <p className="truncate text-xs text-slate-500">Existing stages are preserved. Empty stages can be deleted.</p>
            </div>
          </div>
          <button type="button" onClick={onChanged} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close stage manager">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 sm:px-6">
          <p className="text-xs font-semibold text-slate-500">{stages.length} configured stage{stages.length === 1 ? '' : 's'}</p>
          <button type="button" onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-slate-950 shadow-2xs transition hover:bg-amber-300">
            <Plus className="h-4 w-4" /> Add Stage
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? <CrmLoadingState label="Loading stages…" /> : null}
          {!loading && error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</p> : null}
          {!loading && !error && !stages.length ? <p className="py-12 text-center text-sm font-semibold text-slate-500">No pipeline stages found.</p> : null}
          {!loading && !error && stages.length ? (
            <div className="space-y-2">
              {sortStages(stages).map((stage) => (
                <div key={stage.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-2xs sm:px-4">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${COLOR_DOTS[stage.color] || COLOR_DOTS.gray}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{stage.name}</p>
                      {stage.isSystem ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">Default</span> : null}
                      {stage.isTerminal ? <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Closed</span> : null}
                    </div>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{stage.code} · Order {stage.order} · {stage.usageCount} lead{stage.usageCount === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => openEdit(stage)} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${stage.name}`} title={`Edit ${stage.name}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteStage(stage)}
                      disabled={stage.usageCount > 0 || (!stage.isTerminal && openStageCount <= 1) || stage.code === 'WON' || stage.code === 'LOST'}
                      className={`rounded-lg p-2 transition ${stage.usageCount > 0 || (!stage.isTerminal && openStageCount <= 1) || stage.code === 'WON' || stage.code === 'LOST' ? 'cursor-not-allowed text-slate-200' : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'}`}
                      aria-label={stage.code === 'WON' || stage.code === 'LOST' ? `${stage.name} is a system close stage` : stage.usageCount > 0 ? `${stage.name} is in use` : (!stage.isTerminal && openStageCount <= 1) ? `${stage.name} is the last open stage` : `Delete ${stage.name}`}
                      title={stage.code === 'WON' || stage.code === 'LOST' ? 'Won/Lost are protected system close stages' : stage.usageCount > 0 ? `Cannot delete: ${stage.usageCount} lead(s) use this stage` : (!stage.isTerminal && openStageCount <= 1) ? 'At least one open stage must remain' : `Delete ${stage.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <StageForm
          stage={editing}
          nextOrder={Math.max(...stages.map((stage) => stage.order), 0) + 10}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await load();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function StageForm({ stage, nextOrder, onClose, onSaved }: { stage: CrmPipelineStage | null; nextOrder: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(stage?.name || '');
  const [order, setOrder] = useState(String(stage?.order ?? nextOrder));
  const [color, setColor] = useState(stage?.color || 'blue');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const code = useMemo(() => stage?.code || stageCodePreview(name), [name, stage?.code]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Stage name is required.');
      return;
    }
    try {
      setBusy(true);
      setError('');
      const payload = { name: name.trim(), order: Number(order) || nextOrder, color };
      if (stage) await api.put(`/crm/pipeline-stages/${encodeURIComponent(stage.code)}`, payload);
      else await api.post('/crm/pipeline-stages', payload);
      toast.success(stage ? 'Pipeline stage updated.' : 'Pipeline stage created.');
      await onSaved();
    } catch (err) {
      setError(crmError(err, 'Could not save the pipeline stage.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/30 p-4" role="presentation">
      <form onSubmit={save} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="crm-stage-form-title">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="crm-stage-form-title" className="text-base font-bold text-slate-900">{stage ? 'Edit Stage' : 'Add Stage'}</h3>
            <p className="mt-0.5 text-xs text-slate-500">Stage code: <span className="font-bold text-slate-700">{code}</span></p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close stage form"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block text-xs font-bold text-slate-700">Stage name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoFocus className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" placeholder="e.g. Site Visit" /></label>
          <label className="block text-xs font-bold text-slate-700">Display order<input type="number" min={1} max={10000} value={order} onChange={(event) => setOrder(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" /></label>
          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">Stage color</p>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((item) => <button key={item} type="button" onClick={() => setColor(item)} aria-label={`Use ${item} color`} className={`flex h-8 w-8 items-center justify-center rounded-lg border ${color === item ? 'border-slate-900 bg-slate-100 ring-2 ring-amber-300' : 'border-slate-200 bg-white'}`}><span className={`h-3 w-3 rounded-full ${COLOR_DOTS[item]}`} /></button>)}
            </div>
          </div>
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Saving…' : stage ? 'Save Changes' : 'Create Stage'}</button>
        </div>
      </form>
    </div>
  );
}
