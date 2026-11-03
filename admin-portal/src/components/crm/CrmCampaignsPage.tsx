'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Crown,
  Edit3,
  Eye,
  Filter,
  Flame,
  Layers,
  LayoutGrid,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Table as TableIcon,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { Button, EmptyState, Field, inputClass, Modal, ModalFooter, tableHeadClass, cellClass, Toggle } from '@/components/financeWorkspace/ui';
import {
  CONTACT_TYPES,
  CrmErrorBanner,
  CrmLoadingState,
  CrmPageFrame,
  CrmSelect,
  crmError,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type ContactLite,
} from './crmShared';
import { confirmDelete } from '@/store/confirmDeleteStore';

type PipelineStageMeta = {
  code: string;
  name: string;
};

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

const EMPTY_PIPELINE_STAGES: readonly PipelineStageMeta[] = [];
const EMPTY_SEGMENTS: Segment[] = [];

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
  colorTone?: 'slate' | 'amber' | 'blue' | 'rose' | 'emerald';
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        const activeStyles =
          colorTone === 'amber'
            ? 'border-amber-600 bg-amber-600 text-white shadow-2xs'
            : colorTone === 'rose'
            ? 'border-rose-600 bg-rose-600 text-white shadow-2xs'
            : colorTone === 'blue'
            ? 'border-blue-600 bg-blue-600 text-white shadow-2xs'
            : colorTone === 'emerald'
            ? 'border-emerald-600 bg-emerald-600 text-white shadow-2xs'
            : 'border-slate-900 bg-slate-900 text-white shadow-2xs';

        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all ${
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

const pipelineStageName = (stages: readonly PipelineStageMeta[], status: string) =>
  stages.find((stage) => stage.code === status)?.name || label(status);

const describeFilters = (f: Filters, stages: readonly PipelineStageMeta[] = []) => {
  const parts: string[] = [];
  if (f.lifecycles.length) parts.push(`Lifecycle: ${f.lifecycles.map(label).join('/')}`);
  if (f.contactTypes.length) parts.push(`Type: ${f.contactTypes.map(label).join('/')}`);
  if (f.leadTypes.length) parts.push(`Intent: ${f.leadTypes.map((t) => LEAD_TYPE_LABELS[t] || t).join('/')}`);
  if (f.leadStatuses.length) parts.push(`Stage: ${f.leadStatuses.map((s) => pipelineStageName(stages, s)).join('/')}`);
  if (f.temperatures.length) parts.push(`Heat: ${f.temperatures.map(label).join('/')}`);
  if (f.states.length) parts.push(`States: ${f.states.join(', ')}`);
  if (f.cities.length) parts.push(`Cities: ${f.cities.join(', ')}`);
  if (f.tags.length) parts.push(`Tags: ${f.tags.join(', ')}`);
  if (f.primeOnly) parts.push('⭐ Prime Only');
  if (f.openLeadOnly) parts.push('Active Lead');
  if (f.inactiveDays) parts.push(`Inactive ${f.inactiveDays}+d`);
  return parts.length ? parts.join(' · ') : 'All Contacts (No active filters)';
};

// 1-Click Smart Segment Presets
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
    title: '🚜 Machinery Sellers',
    tag: 'Supply Intake',
    description: 'Sellers looking to liquidate machines or update inventory listings.',
    filters: { leadTypes: ['SELL', 'RENT_OUT'], openLeadOnly: true },
  },
  {
    title: '⏳ Dormant Re-engagement',
    tag: 'Nurture',
    description: 'Existing contacts with no recorded touchpoints for 30+ days.',
    filters: { inactiveDays: 30 },
  },
  {
    title: '📍 Regional Raipur Hub',
    tag: 'Geo Cluster',
    description: 'Raipur & Chhattisgarh machinery contractors and operators.',
    filters: { states: ['Chhattisgarh'], cities: ['Raipur'] },
  },
];

