'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlarmClock,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Flame,
  Inbox,
  Kanban,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Tractor,
  Trophy,
  Users,
  UserX,
  Zap,
  Layers,
  Activity,
  FileSpreadsheet,
  FileUp,
} from 'lucide-react';
import { Button, EmptyState } from '@/components/financeWorkspace/ui';
import {
  CompleteFollowUpModal,
  RescheduleModal,
  ScheduleFollowUpModal,
} from './CrmModals';
import LeadForm from './LeadForm';
import {
  CrmErrorBanner,
  CrmLoadingState,
  CrmPageFrame,
  crmPath,
  fmtDate,
  fmtDateTime,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  leadWhatsAppMessage,
  phoneLinks,
  relative,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type FollowUp,
} from './crmShared';

type Dashboard = {
  kpis: {
    openLeads: number;
    newToday: number;
    unassigned: number | null;
    hotLeads: number;
    leadsWithoutFollowUp: number;
    slaBreached: number;
    wonThisMonth: number;
    wonValueThisMonth: number;
    winRateThisMonth: number;
  };
  followUps: { overdue: number; today: number; upcoming: number; doneToday: number; missed: number };
  myAgenda: FollowUp[];
  pipeline: Array<{ status: string; count: number; expectedValue: number }>;
  sources30d: Array<{ source: string; count: number }>;
  recent: Array<{
    id: string;
    status: string;
    leadType: string;
    temperature: string;
    createdAt: string;
    listingTitleSnapshot: string | null;
    customer: { name: string | null; mobile: string | null };
    owner: { name: string | null } | null;
  }>;
  team: Array<{
    userId: string | null;
    name: string;
    openLeads: number;
    overdue: number;
    dueToday: number;
    doneToday: number;
  }> | null;
};

