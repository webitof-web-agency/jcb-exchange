'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Flame,
  Megaphone,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import api from '@/lib/api';
import {
  Button,
  EmptyState,
  Field,
  inputClass,
  LoadingState,
  Modal,
  ModalFooter,
  Panel,
  Toggle,
} from '@/components/financeWorkspace/ui';
import {
  CONTACT_TYPES,
  CrmErrorBanner,
  crmError,
  CrmPageFrame,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  PageHeader,
  StatTile,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type ContactLite,
} from './crmShared';

type Filters = {
  lifecycles: string[];
  contactTypes: string[];
  tags: string[];
  states: string[];
  cities: string[];
  leadStatuses: string[];
  leadTypes: string[];
  temperatures: string[];
  sources: string[];
  primeOnly: boolean;
  openLeadOnly: boolean;
  inactiveDays: number | null;
};

type Segment = {
  id: string;
  name: string;
  description: string | null;
  filters: Filters;
  count: number;
};

type Template = {
  id: string;
  name: string;
  language: string;
  category: string;
  needsVariables: boolean;
};

const emptyFilters = (): Filters => ({
  lifecycles: [],
  contactTypes: [],
  tags: [],
  states: [],
  cities: [],
  leadStatuses: [],
  leadTypes: [],
  temperatures: [],
  sources: [],
  primeOnly: false,
  openLeadOnly: false,
  inactiveDays: null,
});

function FilterChipSelector({
  options,
  value,
  onChange,
  nameOf = label,
  colorTone = 'slate',
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  nameOf?: (v: string) => string;
  colorTone?: 'slate' | 'amber' | 'blue' | 'rose';
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        const activeStyles =
          colorTone === 'amber'
            ? 'border-amber-600 bg-amber-600 text-white shadow-xs'
            : colorTone === 'rose'
            ? 'border-rose-600 bg-rose-600 text-white shadow-xs'
            : colorTone === 'blue'
            ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
            : 'border-slate-900 bg-slate-900 text-white shadow-xs';

        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all ${
              on
                ? activeStyles
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {nameOf(o)}
          </button>
        );
      })}
    </div>
  );
}

const describeFilters = (f: Filters) => {
  const parts: string[] = [];
  if (f.lifecycles.length) parts.push(`Lifecycle: ${f.lifecycles.map(label).join('/')}`);
  if (f.contactTypes.length) parts.push(`Type: ${f.contactTypes.map(label).join('/')}`);
  if (f.leadTypes.length) parts.push(`Requirement: ${f.leadTypes.map((t) => LEAD_TYPE_LABELS[t] || t).join('/')}`);
  if (f.leadStatuses.length) parts.push(`Status: ${f.leadStatuses.map(label).join('/')}`);
  if (f.temperatures.length) parts.push(`Heat: ${f.temperatures.map(label).join('/')}`);
  if (f.states.length) parts.push(`States: ${f.states.join(', ')}`);
  if (f.cities.length) parts.push(`Cities: ${f.cities.join(', ')}`);
  if (f.tags.length) parts.push(`Tags: ${f.tags.join(', ')}`);
  if (f.primeOnly) parts.push('⭐ Prime Only');
  if (f.openLeadOnly) parts.push('Active Lead');
  if (f.inactiveDays) parts.push(`Inactive ${f.inactiveDays}+d`);
  return parts.length ? parts.join(' · ') : 'All Contacts (No active filters)';
};

// Preset Smart Segment Templates
const PRESET_TEMPLATES: Array<{
  title: string;
  tag: string;
  description: string;
  filters: Partial<Filters>;
}> = [
  {
    title: '🔥 Hot Machine Buyers',
    tag: 'High Intent',
    description: 'Hot temperature buyers with active deals ready for fast closing.',
    filters: { leadTypes: ['BUY'], temperatures: ['HOT'], openLeadOnly: true },
  },
  {
    title: '⭐ Prime Fleet Owners',
    tag: 'VIP Loyalty',
    description: 'Prime verified members for exclusive equipment broadcast drops.',
    filters: { primeOnly: true },
  },
  {
    title: '⏳ Dormant Re-engagement',
    tag: 'Nurture',
    description: 'Existing contacts with no touchpoints for 30+ days.',
    filters: { inactiveDays: 30 },
  },
  {
    title: '🚜 Excavator Sellers',
    tag: 'Supply Intake',
    description: 'Sellers looking to liquidate machines or update inventory listings.',
    filters: { leadTypes: ['SELL', 'RENT_OUT'], openLeadOnly: true },
  },
];