function Campaigns() {
  const { meta } = useCrmMeta();
  const segments = useCrmResource<Segment[]>(() => getJson<Segment[]>('/crm/segments'), 'crm-segments');
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const [presetSeed, setPresetSeed] = useState<{ name: string; description: string; filters: Partial<Filters> } | null>(null);
  const [sending, setSending] = useState<Segment | null>(null);
  const [previewingSegment, setPreviewingSegment] = useState<Segment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'ACTIVE_LEADS' | 'PRIME' | 'BUYERS' | 'SELLERS'>('ALL');
  const [viewMode, setViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const pipelineStages = meta?.pipelineStages ?? EMPTY_PIPELINE_STAGES;

  const remove = async (segment: Segment) => {
    if (!(await confirmDelete({ title: 'Delete this audience segment?', itemName: segment.name, note: 'Campaigns already sent are not affected.' }))) return;
    try {
      await api.delete(`/crm/segments/${segment.id}`);
      toast.success('Audience segment deleted.');
      segments.reload();
    } catch (error) {
      toast.error(crmError(error, 'Could not delete segment.'));
    }
  };

  const segmentList = segments.data ?? EMPTY_SEGMENTS;

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

  // Filtered segments with search and quick filter pills
  const filteredSegments = useMemo(() => {
    let result = segmentList;

    if (filterMode === 'ACTIVE_LEADS') {
      result = result.filter((s) => s.filters.openLeadOnly);
    } else if (filterMode === 'PRIME') {
      result = result.filter((s) => s.filters.primeOnly);
    } else if (filterMode === 'BUYERS') {
      result = result.filter((s) => s.filters.leadTypes.includes('BUY'));
    } else if (filterMode === 'SELLERS') {
      result = result.filter((s) => s.filters.leadTypes.includes('SELL') || s.filters.leadTypes.includes('RENT_OUT'));
    }

    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase();
    return result.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        describeFilters(s.filters, pipelineStages).toLowerCase().includes(q)
    );
  }, [filterMode, pipelineStages, segmentList, searchQuery]);

  const handleLaunchPreset = (preset: (typeof PRESET_TEMPLATES)[0]) => {
    setPresetSeed({
      name: preset.title.replace(/^[^\w]+/, '').trim(),
      description: preset.description,
      filters: preset.filters,
    });
    setEditing('new');
  };

  return (
    <div className="w-full space-y-3.5 text-slate-800">
      {/* 1. TOP EXECUTIVE CONTROL & KPI COCKPIT */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
                Audience Segments & WhatsApp Campaigns
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200/90 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Meta Cloud API Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Multi-dimensional customer segmentation, instant reach estimation, and targeted WhatsApp broadcast drops.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => segments.reload()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition shadow-2xs"
              title="Refresh segments"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${segments.loading ? 'animate-spin text-amber-600' : ''}`} />
            </button>

            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setPresetSeed(null);
                setEditing('new');
              }}
              className="!py-1.5 !text-xs font-bold"
            >
              New Segment
            </Button>
          </div>
        </div>

        {/* 4 High-Density Compact KPI Tiles */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Active Segments
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                <Filter className="h-3 w-3" />
              </span>
            </div>
            <div className="mt-1.5">
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">{totalSegments}</p>
              <p className="text-[10.5px] text-slate-500 font-medium">Custom audience rules</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Total Reachable
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                <Users className="h-3 w-3" />
              </span>
            </div>
            <div className="mt-1.5">
              <p className="text-lg sm:text-xl font-black text-emerald-700 tracking-tight">
                {totalAudienceReach.toLocaleString('en-IN')}
              </p>
              <p className="text-[10.5px] text-slate-500 font-medium">Aggregated verified contacts</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Dominant Audience
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60">
                <Target className="h-3 w-3" />
              </span>
            </div>
            <div className="mt-1.5 min-w-0">
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
                {topSegment ? topSegment.count.toLocaleString('en-IN') : '0'}
              </p>
              <p className="text-[10.5px] text-slate-500 font-medium truncate" title={topSegment?.name || ''}>
                {topSegment ? topSegment.name : 'No audience defined'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Broadcast Engine
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-purple-50 text-purple-700 border border-purple-200/60">
                <Megaphone className="h-3 w-3" />
              </span>
            </div>
            <div className="mt-1.5">
              <p className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">WhatsApp Meta</p>
              <p className="text-[10.5px] text-emerald-700 font-semibold">DND & Opt-in Protected</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. 1-CLICK INSTANT SMART AUDIENCE PRESETS STRIP */}
      <section className="rounded-2xl border border-slate-800 bg-linear-to-r from-slate-950 via-slate-900 to-indigo-950 p-3.5 sm:p-4 text-white shadow-xs">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/20 text-amber-300">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div>
              <h2 className="text-xs font-bold tracking-wider text-amber-300 uppercase">
                1-Click Smart Audience Presets
              </h2>
              <p className="text-[11px] text-slate-300">
                Launch pre-configured high-intent segments instantly:
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_TEMPLATES.map((p) => (
              <button
                key={p.title}
                type="button"
                onClick={() => handleLaunchPreset(p)}
                className="group inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-xs transition hover:border-amber-400/50 hover:bg-white/10"
              >
                <span>{p.title}</span>
                <span className="rounded bg-white/10 px-1 py-0.2 text-[9.5px] font-bold text-amber-300 group-hover:bg-amber-400/20">
                  {p.tag}
                </span>
                <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-amber-300 transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. MAIN SAVED SEGMENTS WORKSPACE */}
      <section className="w-full rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {/* Unified Search & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 p-3 sm:px-4 bg-slate-50/60">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search audience by name, criteria, city…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>

            {/* Quick Filter Pills */}
            <div className="flex items-center gap-1 text-xs">
              {(
                [
                  { id: 'ALL', name: `All (${totalSegments})` },
                  { id: 'ACTIVE_LEADS', name: 'Active Deals' },
                  { id: 'PRIME', name: 'Prime VIP' },
                  { id: 'BUYERS', name: 'Buyers' },
                  { id: 'SELLERS', name: 'Sellers' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                    filterMode === tab.id
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </div>

          {/* View Mode Toggle: Table Matrix vs Visual Cards */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('TABLE')}
              title="Table Matrix View"
              className={`flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-bold transition-all ${
                viewMode === 'TABLE' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Table Matrix</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              title="Cards Grid View"
              className={`flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-bold transition-all ${
                viewMode === 'CARDS' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cards Grid</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        {segments.loading && !segments.data ? (
          <div className="p-8">
            <CrmLoadingState label="Loading audience segments…" />
          </div>
        ) : segments.error ? (
          <div className="p-4">
            <CrmErrorBanner message={segments.error} schemaMissing={segments.schemaMissing} />
          </div>
        ) : !segmentList.length ? (
          <div className="p-8">
            <EmptyState
              title="No audience segments yet"
              description="Create targeted customer groups based on equipment interests, locations, buyer heat, or activity levels to broadcast WhatsApp campaigns."
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
          </div>
        ) : !filteredSegments.length ? (
          <div className="py-12 text-center text-xs">
            <Search className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 font-bold text-slate-700">No matching audience segments</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Try clearing your search keyword or switching filter pills</p>
          </div>
        ) : viewMode === 'TABLE' ? (
          /* ─── DENSE TABLE MATRIX VIEW (FULL WIDTH & HIGH READABILITY) ─── */
          <div className="w-full overflow-x-auto [scrollbar-width:thin]">
            <table className="w-full min-w-full text-left text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700 min-w-[200px]">Audience Segment Name</th>
                  <th className="px-3 py-2.5 font-bold text-slate-700 min-w-[120px]">Target Intent</th>
                  <th className="px-3 py-2.5 font-bold text-slate-700 min-w-[100px]">Lead Heat</th>
                  <th className="px-3 py-2.5 font-bold text-slate-700 min-w-[130px]">Geographic Scope</th>
                  <th className="px-3 py-2.5 font-bold text-slate-700 min-w-[120px]">Audience Flags</th>
                  <th className="px-3 py-2.5 text-right font-bold text-slate-700 min-w-[110px] whitespace-nowrap">
                    Reachable Reach
                  </th>
                  <th className="w-36 px-3.5 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">
                    Quick Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSegments.map((s) => {
                  const f = s.filters;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Notes */}
                      <td className={`${cellClass}`}>
                        <div>
                          <p className="font-black text-slate-900 text-xs sm:text-[13px]">{s.name}</p>
                          {s.description ? (
                            <p className="text-[11px] text-slate-500 font-medium line-clamp-1 mt-0.5">
                              {s.description}
                            </p>
                          ) : null}
                        </div>
                      </td>

                      {/* Lead Intent */}
                      <td className={`${cellClass}`}>
                        {f.leadTypes.length ? (
                          <div className="flex flex-wrap gap-1">
                            {f.leadTypes.map((t) => (
                              <span
                                key={t}
                                className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.2 text-[10px] font-bold text-indigo-700"
                              >
                                {LEAD_TYPE_LABELS[t] || t}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">All Intents</span>
                        )}
                      </td>

                      {/* Heat */}
                      <td className={`${cellClass}`}>
                        {f.temperatures.length ? (
                          <div className="flex flex-wrap gap-1">
                            {f.temperatures.map((t) => (
                              <span
                                key={t}
                                className={`inline-flex items-center rounded-md border px-1.5 py-0.2 text-[10px] font-bold ${
                                  t === 'HOT'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : t === 'WARM'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}
                              >
                                {t === 'HOT' ? '🔥 ' : ''}
                                {label(t)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Any Temperature</span>
                        )}
                      </td>

                      {/* Locations */}
                      <td className={`${cellClass}`}>
                        {f.states.length || f.cities.length ? (
                          <div className="flex flex-wrap gap-1">
                            {[...f.states, ...f.cities].slice(0, 3).map((loc) => (
                              <span
                                key={loc}
                                className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.2 text-[10px] font-semibold text-slate-700"
                              >
                                <MapPin className="h-2.5 w-2.5 text-slate-400" />
                                {loc}
                              </span>
                            ))}
                            {[...f.states, ...f.cities].length > 3 ? (
                              <span className="text-[10px] font-bold text-slate-400">
                                +{[...f.states, ...f.cities].length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Pan-India (All)</span>
                        )}
                      </td>

                      {/* Flags */}
                      <td className={`${cellClass}`}>
                        <div className="flex flex-wrap gap-1">
                          {f.primeOnly && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 border border-amber-300 px-1.5 py-0.2 text-[10px] font-bold text-amber-900">
                              <Crown className="h-2.5 w-2.5 text-amber-600" />
                              Prime
                            </span>
                          )}
                          {f.openLeadOnly && (
                            <span className="inline-flex items-center rounded-md bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 text-[10px] font-bold text-emerald-900">
                              Active Deal
                            </span>
                          )}
                          {f.inactiveDays && (
                            <span className="inline-flex items-center rounded-md bg-purple-100 border border-purple-200 px-1.5 py-0.2 text-[10px] font-bold text-purple-900">
                              Quiet {f.inactiveDays}+d
                            </span>
                          )}
                          {!f.primeOnly && !f.openLeadOnly && !f.inactiveDays && (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </div>
                      </td>

                      {/* Reachable Count */}
                      <td className={`${cellClass} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-black text-slate-900 text-sm">
                            {s.count.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">leads</span>
                        </div>
                      </td>

                      {/* Quick Action Buttons */}
                      <td className={`${cellClass} text-right whitespace-nowrap`}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setPreviewingSegment(s)}
                            title="Sample contacts preview"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition shadow-2xs"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPresetSeed(null);
                              setEditing(s);
                            }}
                            title="Edit criteria rules"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition shadow-2xs"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setSending(s)}
                            disabled={s.count === 0}
                            title="Launch WhatsApp broadcast"
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-2xs disabled:opacity-40"
                          >
                            <MessageCircle className="h-3 w-3" />
                            Drop
                          </button>

                          <button
                            type="button"
                            onClick={() => remove(s)}
                            title="Delete segment"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ─── VISUAL CARDS GRID VIEW ─── */
          <div className="grid gap-3.5 p-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSegments.map((s) => {
              const f = s.filters;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs flex flex-col justify-between space-y-3 hover:border-amber-400 transition-all hover:shadow-md"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-black text-slate-900 text-sm truncate">{s.name}</h3>
                        {s.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{s.description}</p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-black text-blue-800 shrink-0">
                        <Users className="h-3 w-3" />
                        {s.count.toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Filter Tags */}
                    <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
                      {f.leadTypes.map((t) => (
                        <span key={t} className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 font-bold text-indigo-700">
                          {LEAD_TYPE_LABELS[t] || t}
                        </span>
                      ))}
                      {f.temperatures.map((t) => (
                        <span key={t} className="rounded bg-rose-50 border border-rose-200 px-1.5 py-0.2 font-bold text-rose-700">
                          {label(t)}
                        </span>
                      ))}
                      {f.primeOnly && (
                        <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.2 font-bold text-amber-900">
                          ⭐ Prime
                        </span>
                      )}
                      {f.openLeadOnly && (
                        <span className="rounded bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 font-bold text-emerald-900">
                          Active Deal
                        </span>
                      )}
                      {f.states.map((st) => (
                        <span key={st} className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.2 font-semibold text-slate-700">
                          📍 {st}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewingSegment(s)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <Eye className="h-3 w-3 text-slate-400" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPresetSeed(null);
                          setEditing(s);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <Edit3 className="h-3 w-3 text-slate-400" />
                        Edit
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSending(s)}
                        disabled={s.count === 0}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-2xs disabled:opacity-40"
                      >
                        <MessageCircle className="h-3 w-3" />
                        Broadcast
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        className="p-1 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                        title="Delete segment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODALS */}
      {editing ? (
        <SegmentEditorModal
          segment={editing === 'new' ? null : editing}
          initialSeed={presetSeed}
          pipelineStages={pipelineStages}
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
    </div>
  );
}

// Quick Sample Audience Inspector Modal
function QuickPreviewModal({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const [data, setData] = useState<{ count: number; sample: ContactLite[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      <div className="space-y-3.5 p-5">
        {loading ? (
          <CrmLoadingState label="Inspecting audience sample…" />
        ) : !data || !data.sample.length ? (
          <EmptyState title="No contacts match this segment" description="Adjust your filters to broaden reach." />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-blue-50/70 p-3 text-xs font-bold text-blue-900 border border-blue-200/60">
              <span>Total Reachable in Segment</span>
              <span className="font-black text-sm text-blue-950">{data.count.toLocaleString('en-IN')} contacts</span>
            </div>

            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sample Contacts in Audience</p>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200/90 bg-white">
              {data.sample.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 text-xs hover:bg-slate-50/70 transition-colors">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{c.name || 'Anonymous Contact'}</p>
                    <p className="font-mono text-[11px] text-slate-500">{c.mobile || '—'}</p>
                  </div>
                  <div className="text-right text-[11px]">
                    <span className="text-slate-600 font-medium">{c.city || c.state || 'Location unlisted'}</span>
                    {(c as { isPrime?: boolean }).isPrime && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
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

// Compact, High-Density Segment Editor with Real-Time Audience Estimator
function SegmentEditorModal({
  segment,
  initialSeed,
  pipelineStages,
  onClose,
  onSaved,
}: {
  segment: Segment | null;
  initialSeed: { name: string; description: string; filters: Partial<Filters> } | null;
  pipelineStages: readonly PipelineStageMeta[];
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

  const statusOptions = [
    ...pipelineStages.map((stage) => stage.code),
    ...filters.leadStatuses.filter((status) => !pipelineStages.some((stage) => stage.code === status)),
  ];
  const statusName = (status: string) => {
    const stage = pipelineStages.find((candidate) => candidate.code === status);
    return stage ? stage.name : `${label(status)} (archived)`;
  };

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
      <div className="space-y-4 p-5 sm:p-6 text-xs text-slate-800">
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
          <Field label="Objective / Notes">
            <input
              type="text"
              placeholder="e.g. Backhoe & excavator prospects with immediate purchase intent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        {/* 2-Column Responsive Filter Matrix */}
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* Column 1: Equipment & Lead Intent */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200/60 pb-1.5">
              1. Equipment Intent & Pipeline Criteria
            </h4>

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

            <Field label="Lead Pipeline Stage">
              <FilterChipSelector
                options={statusOptions}
                value={filters.leadStatuses}
                onChange={(v) => setPatch({ leadStatuses: v })}
                nameOf={statusName}
                colorTone="amber"
              />
            </Field>
          </div>

          {/* Column 2: Geographic & Customer Profile */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200/60 pb-1.5">
              2. Geographic Scope & Contact Profile
            </h4>

            <div className="grid gap-2.5 sm:grid-cols-2">
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
                  placeholder="Raipur, Bilaspur, Durg..."
                  value={citiesText}
                  onChange={(e) => {
                    setCitiesText(e.target.value);
                    setPreview(null);
                  }}
                  className={inputClass}
                />
              </Field>
            </div>

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

            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1">
                <Field label="Inactive For (Days Quiet)">
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 30"
                    value={filters.inactiveDays ?? ''}
                    onChange={(e) =>
                      setPatch({ inactiveDays: e.target.value ? Number(e.target.value) : null })
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="space-y-1.5 pt-4">
                <Toggle
                  checked={filters.primeOnly}
                  onChange={(v) => setPatch({ primeOnly: v })}
                  label="⭐ Prime Only"
                />
                <Toggle
                  checked={filters.openLeadOnly}
                  onChange={(v) => setPatch({ openLeadOnly: v })}
                  label="Active Deal Only"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Live Estimator Bar */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 shadow-2xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-blue-950 uppercase tracking-wider">
                Audience Reach Estimation
              </span>
              <p className="text-xs text-blue-800 line-clamp-1 mt-0.5">
                {describeFilters(fullFilters(), pipelineStages)}
              </p>
            </div>
            <Button onClick={runPreview} busy={previewLoading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Estimate Count
            </Button>
          </div>

          {preview ? (
            <div className="mt-3 border-t border-blue-200/70 pt-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-black text-blue-950">
                  {preview.count.toLocaleString('en-IN')} Contacts Match
                </span>
                <span className="rounded-md bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
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
            Save Audience Segment
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

// Redesigned WhatsApp Campaign Dispatch Modal with Preview Bubble
function WhatsAppCampaignModal({ segment, onClose }: { segment: Segment; onClose: () => void }) {
  const { base } = useCrmBase();
  const templates = useCrmResource<Template[]>(() => getJson<Template[]>('/crm/templates'), 'crm-templates');
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
      <div className="space-y-4 p-5 sm:p-6 text-xs text-slate-800">
        {result ? (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 shadow-2xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <h4 className="font-bold text-sm">Campaign Draft Created Successfully</h4>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/80 p-3 text-center border border-emerald-200/60">
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 transition"
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
              <CrmSelect
                options={[{ id: '', name: 'Select an approved marketing template...' }, ...marketingTemplates.map((t) => ({ id: t.id, name: `${t.name} (${t.language.toUpperCase()})` }))]}
                value={templateId}
                onChange={(next) => setTemplateId(next)}
                searchable
                className="w-full"
              />
            </Field>

            {/* Simulated WhatsApp Preview Bubble */}
            <div className="rounded-xl border border-slate-200 bg-slate-900/5 p-3">
              <p className="text-[10.5px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3 text-emerald-600" /> WhatsApp Message Preview
              </p>
              <div className="max-w-[280px] rounded-2xl rounded-tl-none bg-[#e7fed6] border border-[#d2f8b8] p-3 shadow-xs text-xs text-slate-800">
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
    <CrmPageFrame fluid={true}>
      <Campaigns />
    </CrmPageFrame>
  );
}