const STAGE_CONFIG: Record<string, { bar: string; dot: string; text: string; bg: string }> = {
  NEW: { bar: 'bg-blue-500', dot: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50' },
  CONTACTED: { bar: 'bg-slate-500', dot: 'bg-slate-500', text: 'text-slate-700', bg: 'bg-slate-50' },
  QUALIFIED: { bar: 'bg-purple-500', dot: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50' },
  INTERESTED: { bar: 'bg-indigo-500', dot: 'bg-indigo-500', text: 'text-indigo-700', bg: 'bg-indigo-50' },
  INSPECTION_SCHEDULED: { bar: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-800', bg: 'bg-amber-50' },
  NEGOTIATION: { bar: 'bg-orange-500', dot: 'bg-orange-500', text: 'text-orange-800', bg: 'bg-orange-50' },
  ON_HOLD: { bar: 'bg-zinc-400', dot: 'bg-zinc-400', text: 'text-zinc-700', bg: 'bg-zinc-50' },
  WON: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-800', bg: 'bg-emerald-50' },
  LOST: { bar: 'bg-rose-500', dot: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
};

const SOURCE_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-indigo-500',
  'bg-sky-500',
  'bg-orange-500',
  'bg-teal-500',
];

function Dashboard() {
  const { meta } = useCrmMeta();
  const { base, isPartnerPortal } = useCrmBase();
  const router = useRouter();
  const [now] = useState(() => Date.now());

  // Modal states
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [scheduling, setScheduling] = useState(false);

  // Agenda filter & search
  const [agendaTab, setAgendaTab] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [agendaSearch, setAgendaSearch] = useState('');

  // Inquiries filter
  const [inquiryFilter, setInquiryFilter] = useState<'all' | 'hot' | 'buy' | 'sell'>('all');

  // Phone copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const data = useCrmResource(() => getJson<Dashboard>('/crm/dashboard'), 'crm-dashboard');
  const access = meta?.access;

  const copyPhone = (id: string, mobile: string | null | undefined) => {
    if (!mobile) return;
    navigator.clipboard.writeText(mobile);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const leadsPath = (query: string) => crmPath(base, 'leads', query);

  // Filtered Agenda items
  const filteredAgenda = useMemo(() => {
    if (!data.data?.myAgenda) return [];
    let items = data.data.myAgenda;

    // Filter by tab
    if (agendaTab === 'overdue') {
      items = items.filter((f) => new Date(f.dueAt).getTime() < now);
    } else if (agendaTab === 'today') {
      items = items.filter((f) => {
        const dueTime = new Date(f.dueAt).getTime();
        return dueTime >= now && new Date(f.dueAt).toDateString() === new Date(now).toDateString();
      });
    } else if (agendaTab === 'upcoming') {
      items = items.filter((f) => {
        const dueTime = new Date(f.dueAt).getTime();
        return dueTime >= now && new Date(f.dueAt).toDateString() !== new Date(now).toDateString();
      });
    }

    // Filter by search query
    if (agendaSearch.trim()) {
      const q = agendaSearch.toLowerCase().trim();
      items = items.filter((f) => {
        const name = (f.contact?.name || '').toLowerCase();
        const mobile = (f.contact?.mobile || '').toLowerCase();
        const title = (f.title || '').toLowerCase();
        const leadSnapshot = (f.lead?.listingTitleSnapshot || '').toLowerCase();
        return name.includes(q) || mobile.includes(q) || title.includes(q) || leadSnapshot.includes(q);
      });
    }

    return items;
  }, [data.data?.myAgenda, agendaTab, agendaSearch, now]);

  // Counts for agenda tabs
  const agendaCounts = useMemo(() => {
    if (!data.data?.myAgenda) return { all: 0, overdue: 0, today: 0, upcoming: 0 };
    const all = data.data.myAgenda.length;
    let overdue = 0;
    let today = 0;
    let upcoming = 0;

    data.data.myAgenda.forEach((f) => {
      const dueTime = new Date(f.dueAt).getTime();
      if (dueTime < now) {
        overdue++;
      } else if (new Date(f.dueAt).toDateString() === new Date(now).toDateString()) {
        today++;
      } else {
        upcoming++;
      }
    });

    return { all, overdue, today, upcoming };
  }, [data.data?.myAgenda, now]);

  // Filtered recent leads
  const filteredRecent = useMemo(() => {
    if (!data.data?.recent) return [];
    if (inquiryFilter === 'hot') {
      return data.data.recent.filter((r) => r.temperature === 'HOT');
    }
    if (inquiryFilter === 'buy') {
      return data.data.recent.filter((r) => r.leadType === 'BUY');
    }
    if (inquiryFilter === 'sell') {
      return data.data.recent.filter((r) => r.leadType === 'SELL');
    }
    return data.data.recent;
  }, [data.data?.recent, inquiryFilter]);

  // Pipeline metrics
  const totalPipelineValue = useMemo(() => {
    if (!data.data?.pipeline) return 0;
    return data.data.pipeline.reduce((acc, p) => acc + (p.expectedValue || 0), 0);
  }, [data.data?.pipeline]);

  const maxPipelineCount = useMemo(() => {
    if (!data.data?.pipeline || data.data.pipeline.length === 0) return 1;
    return Math.max(...data.data.pipeline.map((p) => p.count), 1);
  }, [data.data?.pipeline]);

  // Sources metrics
  const totalSourceCount = useMemo(() => {
    if (!data.data?.sources30d) return 1;
    return data.data.sources30d.reduce((acc, s) => acc + s.count, 0) || 1;
  }, [data.data?.sources30d]);

  if (data.loading && !data.data) {
    return (
      <div className="py-12">
        <CrmLoadingState label="Loading CRM executive command center…" />
      </div>
    );
  }

  if (data.error || !data.data) {
    return (
      <div className="py-6">
        <CrmErrorBanner message={data.error || 'Failed to load CRM dashboard'} schemaMissing={data.schemaMissing} />
      </div>
    );
  }

  const d = data.data;

  return (
    <div className="space-y-3">
      {/* ─────────────────────────────────────────────────────────────
          1. SLEEK COMMAND BAR & EMBEDDED CRM WORKSPACE NAVIGATION
      ───────────────────────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 sm:px-4 sm:py-2.5 shadow-2xs">
        {/* Left: Identity & Live Status */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Live Station
            </span>
          </div>

          <div className="h-3.5 w-px bg-slate-200" />

          <h1 className="text-sm sm:text-[15px] font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <span>CRM Command Center</span>
            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 px-2 py-0.2 text-[10.5px] font-semibold">
              {d.kpis.openLeads} Active Deals
            </span>
          </h1>

          {d.kpis.slaBreached > 0 && (
            <Link
              href={leadsPath('sla=breached')}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.2 text-[10.5px] font-bold hover:bg-rose-100 transition-colors"
              title="Click to view breached leads"
            >
              <AlertCircle className="h-3 w-3 text-rose-500" />
              <span>{d.kpis.slaBreached} SLA Breached</span>
            </Link>
          )}
        </div>

        {/* Center / Right: Quick Navigation Tabs + Primary Actions */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Quick CRM Sub-Nav Pills */}
          <nav className="flex items-center gap-1 overflow-x-auto rounded-lg bg-slate-100/90 p-0.5 text-xs font-semibold">
            <span className="rounded-md bg-white px-2.5 py-1 text-slate-950 font-bold shadow-2xs">
              Overview
            </span>
            <Link
              href={leadsPath('')}
              className="rounded-md px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors inline-flex items-center gap-1"
            >
              <span>Leads</span>
              <span className="rounded bg-slate-200/70 px-1 text-[9.5px] font-bold">
                {d.kpis.openLeads}
              </span>
            </Link>
            <Link
              href={crmPath(base, 'pipeline')}
              className="rounded-md px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors"
            >
              Pipeline
            </Link>
            <Link
              href={crmPath(base, 'follow-ups')}
              className="rounded-md px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors inline-flex items-center gap-1"
            >
              <span>Calls</span>
              {d.followUps.overdue > 0 ? (
                <span className="rounded bg-rose-100 text-rose-700 px-1 text-[9.5px] font-bold">
                  {d.followUps.overdue}
                </span>
              ) : null}
            </Link>
            {!isPartnerPortal && (
              <>
                <Link
                  href={crmPath(base, 'contacts')}
                  className="rounded-md px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors hidden xl:inline-block"
                >
                  Contacts
                </Link>
                <Link
                  href={crmPath(base, 'reports')}
                  className="rounded-md px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-white/60 transition-colors hidden xl:inline-block"
                >
                  Reports
                </Link>
              </>
            )}
          </nav>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => data.reload()}
            title="Refresh CRM data"
            className="flex h-7.5 w-7.5 items-center justify-center rounded-lg border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          {/* Quick Schedule Call */}
          <button
            type="button"
            onClick={() => setScheduling(true)}
            className="inline-flex h-7.5 items-center gap-1 rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition shadow-2xs active:scale-95"
          >
            <Calendar className="h-3.5 w-3.5 text-amber-600" />
            <span className="hidden sm:inline">Schedule Call</span>
          </button>

          {/* Primary Create Lead Action */}
          {access?.canManage && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-7.5 items-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 px-3 text-xs font-bold text-slate-950 shadow-2xs shadow-amber-500/20 active:scale-95 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Lead</span>
            </button>
          )}
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. HIGH-DENSITY EXECUTIVE KPI RIBBON (6 COMPACT TILES)
      ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {/* KPI 1: Active Deals */}
        <Link
          href={leadsPath('view=open')}
          className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-2xs hover:border-blue-300 hover:shadow-xs transition-all"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Active Pipeline
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
              <Inbox className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 leading-none">
              {d.kpis.openLeads}
            </span>
            <span className="inline-flex items-center rounded-sm bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700">
              +{d.kpis.newToday} today
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-slate-500 truncate">Open buyer & seller inquiries</p>
        </Link>

        {/* KPI 2: Overdue Follow-ups */}
        <Link
          href={crmPath(base, 'follow-ups', 'bucket=overdue')}
          className={`group relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 shadow-2xs hover:shadow-xs transition-all ${
            d.followUps.overdue > 0
              ? 'border-rose-200 bg-rose-50/20 hover:border-rose-400'
              : 'border-slate-200/90 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Overdue Calls
            </span>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                d.followUps.overdue > 0
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <AlarmClock className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span
              className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${
                d.followUps.overdue > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {d.followUps.overdue}
            </span>
            <span className="inline-flex items-center rounded-sm bg-amber-50 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
              {d.followUps.today} due today
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-slate-500 truncate">Immediate response needed</p>
        </Link>

        {/* KPI 3: Hot Inquiries */}
        <Link
          href={leadsPath('view=open&temperature=HOT')}
          className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-2xs hover:border-amber-400 hover:shadow-xs transition-all"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Hot Deals
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
              <Flame className="h-3.5 w-3.5 fill-amber-500/20" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-amber-700 leading-none">
              {d.kpis.hotLeads}
            </span>
            <span className="inline-flex items-center rounded-sm bg-amber-50 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
              High Intent
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-slate-500 truncate">Prime closing opportunities</p>
        </Link>

        {/* KPI 4: Needs Follow-up Date */}
        <Link
          href={leadsPath('followUp=none')}
          className={`group relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 shadow-2xs hover:shadow-xs transition-all ${
            d.kpis.leadsWithoutFollowUp > 0
              ? 'border-amber-200 bg-amber-50/20 hover:border-amber-300'
              : 'border-slate-200/90 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              No Next Step
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors">
              <CalendarCheck className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span
              className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${
                d.kpis.leadsWithoutFollowUp > 0 ? 'text-amber-800' : 'text-slate-900'
              }`}
            >
              {d.kpis.leadsWithoutFollowUp}
            </span>
            <span className="inline-flex items-center rounded-sm bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
              Missing Date
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-slate-500 truncate">Leads stalled without follow-up</p>
        </Link>

        {/* KPI 5: Unassigned / SLA Breached */}
        {d.kpis.unassigned !== null ? (
          <Link
            href={leadsPath('view=open&ownerId=none')}
            className={`group relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 shadow-2xs hover:shadow-xs transition-all ${
              d.kpis.unassigned > 0
                ? 'border-orange-200 bg-orange-50/20 hover:border-orange-300'
                : 'border-slate-200/90 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                Unassigned
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-50 text-orange-700 group-hover:bg-orange-100 transition-colors">
                <UserX className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span
                className={`text-xl sm:text-2xl font-black tracking-tight leading-none ${
                  d.kpis.unassigned > 0 ? 'text-orange-700' : 'text-slate-900'
                }`}
              >
                {d.kpis.unassigned}
              </span>
              <span className="inline-flex items-center rounded-sm bg-rose-50 px-1.5 py-0.2 text-[10px] font-bold text-rose-700">
                {d.kpis.slaBreached} SLA Breached
              </span>
            </div>
            <p className="mt-1 text-[10.5px] text-slate-500 truncate">Awaiting relationship manager</p>
          </Link>
        ) : (
          <Link
            href={leadsPath('sla=breached')}
            className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-2xs hover:border-rose-300 hover:shadow-xs transition-all"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                SLA Breached
              </span>
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-50 text-rose-600 group-hover:bg-rose-100 transition-colors">
                <AlarmClock className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-rose-600 leading-none">
                {d.kpis.slaBreached}
              </span>
              <span className="inline-flex items-center rounded-sm bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                Response Alert
              </span>
            </div>
            <p className="mt-1 text-[10.5px] text-slate-500 truncate">Exceeded initial response time</p>
          </Link>
        )}

        {/* KPI 6: Won Revenue This Month */}
        <Link
          href={leadsPath('status=WON')}
          className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-2.5 sm:p-3 shadow-2xs hover:border-emerald-300 hover:shadow-xs transition-all"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Won Revenue
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 transition-colors">
              <Trophy className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-1">
            <span className="text-lg sm:text-xl font-black tracking-tight text-emerald-700 leading-none truncate">
              {fmtInr(d.kpis.wonValueThisMonth)}
            </span>
            <span className="inline-flex items-center rounded-sm bg-emerald-50 px-1.5 py-0.2 text-[10px] font-bold text-emerald-800">
              {d.kpis.winRateThisMonth}% rate
            </span>
          </div>
          <p className="mt-1 text-[10.5px] text-slate-500 truncate">
            {d.kpis.wonThisMonth} deals closed this month
          </p>
        </Link>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. MAIN HIGH-DENSITY WORKSPACE: 2-COLUMN WORKSTATION
      ───────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* =========================================================
            LEFT COLUMN (7 of 12 cols): OPERATIONAL QUEUES
        ========================================================= */}
        <div className="lg:col-span-7 space-y-3">
          {/* CARD 1: PRIORITY FOLLOW-UP CALL AGENDA */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            {/* Header with Title + Filters + Search */}
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-slate-50/20 to-white px-3 py-2 sm:px-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-700">
                    <PhoneCall className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-[13px] sm:text-sm font-bold text-slate-900 leading-tight">
                        Follow-up Call Agenda
                      </h2>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                        {d.myAgenda.length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Search inside agenda */}
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter queue…"
                      value={agendaSearch}
                      onChange={(e) => setAgendaSearch(e.target.value)}
                      className="h-6.5 w-28 sm:w-36 rounded-md border border-slate-200/90 bg-white pl-6 pr-2 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>

                  <Link
                    href={crmPath(base, 'follow-ups')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 transition-colors shrink-0"
                  >
                    <span>Full Center</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>

              {/* Agenda Tab Pills */}
              <div className="mt-2 flex items-center gap-1 overflow-x-auto text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setAgendaTab('all')}
                  className={`rounded-md px-2 py-0.5 transition-colors ${
                    agendaTab === 'all'
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  All ({agendaCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaTab('overdue')}
                  className={`rounded-md px-2 py-0.5 transition-colors flex items-center gap-1 ${
                    agendaTab === 'overdue'
                      ? 'bg-rose-600 text-white font-bold'
                      : agendaCounts.overdue > 0
                      ? 'text-rose-700 hover:bg-rose-50'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  <span>Overdue</span>
                  {agendaCounts.overdue > 0 && (
                    <span
                      className={`rounded px-1 text-[9.5px] font-black ${
                        agendaTab === 'overdue' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {agendaCounts.overdue}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaTab('today')}
                  className={`rounded-md px-2 py-0.5 transition-colors flex items-center gap-1 ${
                    agendaTab === 'today'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  <span>Due Today</span>
                  {agendaCounts.today > 0 && (
                    <span
                      className={`rounded px-1 text-[9.5px] font-bold ${
                        agendaTab === 'today' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {agendaCounts.today}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setAgendaTab('upcoming')}
                  className={`rounded-md px-2 py-0.5 transition-colors ${
                    agendaTab === 'upcoming'
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  Upcoming ({agendaCounts.upcoming})
                </button>
              </div>
            </div>

            {/* Agenda Queue List */}
            {filteredAgenda.length ? (
              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto custom-scrollbar">
                {filteredAgenda.map((f) => {
                  const isOverdue = new Date(f.dueAt).getTime() < now;
                  const isToday =
                    !isOverdue &&
                    new Date(f.dueAt).toDateString() === new Date(now).toDateString();
                  const links = phoneLinks(
                    f.contact?.mobile,
                    f.contact?.whatsappNumber,
                    leadWhatsAppMessage(f.contact?.name, f.lead)
                  );

                  return (
                    <div
                      key={f.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-50/80 ${
                        isOverdue
                          ? 'bg-rose-50/25'
                          : isToday
                          ? 'bg-amber-50/20'
                          : ''
                      }`}
                    >
                      {/* Left: Timing & Customer Details */}
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {/* Time Urgency Badge */}
                        <div className="shrink-0 w-24">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isOverdue
                                ? 'bg-rose-100 text-rose-800'
                                : isToday
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                            title={fmtDateTime(f.dueAt)}
                          >
                            {isOverdue ? (
                              <AlertCircle className="h-2.5 w-2.5 text-rose-600 shrink-0" />
                            ) : isToday ? (
                              <Clock className="h-2.5 w-2.5 text-amber-700 shrink-0" />
                            ) : (
                              <CalendarClock className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                            )}
                            <span className="truncate">{relative(f.dueAt, now) || 'Due'}</span>
                          </span>
                          <p className="mt-0.5 text-[9.5px] font-semibold text-slate-400 truncate">
                            {fmtDateTime(f.dueAt)}
                          </p>
                        </div>

                        {/* Customer & Machine info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5 leading-tight">
                            <span className="rounded bg-slate-100 border border-slate-200/80 px-1 py-0.2 text-[9.5px] font-bold text-slate-700 uppercase">
                              {label(f.type)}
                            </span>
                            <span className="font-bold text-slate-900 truncate">
                              {f.contact?.name || f.contact?.mobile || 'Customer'}
                            </span>
                            {f.contact?.mobile && (
                              <button
                                type="button"
                                onClick={() => copyPhone(f.id, f.contact?.mobile)}
                                title="Click to copy phone"
                                className="inline-flex items-center gap-0.5 text-[10.5px] text-slate-500 hover:text-slate-800 transition-colors"
                              >
                                <span>· {f.contact.mobile}</span>
                                {copiedId === f.id ? (
                                  <Check className="h-2.5 w-2.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-2.5 w-2.5 text-slate-400" />
                                )}
                              </button>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                            {f.lead ? (
                              <Link
                                href={leadHref(base, f.lead.id)}
                                className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-amber-700 transition-colors max-w-[200px] truncate"
                              >
                                <Tractor className="h-3 w-3 text-slate-400 shrink-0" />
                                <span className="truncate">
                                  {f.lead.listingTitleSnapshot ||
                                    LEAD_TYPE_LABELS[f.lead.leadType] ||
                                    f.lead.leadType}
                                </span>
                              </Link>
                            ) : (
                              <span className="text-slate-400">Direct Contact</span>
                            )}

                            {f.notes && (
                              <span className="truncate max-w-[220px] text-slate-500" title={f.notes}>
                                · {f.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Fast Inline Action Triggers */}
                      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                        {/* Call Button */}
                        {links.tel && (
                          <a
                            href={links.tel}
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
                            title="Call Customer"
                          >
                            <Phone className="h-3 w-3" />
                          </a>
                        )}

                        {/* WhatsApp Button */}
                        {links.wa && (
                          <a
                            href={links.wa}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shadow-2xs"
                            title="Open WhatsApp chat"
                          >
                            <MessageCircle className="h-3 w-3" />
                          </a>
                        )}

                        {/* Reschedule Button */}
                        <button
                          type="button"
                          onClick={() => setRescheduling(f)}
                          className="flex h-6.5 w-6.5 items-center justify-center rounded-md border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
                          title="Reschedule Follow-up"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>

                        {/* Complete Done Button */}
                        <button
                          type="button"
                          onClick={() => setCompleting(f)}
                          className="inline-flex h-6.5 items-center gap-1 rounded-md bg-slate-900 px-2 text-[11px] font-bold text-white hover:bg-slate-800 transition shadow-2xs"
                          title="Mark Follow-up as Completed"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                          <span>Done</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-xs font-semibold text-slate-700">No follow-ups match this filter</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Your agenda queue is clear! Schedule next steps directly from Leads or Pipeline.
                </p>
                <button
                  type="button"
                  onClick={() => setScheduling(true)}
                  className="mt-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                >
                  <Plus className="h-3 w-3" />
                  <span>Schedule Call</span>
                </button>
              </div>
            )}

            {/* Agenda Footer Status Bar */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>
                  Completed today: <strong>{d.followUps.doneToday}</strong>
                </span>
              </span>
              <span>
                Pending today: <strong>{d.followUps.today}</strong> · Overdue:{' '}
                <strong className={d.followUps.overdue ? 'text-rose-600' : ''}>
                  {d.followUps.overdue}
                </strong>
              </span>
            </div>
          </div>

          {/* CARD 2: LIVE INBOUND LEADS FEED */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            {/* Header */}
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-slate-50/20 to-white px-3 py-2 sm:px-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-700">
                    <Activity className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <h2 className="text-[13px] sm:text-sm font-bold text-slate-900 leading-tight">
                      Recent Inbound Inquiries
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Filter chips */}
                  <div className="flex items-center gap-1 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setInquiryFilter('all')}
                      className={`rounded px-1.5 py-0.5 transition-colors ${
                        inquiryFilter === 'all'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setInquiryFilter('hot')}
                      className={`rounded px-1.5 py-0.5 transition-colors flex items-center gap-0.5 ${
                        inquiryFilter === 'hot'
                          ? 'bg-amber-600 text-white font-bold'
                          : 'text-amber-800 hover:bg-amber-50'
                      }`}
                    >
                      <Flame className="h-2.5 w-2.5" />
                      <span>Hot</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setInquiryFilter('buy')}
                      className={`rounded px-1.5 py-0.5 transition-colors ${
                        inquiryFilter === 'buy'
                          ? 'bg-blue-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      onClick={() => setInquiryFilter('sell')}
                      className={`rounded px-1.5 py-0.5 transition-colors ${
                        inquiryFilter === 'sell'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Sell
                    </button>
                  </div>

                  <div className="h-3.5 w-px bg-slate-200" />

                  <Link
                    href={leadsPath('')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 transition-colors shrink-0"
                  >
                    <span>All Leads</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>

            {/* List */}
            {filteredRecent.length ? (
              <ul className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto custom-scrollbar">
                {filteredRecent.map((lead) => {
                  const initial = (lead.customer.name || lead.customer.mobile || 'U')
                    .charAt(0)
                    .toUpperCase();
                  const links = phoneLinks(lead.customer.mobile);

                  return (
                    <li key={lead.id}>
                      <div className="group flex items-center justify-between gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors">
                        {/* Customer & Inquiry Clickable Area */}
                        <Link
                          href={leadHref(base, lead.id)}
                          className="flex items-center gap-2.5 min-w-0 flex-1"
                        >
                          {/* Avatar */}
                          <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-slate-800 font-bold text-xs border border-slate-200/90 shadow-2xs">
                            {initial}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-xs font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                                {lead.customer.name || lead.customer.mobile || 'Customer'}
                              </p>
                              <span className="rounded bg-slate-100 px-1 py-0.2 text-[9.5px] font-bold text-slate-600">
                                {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
                              </span>
                            </div>

                            <p className="truncate text-[11px] text-slate-500 mt-0.5">
                              {lead.listingTitleSnapshot ? (
                                <span className="font-semibold text-slate-700">
                                  {lead.listingTitleSnapshot} ·{' '}
                                </span>
                              ) : null}
                              <span>{fmtDate(lead.createdAt)}</span>
                              {!access?.isPartner && (
                                <span className="text-slate-400">
                                  {' '}
                                  · {lead.owner?.name ? `Rep: ${lead.owner.name}` : 'Unassigned'}
                                </span>
                              )}
                            </p>
                          </div>
                        </Link>

                        {/* Status & Fast Contact Icons */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {lead.customer.mobile && (
                            <div className="flex items-center gap-1 mr-1">
                              {links.tel && (
                                <a
                                  href={links.tel}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-900 transition shadow-2xs"
                                  title="Call customer"
                                >
                                  <Phone className="h-2.5 w-2.5" />
                                </a>
                              )}
                              {links.wa && (
                                <a
                                  href={links.wa}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex h-6 w-6 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition shadow-2xs"
                                  title="WhatsApp customer"
                                >
                                  <MessageCircle className="h-2.5 w-2.5" />
                                </a>
                              )}
                            </div>
                          )}

                          <TemperatureBadge temperature={lead.temperature} />
                          <StatusBadge status={lead.status} />

                          <Link
                            href={leadHref(base, lead.id)}
                            className="p-1 text-slate-400 hover:text-slate-800 transition-colors"
                            title="View lead file"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                No inquiries matching this filter.
              </div>
            )}
          </div>
        </div>

        {/* =========================================================
            RIGHT COLUMN (5 of 12 cols): PIPELINE & PERFORMANCE
        ========================================================= */}
        <div className="lg:col-span-5 space-y-3">
          {/* CARD 3: DEAL PIPELINE STAGE FUNNEL & VALUATION */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            {/* Header */}
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-slate-50/20 to-white px-3 py-2 sm:px-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-700">
                  <Kanban className="h-3.5 w-3.5" />
                </span>
                <div>
                  <h2 className="text-[13px] sm:text-sm font-bold text-slate-900 leading-tight">
                    Pipeline Stages
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                  Val: {fmtInr(totalPipelineValue)}
                </span>
                <Link
                  href={crmPath(base, 'pipeline')}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 transition-colors"
                >
                  <span>Kanban</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Stage Funnel Bars */}
            <div className="p-3 space-y-2">
              {d.pipeline.map((stage) => {
                const cfg = STAGE_CONFIG[stage.status] || STAGE_CONFIG.CONTACTED;
                const widthPct = Math.max(8, Math.round((stage.count / maxPipelineCount) * 100));

                return (
                  <Link
                    key={stage.status}
                    href={leadsPath(`status=${stage.status}`)}
                    className="group block rounded-lg p-1.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                        <span className="text-slate-800 group-hover:text-amber-700 transition-colors font-bold truncate">
                          {label(stage.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10.5px] font-bold text-slate-700">
                          {stage.count} {stage.count === 1 ? 'deal' : 'deals'}
                        </span>
                        {stage.expectedValue > 0 && (
                          <span className="text-[11px] font-bold text-slate-500">
                            {fmtInr(stage.expectedValue)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${cfg.bar}`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Pipeline Stage Summary Footer */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span>
                Stages Active: <strong>{d.pipeline.length}</strong>
              </span>
              <span>
                Conversion Win Rate: <strong className="text-emerald-700">{d.kpis.winRateThisMonth}%</strong>
              </span>
            </div>
          </div>

          {/* CARD 4: LEAD ACQUISITION SOURCES */}
          <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
            {/* Header */}
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-slate-50/20 to-white px-3 py-2 sm:px-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-700">
                  <BarChart3 className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-[13px] sm:text-sm font-bold text-slate-900 leading-tight">
                  Lead Inflow Sources (30 Days)
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-bold text-slate-600">
                {totalSourceCount} Leads
              </span>
            </div>

            {/* Source Distribution List */}
            {d.sources30d.length ? (
              <div className="p-3 space-y-2">
                {d.sources30d.slice(0, 6).map((s, idx) => {
                  const sharePct = Math.round((s.count / totalSourceCount) * 100);
                  const barColor = SOURCE_COLORS[idx % SOURCE_COLORS.length];

                  return (
                    <Link
                      key={s.source}
                      href={leadsPath(`source=${s.source}`)}
                      className="group block text-xs hover:bg-slate-50 p-1 rounded-md transition-colors"
                    >
                      <div className="flex items-center justify-between font-semibold mb-1">
                        <span className="text-slate-800 group-hover:text-blue-700 transition-colors font-bold truncate">
                          {label(s.source)}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                          <span className="font-bold text-slate-900">{s.count}</span>
                          <span className="text-slate-400">({sharePct}%)</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor}`}
                          style={{ width: `${Math.max(5, sharePct)}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-400">
                No source activity recorded in the last 30 days.
              </div>
            )}
          </div>

          {/* CARD 5: TEAM OPERATIONAL WORKLOAD (If admin/manager) */}
          {d.team ? (
            <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
              {/* Header */}
              <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-slate-50/20 to-white px-3 py-2 sm:px-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-500/10 text-purple-700">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-[13px] sm:text-sm font-bold text-slate-900 leading-tight">
                    Team Operational Workload
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-bold text-slate-600">
                  {d.team.length} Reps
                </span>
              </div>

              {/* Workload Table */}
              {d.team.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-1.5">Executive</th>
                        <th className="px-2 py-1.5 text-right">Open</th>
                        <th className="px-2 py-1.5 text-right">Overdue</th>
                        <th className="px-2 py-1.5 text-right">Today</th>
                        <th className="px-3 py-1.5 text-right">Done</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {d.team.map((row) => (
                        <tr
                          key={row.userId ?? 'none'}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() =>
                            router.push(leadsPath(`view=open&ownerId=${row.userId ?? 'none'}`))
                          }
                        >
                          <td className="px-3 py-1.5 font-bold text-slate-800 truncate max-w-[130px]">
                            {row.name}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-slate-700">
                            {row.openLeads}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right font-bold ${
                              row.overdue > 0 ? 'text-rose-600' : 'text-slate-400'
                            }`}
                          >
                            {row.overdue}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold text-slate-700">
                            {row.dueToday}
                          </td>
                          <td className="px-3 py-1.5 text-right font-bold text-emerald-700">
                            {row.doneToday}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  No open team assignments yet.
                </div>
              )}
            </div>
          ) : null}

          {/* CARD 6: QUICK CRM SHORTCUTS BAR */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-2.5 shadow-2xs">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
              CRM Workspace Shortcuts
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <Link
                href={crmPath(base, 'pipeline')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-800 transition"
              >
                <Kanban className="h-3.5 w-3.5 text-amber-600" />
                <span className="truncate">Pipeline Board</span>
              </Link>
              <Link
                href={crmPath(base, 'follow-ups')}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-800 transition"
              >
                <PhoneCall className="h-3.5 w-3.5 text-blue-600" />
                <span className="truncate">Call Center</span>
              </Link>
              {!isPartnerPortal && (
                <>
                  <Link
                    href={crmPath(base, 'reports')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-800 transition"
                  >
                    <BarChart3 className="h-3.5 w-3.5 text-purple-600" />
                    <span className="truncate">Full Analytics</span>
                  </Link>
                  <Link
                    href={crmPath(base, 'import')}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-800 transition"
                  >
                    <FileUp className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="truncate">Bulk Import</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. ACTIONABLE MODALS (WIRED FOR INLINE OPERATIONAL COCKPIT)
      ───────────────────────────────────────────────────────────── */}
      {/* 1. Complete Follow-up Modal */}
      {completing && (
        <CompleteFollowUpModal
          followUp={completing}
          leadStatus={completing.lead?.status}
          onClose={() => setCompleting(null)}
          onDone={() => {
            setCompleting(null);
            data.reload();
          }}
        />
      )}

      {/* 2. Reschedule Follow-up Modal */}
      {rescheduling && (
        <RescheduleModal
          followUp={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => {
            setRescheduling(null);
            data.reload();
          }}
        />
      )}

      {/* 3. Schedule Brand New Follow-up Modal */}
      {scheduling && (
        <ScheduleFollowUpModal
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            data.reload();
          }}
        />
      )}

      {/* 4. Create New Lead Modal */}
      {creating && (
        <LeadForm
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(leadHref(base, id));
          }}
        />
      )}
    </div>
  );
}

export default function CrmDashboardPage() {
  return (
    <CrmPageFrame fluid={true}>
      <Dashboard />
    </CrmPageFrame>
  );
}