function Campaigns() {
  const segments = useCrmResource(() => getJson<Segment[]>('/crm/segments'), 'crm-segments');
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const [presetSeed, setPresetSeed] = useState<{ name: string; description: string; filters: Partial<Filters> } | null>(null);
  const [sending, setSending] = useState<Segment | null>(null);
  const [previewingSegment, setPreviewingSegment] = useState<Segment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const remove = async (segment: Segment) => {
    if (!window.confirm(`Delete segment "${segment.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/crm/segments/${segment.id}`);
      toast.success('Segment deleted.');
      segments.reload();
    } catch (error) {
      toast.error(crmError(error, 'Could not delete segment.'));
    }
  };

  const segmentList = segments.data || [];

  // Summary Metrics
  const totalSegments = segmentList.length;
  const totalAudienceReach = useMemo(
    () => segmentList.reduce((acc, s) => acc + (s.count || 0), 0),
    [segmentList]
  );
  const topSegment = useMemo(() => {
    if (!segmentList.length) return null;
    return [...segmentList].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
  }, [segmentList]);

  // Filtered segments
  const filteredSegments = useMemo(() => {
    if (!searchQuery.trim()) return segmentList;
    const q = searchQuery.toLowerCase();
    return segmentList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        describeFilters(s.filters).toLowerCase().includes(q)
    );
  }, [segmentList, searchQuery]);

  const handleLaunchPreset = (preset: (typeof PRESET_TEMPLATES)[0]) => {
    setPresetSeed({
      name: preset.title.replace(/^[^\w]+/, '').trim(),
      description: preset.description,
      filters: preset.filters,
    });
    setEditing('new');
  };

  return (
    <>
      <PageHeader
        title="Audience Segments & Campaigns"
        description="Build multi-dimensional customer segments, estimate live reach, and broadcast targeted WhatsApp campaign drops to verified opt-in numbers."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setPresetSeed(null);
                setEditing('new');
              }}
            >
              New Segment
            </Button>
          </div>
        }
      />

      {/* KPI Command Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Active Segments"
          value={totalSegments}
          tone="text-slate-900"
          icon={<Filter className="h-4 w-4" />}
          hint="Custom audience rules"
        />
        <StatTile
          label="Reachable Audience"
          value={totalAudienceReach.toLocaleString('en-IN')}
          tone="text-emerald-700"
          icon={<Users className="h-4 w-4" />}
          hint="Aggregated segment reach"
        />
        <StatTile
          label="Largest Audience"
          value={topSegment ? topSegment.count.toLocaleString('en-IN') : '0'}
          tone="text-blue-700"
          icon={<Target className="h-4 w-4" />}
          hint={topSegment ? topSegment.name : 'No segments yet'}
        />
        <StatTile
          label="WhatsApp Channel"
          value="Meta Cloud API"
          tone="text-amber-700"
          icon={<Megaphone className="h-4 w-4" />}
          hint="Template opt-in compliant"
        />
      </div>

      {/* 1-Click Smart Audience Presets Strip */}
      <div className="rounded-2xl border border-slate-200/80 bg-linear-to-r from-slate-900 via-slate-800 to-indigo-950 p-4 text-white shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold tracking-wider text-amber-300 uppercase">
                Instant Smart Segments
              </h2>
              <p className="text-xs text-slate-300">
                Generate high-conversion buyer and seller segments with 1 click:
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_TEMPLATES.map((p) => (
              <button
                key={p.title}
                type="button"
                onClick={() => handleLaunchPreset(p)}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white backdrop-blur-xs transition hover:border-amber-400/40 hover:bg-white/10"
              >
                <span>{p.title}</span>
                <span className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-amber-300 group-hover:bg-amber-400/20">
                  {p.tag}
                </span>
                <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-amber-300" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Segments Control Panel */}
      <Panel
        title="Saved Audience Segments"
        description="Filter definitions automatically recalculate matching customer counts in real-time."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search segments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white pr-2.5 pl-8 text-xs font-medium text-slate-800 placeholder-slate-400 focus:border-slate-900 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => segments.reload()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              title="Refresh list"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        {segments.loading && !segments.data ? (
          <LoadingState />
        ) : segments.error ? (
          <CrmErrorBanner message={segments.error} schemaMissing={segments.schemaMissing} />
        ) : !segmentList.length ? (
          <EmptyState
            title="No audience segments yet"
            description="Create custom groups based on equipment interests, locations, buyer heat, or activity levels to send targeted campaigns."
            action={
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setPresetSeed(null);
                  setEditing('new');
                }}
              >
                Create First Segment
              </Button>
            }
          />
        ) : !filteredSegments.length ? (
          <div className="py-12 text-center">
            <Search className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-xs font-semibold text-slate-700">No matching segments found</p>
            <p className="text-[11px] text-slate-400">Try a different search keyword</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSegments.map((s) => {
              const f = s.filters;
              const hasFilters =
                f.lifecycles.length ||
                f.leadTypes.length ||
                f.temperatures.length ||
                f.states.length ||
                f.cities.length ||
                f.primeOnly ||
                f.openLeadOnly ||
                f.inactiveDays;

              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 p-4 transition-colors hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{s.name}</h3>
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                        <Users className="h-3 w-3" />
                        {s.count.toLocaleString('en-IN')} reachable
                      </span>
                      {f.primeOnly && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          ⭐ Prime Only
                        </span>
                      )}
                      {f.openLeadOnly && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          Active Deal
                        </span>
                      )}
                      {f.inactiveDays && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800">
                          Quiet {f.inactiveDays}+d
                        </span>
                      )}
                    </div>

                    {s.description && (
                      <p className="mt-0.5 text-xs text-slate-600 line-clamp-1">{s.description}</p>
                    )}

                    {/* Filter Tags Pill Matrix */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {hasFilters ? (
                        <>
                          {f.leadTypes.map((t) => (
                            <span
                              key={t}
                              className="rounded border border-indigo-200 bg-indigo-50/70 px-1.5 py-0.5 font-semibold text-indigo-700"
                            >
                              Req: {LEAD_TYPE_LABELS[t] || t}
                            </span>
                          ))}
                          {f.temperatures.map((t) => (
                            <span
                              key={t}
                              className="rounded border border-rose-200 bg-rose-50/70 px-1.5 py-0.5 font-semibold text-rose-700"
                            >
                              Heat: {label(t)}
                            </span>
                          ))}
                          {f.states.map((st) => (
                            <span
                              key={st}
                              className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700"
                            >
                              📍 {st}
                            </span>
                          ))}
                          {f.cities.map((ct) => (
                            <span
                              key={ct}
                              className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700"
                            >
                              🏙️ {ct}
                            </span>
                          ))}
                          {f.lifecycles.map((l) => (
                            <span
                              key={l}
                              className="rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-semibold text-teal-700"
                            >
                              Stage: {label(l)}
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          Broad audience (All customer records)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewingSegment(s)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    >
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPresetSeed(null);
                        setEditing(s);
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    >
                      Edit Rules
                    </button>
                    <Button
                      variant="primary"
                      icon={<Megaphone className="h-3.5 w-3.5" />}
                      onClick={() => setSending(s)}
                      disabled={s.count === 0}
                    >
                      Launch WhatsApp
                    </Button>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                      title="Delete segment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {editing ? (
          <SegmentEditorModal
            segment={editing === 'new' ? null : editing}
            initialSeed={presetSeed}
            onClose={() => {
              setEditing(null);
              setPresetSeed(null);
            }}
            onSaved={() => {
              setEditing(null);
              setPresetSeed(null);
              segments.reload();
            }}
          />
        ) : null}

        {sending ? <WhatsAppCampaignModal segment={sending} onClose={() => setSending(null)} /> : null}

        {previewingSegment ? (
          <QuickPreviewModal segment={previewingSegment} onClose={() => setPreviewingSegment(null)} />
        ) : null}
      </Panel>
    </>
  );
}

// Quick Sample Audience Inspector
function QuickPreviewModal({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const [data, setData] = useState<{ count: number; sample: ContactLite[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useMemo(() => {
    let active = true;
    api
      .post('/crm/segments/preview', { filters: segment.filters })
      .then((res) => {
        if (active) setData(res.data);
      })
      .catch((err) => toast.error(crmError(err, 'Failed to load preview.')))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [segment]);

  return (
    <Modal title={`Audience Sample: ${segment.name}`} subtitle={`${segment.count} matching contacts`} onClose={onClose}>
      <div className="space-y-4 p-5">
        {loading ? (
          <LoadingState />
        ) : !data || !data.sample.length ? (
          <EmptyState title="No contacts match this segment" description="Adjust your filters to broaden reach." />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-blue-50/70 p-3 text-xs font-semibold text-blue-900 border border-blue-100">
              <span>Total Reachable in Segment</span>
              <span className="font-bold text-sm text-blue-950">{data.count} contacts</span>
            </div>

            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Sample Contacts in Audience</p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {data.sample.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{c.name || 'Anonymous Contact'}</p>
                    <p className="font-mono text-[11px] text-slate-500">{c.mobile || '—'}</p>
                  </div>
                  <div className="text-right text-[11px]">
                    <span className="text-slate-600">{c.city || c.state || 'Location unlisted'}</span>
                    {(c as { isPrime?: boolean }).isPrime && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800">
                        PRIME
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <ModalFooter>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

// Redesigned Segment Editor with Real-Time Audience Estimator
function SegmentEditorModal({
  segment,
  initialSeed,
  onClose,
  onSaved,
}: {
  segment: Segment | null;
  initialSeed: { name: string; description: string; filters: Partial<Filters> } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { meta } = useCrmMeta();
  const [name, setName] = useState(segment?.name || initialSeed?.name || '');
  const [description, setDescription] = useState(segment?.description || initialSeed?.description || '');
  const [filters, setFilters] = useState<Filters>(
    segment?.filters
      ? { ...emptyFilters(), ...segment.filters }
      : initialSeed?.filters
      ? { ...emptyFilters(), ...initialSeed.filters }
      : emptyFilters()
  );
  const [statesText, setStatesText] = useState(filters.states.join(', '));
  const [citiesText, setCitiesText] = useState(filters.cities.join(', '));
  const [preview, setPreview] = useState<{ count: number; sample: ContactLite[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const fullFilters = (): Filters => ({
    ...filters,
    states: statesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    cities: citiesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  });

  const setPatch = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPreview(null);
  };

  const runPreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await api.post('/crm/segments/preview', { filters: fullFilters() });
      setPreview(res.data);
    } catch (error) {
      toast.error(crmError(error, 'Preview estimation failed.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error('Segment name is required.');
      return;
    }
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, filters: fullFilters() };
      if (segment) {
        await api.put(`/crm/segments/${segment.id}`, body);
      } else {
        await api.post('/crm/segments', body);
      }
      toast.success('Audience segment saved.');
      onSaved();
    } catch (error) {
      toast.error(crmError(error, 'Could not save the segment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={segment ? 'Edit Audience Segment' : 'Create Audience Segment'} onClose={onClose} wide>
      <div className="space-y-4 p-5 sm:p-6">
        {/* Basic Header Info */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Segment Name *">
            <input
              type="text"
              placeholder="e.g. Hot Buyers Raipur Q1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Description / Objective">
            <input
              type="text"
              placeholder="e.g. JCB 3DX & 4DX prospects with high purchase intent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {/* Filter Dimensions */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3.5">
          <Field label="Lead Requirement Type">
            <FilterChipSelector
              options={meta?.enums.leadTypes || []}
              value={filters.leadTypes}
              onChange={(v) => setPatch({ leadTypes: v })}
              nameOf={(t) => LEAD_TYPE_LABELS[t] || label(t)}
              colorTone="blue"
            />
          </Field>

          <Field label="Lead Temperature / Heat">
            <FilterChipSelector
              options={meta?.enums.temperatures || []}
              value={filters.temperatures}
              onChange={(v) => setPatch({ temperatures: v })}
              colorTone="rose"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer Contact Stage">
              <FilterChipSelector
                options={meta?.enums.lifecycles || []}
                value={filters.lifecycles}
                onChange={(v) => setPatch({ lifecycles: v })}
              />
            </Field>
            <Field label="Contact Classification">
              <FilterChipSelector
                options={CONTACT_TYPES}
                value={filters.contactTypes}
                onChange={(v) => setPatch({ contactTypes: v })}
              />
            </Field>
          </div>

          <Field label="Lead Pipeline Status">
            <FilterChipSelector
              options={meta?.enums.statuses || []}
              value={filters.leadStatuses}
              onChange={(v) => setPatch({ leadStatuses: v })}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Target States (comma-separated)">
              <input
                type="text"
                placeholder="Chhattisgarh, Maharashtra..."
                value={statesText}
                onChange={(e) => {
                  setStatesText(e.target.value);
                  setPreview(null);
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Target Cities (comma-separated)">
              <input
                type="text"
                placeholder="Raipur, Bilaspur, Nagpur..."
                value={citiesText}
                onChange={(e) => {
                  setCitiesText(e.target.value);
                  setPreview(null);
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Quiet / Inactive For (Days)">
              <input
                type="number"
                min={0}
                placeholder="e.g. 14"
                value={filters.inactiveDays ?? ''}
                onChange={(e) =>
                  setPatch({ inactiveDays: e.target.value ? Number(e.target.value) : null })
                }
                className={inputClass}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <Toggle
              checked={filters.primeOnly}
              onChange={(v) => setPatch({ primeOnly: v })}
              label="⭐ Prime Members Only"
            />
            <Toggle
              checked={filters.openLeadOnly}
              onChange={(v) => setPatch({ openLeadOnly: v })}
              label="Currently Has Active / Open Deal"
            />
          </div>
        </div>

        {/* Live Estimator Bar */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                Audience Reach Estimation
              </span>
              <p className="text-xs text-blue-800 line-clamp-1">{describeFilters(fullFilters())}</p>
            </div>
            <Button onClick={runPreview} busy={previewLoading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Estimate Count
            </Button>
          </div>

          {preview ? (
            <div className="mt-3 border-t border-blue-200/60 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-blue-950">
                  {preview.count.toLocaleString('en-IN')} Contacts Match
                </span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Ready to Target
                </span>
              </div>
              {preview.sample.length > 0 && (
                <p className="mt-1 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">Sample contacts: </span>
                  {preview.sample.map((c) => c.name || c.mobile).join(', ')}
                  {preview.count > preview.sample.length ? '...' : ''}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!name.trim()} onClick={save}>
            Save Segment
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

// Redesigned WhatsApp Campaign Dispatch Modal with Preview Bubble
function WhatsAppCampaignModal({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const { base } = useCrmBase();
  const templates = useCrmResource(() => getJson<Template[]>('/crm/templates'), 'crm-templates');
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState(`Campaign: ${segment.name}`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ selected: number; optedIn: number; recipients: number } | null>(null);

  const marketingTemplates = (templates.data || []).filter((t) => t.category === 'MARKETING');
  const selectedTemplate = marketingTemplates.find((t) => t.id === templateId);

  const createDraft = async () => {
    if (!templateId) {
      toast.error('Select an approved marketing template.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/crm/segments/${segment.id}/campaign`, { templateId, name });
      setResult(res.data);
      toast.success('WhatsApp campaign draft created.');
    } catch (error) {
      toast.error(crmError(error, 'Could not create campaign draft.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create WhatsApp Campaign"
      subtitle={`${segment.name} · ${segment.count} segment contacts`}
      onClose={onClose}
    >
      <div className="space-y-4 p-5 sm:p-6">
        {result ? (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h4 className="font-bold text-sm">Campaign Draft Created Successfully</h4>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/70 p-3 text-center">
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Selected</p>
                <p className="text-base font-bold text-slate-900">{result.selected}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Opted In</p>
                <p className="text-base font-bold text-emerald-700">{result.optedIn}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase font-semibold">Scheduled</p>
                <p className="text-base font-bold text-blue-700">{result.recipients}</p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Only opted-in marketing numbers are messaged (max 200 per batch). Review parameters and schedule dispatch in WhatsApp Hub.
            </p>
            <div className="pt-1">
              <Link
                href={`${base.replace(/\/crm$/, '')}/whatsapp`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800"
              >
                Go to WhatsApp Dispatch Hub
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <Field label="Campaign Name *">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field
              label="Approved WhatsApp Template *"
              hint={
                !marketingTemplates.length && !templates.loading
                  ? 'No approved marketing templates found. Sync templates on the WhatsApp page.'
                  : undefined
              }
            >
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select an approved marketing template...</option>
                {marketingTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language.toUpperCase()})
                  </option>
                ))}
              </select>
            </Field>

            {/* Simulated WhatsApp Preview Bubble */}
            <div className="rounded-xl border border-slate-200 bg-slate-900/5 p-3">
              <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3 text-emerald-600" /> WhatsApp Message Preview
              </p>
              <div className="max-w-[280px] rounded-2xl rounded-tl-none bg-[#e7fed6] p-3 shadow-xs text-xs text-slate-800">
                <p className="font-bold text-emerald-950">
                  {selectedTemplate ? selectedTemplate.name : 'Template Header'}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
                  Namaste! Exclusive offer on verified JCB heavy machinery for your project requirements. Reply to connect with your relationship manager.
                </p>
                <span className="mt-1 block text-right text-[10px] text-slate-400">10:45 AM ✓✓</span>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200/60">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>DND (Do-Not-Disturb) and unverified contacts are automatically excluded for full compliance.</span>
            </div>
          </>
        )}

        <ModalFooter>
          <Button onClick={onClose}>{result ? 'Done' : 'Cancel'}</Button>
          {!result && (
            <Button
              variant="primary"
              busy={busy}
              disabled={!templateId || !name.trim()}
              icon={<Send className="h-3.5 w-3.5" />}
              onClick={createDraft}
            >
              Create Draft
            </Button>
          )}
        </ModalFooter>
      </div>
    </Modal>
  );
}

export default function CrmCampaignsPage() {
  return (
    <CrmPageFrame>
      <Campaigns />
    </CrmPageFrame>
  );
}
