'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  Filter,
  Flame,
  Layers,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  RotateCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { EmptyState, tableHeadClass, cellClass } from '@/components/financeWorkspace/ui';
import {
  contactHref,
  CrmErrorBanner,
  CrmLoadingState,
  CrmPageFrame,
  fmtDate,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
} from './crmShared';

type RateRow = { key: string; created: number; won: number; lost: number; open: number; conversion: number };
type Reports = {
  totals: { created: number; won: number; lost: number; wonValue: number; conversion: number };
  funnel: Array<{ status: string; count: number }>;
  bySource: RateRow[];
  byType: RateRow[];
  staff: Array<{
    userId: string;
    name: string;
    leads: number;
    won: number;
    lost: number;
    wonValue: number;
    conversion: number;
    medianFirstResponseMinutes: number | null;
    followUpsDone: number;
    followUpsOnTime: number;
    followUpsMissed: number;
    followUpsPending: number;
  }>;
  lostReasons: Array<{ reason: string; count: number }>;
  aging: Array<{ bucket: string; count: number }>;
  followUpCompliance: { total: number; done: number; onTime: number; late: number; missed: number; pending: number };
  trend: Array<{ date: string; created: number; won: number }>;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const minutesText = (m: number | null) =>
  m === null ? '—' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;

/** Custom glass tooltip for Velocity Trend */
function TrendTooltip({ active, payload, label: dateLabel }: any) {
  if (active && payload && payload.length) {
    const created = payload.find((p: any) => p.dataKey === 'created')?.value || 0;
    const won = payload.find((p: any) => p.dataKey === 'won')?.value || 0;
    const ratio = created ? Math.round((won / created) * 100) : 0;
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/95 p-2.5 text-xs text-white shadow-xl backdrop-blur-md">
        <p className="font-bold text-slate-300 pb-1 border-b border-slate-800 text-[11px]">{dateLabel}</p>
        <div className="pt-1.5 space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-blue-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Inbound Leads:
            </span>
            <span className="font-black text-white">{created}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Deals Won:
            </span>
            <span className="font-black text-emerald-400">{won}</span>
          </div>
          {created > 0 ? (
            <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between gap-4 text-[10px] text-slate-400">
              <span>Conversion:</span>
              <span className="font-bold text-amber-400">{ratio}%</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  return null;
}

/** Modern rate conversion table with micro distribution bars */
function RateTable({
  rows,
  keyLabel,
  nameOf,
}: {
  rows: RateRow[];
  keyLabel: string;
  nameOf: (key: string) => string;
}) {
  if (!rows.length) {
    return <EmptyState title="No leads recorded in this period" />;
  }

  const maxCreated = Math.max(...rows.map((r) => r.created), 1);

  return (
    <div className="w-full overflow-x-auto [scrollbar-width:thin]">
      <table className="w-full min-w-full text-left text-xs">
        <thead className={tableHeadClass}>
          <tr>
            <th className="px-3.5 py-2.5 font-bold text-slate-700">{keyLabel}</th>
            <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Volume & Share</th>
            <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Won</th>
            <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Lost</th>
            <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Active</th>
            <th className="px-3.5 py-2.5 text-right font-bold text-slate-700 min-w-[110px]">Win Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const share = Math.round((r.created / maxCreated) * 100);
            return (
              <tr key={r.key} className="hover:bg-slate-50/80 transition-colors">
                <td className={`${cellClass} font-bold text-slate-900`}>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    <span>{nameOf(r.key)}</span>
                  </div>
                </td>
                <td className={`${cellClass} text-right font-semibold`}>
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden sm:block w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${share}%` }} />
                    </div>
                    <span className="font-bold text-slate-800">{r.created}</span>
                  </div>
                </td>
                <td className={`${cellClass} text-right font-black text-emerald-700`}>{r.won}</td>
                <td className={`${cellClass} text-right font-semibold text-rose-600`}>{r.lost}</td>
                <td className={`${cellClass} text-right text-slate-500`}>{r.open}</td>
                <td className={`${cellClass} text-right`}>
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          r.conversion >= 25
                            ? 'bg-emerald-500'
                            : r.conversion >= 12
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                        }`}
                        style={{ width: `${Math.min(r.conversion, 100)}%` }}
                      />
                    </div>
                    <span
                      className={`font-black text-xs ${
                        r.conversion >= 25
                          ? 'text-emerald-700'
                          : r.conversion >= 12
                          ? 'text-amber-800'
                          : 'text-slate-700'
                      }`}
                    >
                      {r.conversion}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Reports() {
  const { meta } = useCrmMeta();
  const [activePreset, setActivePreset] = useState<string>('30d');
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);
    return { from: iso(from), to: iso(to) };
  });

  const setPreset = (key: string, days?: number) => {
    setActivePreset(key);
    const to = new Date();
    if (key === 'today') {
      setRange({ from: iso(to), to: iso(to) });
    } else if (key === 'month') {
      const monthStart = new Date(to.getFullYear(), to.getMonth(), 1);
      setRange({ from: iso(monthStart), to: iso(to) });
    } else if (days) {
      const from = new Date(to.getTime() - (days - 1) * 86400000);
      setRange({ from: iso(from), to: iso(to) });
    }
  };

  const params = useMemo(
    () => ({
      from: new Date(`${range.from}T00:00:00`).toISOString(),
      to: new Date(`${range.to}T23:59:59`).toISOString(),
    }),
    [range]
  );

  const data = useCrmResource(() => getJson<Reports>('/crm/reports', params), JSON.stringify(params));
  const r = data.data;

  // Compute calculated metrics
  const peakDay = useMemo(() => {
    if (!r?.trend?.length) return null;
    return r.trend.reduce((max, cur) => (cur.created > max.created ? cur : max), r.trend[0]);
  }, [r?.trend]);

  const avgPerDay = useMemo(() => {
    if (!r?.trend?.length) return 0;
    const total = r.trend.reduce((sum, d) => sum + d.created, 0);
    return Math.round((total / r.trend.length) * 10) / 10;
  }, [r?.trend]);

  const avgDealSize = useMemo(() => {
    if (!r?.totals?.won || !r?.totals?.wonValue) return 0;
    return Math.round(r.totals.wonValue / r.totals.won);
  }, [r?.totals]);

  // Stage name resolver from meta
  const stageName = (code: string) => {
    const stage = meta?.pipelineStages.find((s) => s.code === code);
    return stage?.name || label(code);
  };

  return (
    <div className="w-full space-y-3.5 text-slate-800">
      {/* 1. TOP EXECUTIVE CONTROL & RANGE BAR */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
                CRM Performance & Conversion Analytics
              </h1>
              {r ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200/90 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {r.totals.created} Inquiries Analyzed
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Deal velocity, SLA response times, funnel conversions & executive accountability.
            </p>
          </div>

          {/* Quick Date Presets & Custom Pickers */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-2xs text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setPreset('today')}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  activePreset === 'today' ? 'bg-slate-900 text-white shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setPreset('7d', 7)}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  activePreset === '7d' ? 'bg-slate-900 text-white shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setPreset('30d', 30)}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  activePreset === '30d' ? 'bg-slate-900 text-white shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setPreset('month')}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  activePreset === 'month' ? 'bg-slate-900 text-white shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setPreset('90d', 90)}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  activePreset === '90d' ? 'bg-slate-900 text-white shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                Quarter
              </button>
            </div>

            {/* Custom Date Pickers */}
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1 shadow-2xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => {
                  setActivePreset('custom');
                  setRange((x) => ({ ...x, from: e.target.value }));
                }}
                className="bg-transparent outline-none text-xs text-slate-800 font-semibold cursor-pointer"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => {
                  setActivePreset('custom');
                  setRange((x) => ({ ...x, to: e.target.value }));
                }}
                className="bg-transparent outline-none text-xs text-slate-800 font-semibold cursor-pointer"
              />
            </div>

            {/* Reload Data */}
            <button
              type="button"
              onClick={() => data.reload()}
              title="Refresh reports"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 transition shadow-2xs"
            >
              <RotateCw className={`h-3.5 w-3.5 ${data.loading ? 'animate-spin text-amber-600' : ''}`} />
            </button>
          </div>
        </div>
      </section>

      {/* 2. CORE EXECUTIVE KPI STRIP (5 CARDS, HIGH-DENSITY COCKPIT) */}
      {data.loading && !r ? (
        <CrmLoadingState label="Computing conversion reports & metrics…" />
      ) : data.error || !r ? (
        <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            {/* 1. Inquiries Generated */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  Inquiries Influx
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60">
                  <TrendingUp className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">{r.totals.created}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                  <span>Avg {avgPerDay} / day</span>
                  {peakDay ? <span>• Peak {peakDay.created}</span> : null}
                </p>
              </div>
            </div>

            {/* 2. Deals Won */}
            <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/30 p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800">
                  Deals Closed Won
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-300/60">
                  <Trophy className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <p className="text-xl sm:text-2xl font-black text-emerald-700 tracking-tight">{r.totals.won}</p>
                <p className="text-[11px] text-emerald-800 font-semibold mt-0.5 flex items-center gap-1">
                  <span>{r.totals.conversion}% win conversion</span>
                </p>
              </div>
            </div>

            {/* 3. Won Valuation */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  Won Valuation (GMV)
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60">
                  <Coins className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {fmtInr(r.totals.wonValue)}
                </p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Avg {avgDealSize ? fmtInr(avgDealSize) : '—'} / won deal
                </p>
              </div>
            </div>

            {/* 4. Lost Inquiries */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  Inquiries Lost
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60">
                  <XCircle className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <p
                  className={`text-xl sm:text-2xl font-black tracking-tight ${
                    r.totals.lost ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {r.totals.lost}
                </p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {r.totals.created ? Math.round((r.totals.lost / r.totals.created) * 100) : 0}% drop-off share
                </p>
              </div>
            </div>

            {/* 5. Team Follow-up SLA */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  Follow-Up Discipline
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-700 border border-purple-200/60">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-2">
                <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  {r.followUpCompliance.done
                    ? `${Math.round((r.followUpCompliance.onTime / r.followUpCompliance.done) * 100)}%`
                    : '100%'}
                </p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                  <span>{r.followUpCompliance.onTime} on-time</span>
                  {r.followUpCompliance.missed > 0 ? (
                    <span className="text-rose-600 font-bold">• {r.followUpCompliance.missed} missed</span>
                  ) : null}
                </p>
              </div>
            </div>
          </section>

          {/* 3. DUAL INTELLIGENCE ROW: VELOCITY TREND & PIPELINE CONVERSION FUNNEL */}
          <div className="grid gap-3.5 xl:grid-cols-12 items-start">
            {/* LEFT (8 COLS): INBOUND VS WON VELOCITY TREND */}
            <section className="xl:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <LineChartIcon className="h-4 w-4 text-blue-600" />
                    Inbound Influx vs Closed-Won Velocity
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Day-by-day comparison of new inquiries generated vs machinery sales successfully closed.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="inline-flex items-center gap-1 text-blue-600">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    Inbound Inquiries
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Closed Won
                  </span>
                </div>
              </div>

              <div className="h-64 sm:h-72 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={r.trend} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorWon" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      tickFormatter={(v: string) => v.slice(5)}
                      minTickGap={18}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<TrendTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="created"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorCreated)"
                    />
                    <Area
                      type="monotone"
                      dataKey="won"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorWon)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* RIGHT (4 COLS): PIPELINE FUNNEL CONVERSION */}
            <section className="xl:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="border-b border-slate-100 pb-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-amber-500" />
                  Pipeline Conversion Funnel
                </h3>
                <p className="text-[11px] text-slate-500">
                  Distribution of inquiries currently in each active pipeline stage.
                </p>
              </div>

              {r.funnel.length ? (
                <div className="space-y-2 pt-0.5">
                  {r.funnel.map((f, idx) => {
                    const totalLeads = r.totals.created || 1;
                    const pctShare = Math.round((f.count / totalLeads) * 100);
                    const isTerminalWon = f.status === 'WON';
                    const isTerminalLost = f.status === 'LOST';

                    return (
                      <div key={f.status} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2 text-xs">
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-slate-900 truncate">
                            {stageName(f.status)}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-black text-slate-900">{f.count}</span>
                            <span className="text-[10px] font-semibold text-slate-400">({pctShare}%)</span>
                          </div>
                        </div>

                        {/* Progress Width Bar */}
                        <div className="h-2 w-full rounded-full bg-slate-200/80 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isTerminalWon
                                ? 'bg-emerald-500'
                                : isTerminalLost
                                ? 'bg-rose-500'
                                : 'bg-amber-400'
                            }`}
                            style={{ width: `${Math.max(pctShare, f.count > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No pipeline stages available" />
              )}
            </section>
          </div>

          {/* 4. ACQUISITION CHANNELS & MACHINERY INTENT (2-COLUMN GRID) */}
          <div className="grid gap-3.5 xl:grid-cols-2 items-start">
            {/* Conversion by Inbound Source */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="border-b border-slate-100 pb-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Conversion by Acquisition Source
                </h3>
                <p className="text-[11px] text-slate-500">
                  Lead source performance: website, WhatsApp, phone inquiries, dealer network, and ads.
                </p>
              </div>
              <RateTable rows={r.bySource} keyLabel="Inbound Source" nameOf={label} />
            </section>

            {/* Conversion by Lead Category */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="border-b border-slate-100 pb-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-purple-600" />
                  Conversion by Lead Category & Intent
                </h3>
                <p className="text-[11px] text-slate-500">
                  Buyer vs Seller inquiry volumes and closing ratios across machine categories.
                </p>
              </div>
              <RateTable
                rows={r.byType}
                keyLabel="Machinery Intent"
                nameOf={(k) => LEAD_TYPE_LABELS[k] || label(k)}
              />
            </section>
          </div>

          {/* 5. TEAM PERFORMANCE & RESPONSE SLA AUDIT (FULL-WIDTH DATA MATRIX) */}
          <section className="w-full rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-amber-500" />
                  Executive Performance & Response SLA Audit
                </h3>
                <p className="text-[11px] text-slate-500">
                  Speed-to-lead response times, closed deal valuations, and follow-up discipline per staff member.
                </p>
              </div>
              <span className="text-xs text-slate-500 font-bold">
                {r.staff.length} {r.staff.length === 1 ? 'Executive' : 'Executives'} Monitored
              </span>
            </div>

            {!r.staff.length ? (
              <EmptyState title="No assigned leads in this period" />
            ) : (
              <div className="w-full overflow-x-auto [scrollbar-width:thin]">
                <table className="w-full min-w-full text-left text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-3.5 py-2.5 font-bold text-slate-700 min-w-[150px]">Team Executive</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Inquiries</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Won</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Won GMV</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 min-w-[100px]">Win Rate</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">1st Response SLA</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Follow-ups Done</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">On-Time %</th>
                      <th className="px-3 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Missed</th>
                      <th className="px-3.5 py-2.5 text-right font-bold text-slate-700 whitespace-nowrap">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.staff.map((s) => {
                      const onTimePct = s.followUpsDone ? Math.round((s.followUpsOnTime / s.followUpsDone) * 100) : null;
                      const responseMin = s.medianFirstResponseMinutes;

                      return (
                        <tr key={s.userId} className="hover:bg-slate-50/80 transition-colors">
                          <td className={`${cellClass} font-bold text-slate-900`}>
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-900 font-bold text-[11px] shadow-2xs">
                                {(s.name || 'E').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="truncate">{s.name}</span>
                            </div>
                          </td>
                          <td className={`${cellClass} text-right font-bold text-slate-800`}>{s.leads}</td>
                          <td className={`${cellClass} text-right font-black text-emerald-700`}>{s.won}</td>
                          <td className={`${cellClass} text-right font-bold text-slate-900`}>
                            {s.wonValue ? fmtInr(s.wonValue) : '—'}
                          </td>
                          <td className={`${cellClass} text-right`}>
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-bold text-slate-900">{s.conversion}%</span>
                              <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 rounded-full"
                                  style={{ width: `${Math.min(s.conversion, 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className={`${cellClass} text-right`}>
                            {responseMin !== null ? (
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                                  responseMin <= 15
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : responseMin <= 60
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : responseMin <= 240
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {responseMin <= 15 ? '⚡' : ''} {minutesText(responseMin)}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">No calls</span>
                            )}
                          </td>
                          <td className={`${cellClass} text-right font-semibold text-slate-800`}>{s.followUpsDone}</td>
                          <td className={`${cellClass} text-right`}>
                            {onTimePct !== null ? (
                              <span
                                className={`font-bold ${
                                  onTimePct >= 80
                                    ? 'text-emerald-700'
                                    : onTimePct >= 50
                                    ? 'text-amber-700'
                                    : 'text-rose-600'
                                }`}
                              >
                                {onTimePct}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className={`${cellClass} text-right`}>
                            {s.followUpsMissed > 0 ? (
                              <span className="inline-flex items-center rounded-md bg-rose-50 border border-rose-200 px-1.5 py-0.2 text-[10px] font-bold text-rose-700">
                                {s.followUpsMissed} missed
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className={`${cellClass} text-right text-slate-600 font-semibold`}>
                            {s.followUpsPending}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 6. TACTICAL INTELLIGENCE TRIO (LOST REASONS, AGING & DISCIPLINE) */}
          <div className="grid gap-3.5 xl:grid-cols-3 items-start">
            {/* 1. Lost Reasons */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-rose-500" />
                  Lost Deal Drivers & Drop-offs
                </h3>
                <p className="text-[11px] text-slate-500">
                  Primary causes reported by staff when deals are marked lost.
                </p>
              </div>

              {r.lostReasons.length ? (
                <div className="space-y-2 pt-1">
                  {r.lostReasons.map((l) => {
                    const lostTotal = r.totals.lost || 1;
                    const share = Math.round((l.count / lostTotal) * 100);
                    return (
                      <div key={l.reason} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 truncate" title={l.reason}>
                            {l.reason}
                          </span>
                          <span className="font-bold text-slate-900 text-xs shrink-0">
                            {l.count} <span className="text-slate-400 font-normal">({share}%)</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-rose-500 rounded-full"
                            style={{ width: `${Math.max(share, 4)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No lost leads recorded in this period" />
              )}
            </section>

            {/* 2. Open Lead Aging */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Active Inquiries Aging Velocity
                </h3>
                <p className="text-[11px] text-slate-500">
                  Time elapsed since inquiry creation for all currently active deals.
                </p>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {r.aging.map((a, idx) => {
                  const badgeTone =
                    idx === 0
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : idx === 1
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : idx === 2
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200';

                  return (
                    <div key={a.bucket} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-blue-500' : idx === 2 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                        <span className="font-semibold text-slate-700">{a.bucket}</span>
                      </div>
                      <span className={`font-bold px-2 py-0.5 rounded-md border text-[11px] ${badgeTone}`}>
                        {a.count} deals
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 3. Follow-up Discipline */}
            <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-purple-600" />
                  Follow-Up Discipline Scorecard
                </h3>
                <p className="text-[11px] text-slate-500">
                  Compliance and adherence against scheduled call deadlines.
                </p>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {[
                  ['Total Scheduled in Range', r.followUpCompliance.total, 'text-slate-900'],
                  ['Completed On Time', r.followUpCompliance.onTime, 'text-emerald-700 font-black'],
                  ['Completed Late', r.followUpCompliance.late, 'text-amber-700 font-bold'],
                  ['Missed / Overdue Calls', r.followUpCompliance.missed, r.followUpCompliance.missed > 0 ? 'text-rose-600 font-black' : 'text-slate-500'],
                  ['Still Pending Action', r.followUpCompliance.pending, 'text-slate-700 font-semibold'],
                ].map(([labelStr, val, colorCls]) => (
                  <div key={String(labelStr)} className="flex items-center justify-between py-2.5">
                    <span className="text-slate-600 font-medium">{String(labelStr)}</span>
                    <span className={`text-xs ${colorCls}`}>{String(val)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function CrmReportsPage() {
  return (
    <CrmPageFrame fluid={true}>
      <Reports />
    </CrmPageFrame>
  );
}
