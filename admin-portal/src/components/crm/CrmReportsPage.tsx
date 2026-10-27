'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Flame,
  PieChart,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { cellClass, EmptyState, inputClass, Panel, tableHeadClass } from '@/components/financeWorkspace/ui';
import {
  CrmErrorBanner,
  CrmLoadingState,
  CrmPageFrame,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  PageHeader,
  StatTile,
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

// Executive palette
const BLUE = '#2563eb';
const AMBER = '#f59e0b';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const minutesText = (m: number | null) =>
  m === null ? '—' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;

function RateTable({
  rows,
  keyLabel,
  nameOf,
}: {
  rows: RateRow[];
  keyLabel: string;
  nameOf: (key: string) => string;
}) {
  if (!rows.length) return <EmptyState title="No leads recorded in this period" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] text-left text-xs">
        <thead className={tableHeadClass}>
          <tr>
            <th className="px-3.5 py-2 font-bold text-slate-700">{keyLabel}</th>
            <th className="px-3 py-2 text-right font-bold text-slate-700">Inquiries</th>
            <th className="px-3 py-2 text-right font-bold text-slate-700">Won</th>
            <th className="px-3 py-2 text-right font-bold text-slate-700">Lost</th>
            <th className="px-3 py-2 text-right font-bold text-slate-700">Active</th>
            <th className="px-3.5 py-2 text-right font-bold text-slate-700">Win Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key} className="hover:bg-slate-50 transition-colors">
              <td className={`${cellClass} font-bold text-slate-800`}>{nameOf(r.key)}</td>
              <td className={`${cellClass} text-right font-semibold`}>{r.created}</td>
              <td className={`${cellClass} text-right font-bold text-emerald-700`}>{r.won}</td>
              <td className={`${cellClass} text-right text-rose-600`}>{r.lost}</td>
              <td className={`${cellClass} text-right text-slate-500`}>{r.open}</td>
              <td className={`${cellClass} text-right`}>
                <div className="flex items-center justify-end gap-2">
                  <div className="hidden sm:block w-12 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(r.conversion, 100)}%` }}
                    />
                  </div>
                  <span className="font-bold text-slate-900">{r.conversion}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Reports() {
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);
    return { from: iso(from), to: iso(to) };
  });

  const setPreset = (days: number) => {
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86400000);
    setRange({ from: iso(from), to: iso(to) });
  };

  const params = {
    from: new Date(`${range.from}T00:00:00`).toISOString(),
    to: new Date(`${range.to}T23:59:59`).toISOString(),
  };
  const data = useCrmResource(() => getJson<Reports>('/crm/reports', params), JSON.stringify(params));
  const r = data.data;

  return (
    <>
      <PageHeader
        title="CRM Analytics & Conversion Reports"
        badgeText={r ? `${r.totals.created} Inquiries Analyzed` : undefined}
        description="Performance audit of deal conversions, response SLAs, acquisition channels, and executive productivity."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-slate-200/90 bg-white p-0.5 shadow-2xs text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => setPreset(7)}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setPreset(30)}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setPreset(90)}
                className="px-2.5 py-1 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                Quarter
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200/90 rounded-xl px-2.5 py-1 shadow-2xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={range.from}
                max={range.to}
                onChange={(e) => setRange((x) => ({ ...x, from: e.target.value }))}
                className="bg-transparent outline-none text-xs text-slate-800 font-semibold cursor-pointer"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={range.to}
                min={range.from}
                onChange={(e) => setRange((x) => ({ ...x, to: e.target.value }))}
                className="bg-transparent outline-none text-xs text-slate-800 font-semibold cursor-pointer"
              />
            </div>
          </div>
        }
      />

      {data.loading && !r ? (
        <CrmLoadingState label="Analyzing conversion reports…" />
      ) : data.error || !r ? (
        <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} />
      ) : (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatTile
            label="Inquiries Generated"
            value={r.totals.created}
            hint="Total period volume"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatTile
            label="Deals Won"
            value={r.totals.won}
            hint="Successfully closed"
            tone="text-emerald-700"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          />
          <StatTile
            label="Inquiries Lost"
            value={r.totals.lost}
            hint="Drop-off count"
            tone={r.totals.lost ? 'text-rose-600' : 'text-slate-900'}
          />
          <StatTile
            label="Conversion Rate"
            value={`${r.totals.conversion}%`}
            hint="Won vs Closed"
            tone="text-amber-600"
            icon={<ArrowUpRight className="h-4 w-4 text-amber-500" />}
          />
          <StatTile
            label="Won Deal Valuation"
            value={fmtInr(r.totals.wonValue)}
            hint="Gross value realized"
            tone="text-emerald-700"
            icon={<Trophy className="h-4 w-4 text-emerald-600" />}
          />
        </section>
      )}

      {r ? (
        <>
          {/* DAILY CONVERSION TREND */}
          <Panel
            title="Inbound Influx vs Deals Won Velocity"
            description="Daily rate of new inquiry arrivals compared to closed-won machinery transactions."
          >
            <div className="h-72 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.trend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => v.slice(5)}
                    minTickGap={16}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 'bold',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontWeight: 'bold' }} />
                  <Line
                    type="monotone"
                    dataKey="created"
                    name="Inbound Leads"
                    stroke={BLUE}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="won"
                    name="Won Deals"
                    stroke={AMBER}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* BREAKDOWN BY SOURCE & TYPE */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Conversion by Inbound Source" description="Lead channel efficiency">
              <RateTable rows={r.bySource} keyLabel="Acquisition Source" nameOf={label} />
            </Panel>
            <Panel title="Conversion by Lead Category" description="Equipment & service intent">
              <RateTable
                rows={r.byType}
                keyLabel="Category Type"
                nameOf={(k) => LEAD_TYPE_LABELS[k] || label(k)}
              />
            </Panel>
          </div>

          {/* TEAM PERFORMANCE AUDIT */}
          <Panel
            title="Executive Performance & SLA Audit"
            description="First response speed (median time from creation to first contact), win rates, and follow-up compliance."
          >
            {!r.staff.length ? (
              <EmptyState title="No assigned leads in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className={tableHeadClass}>
                    <tr>
                      <th className="px-3.5 py-2 font-bold text-slate-700">Team Executive</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">Inquiries</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">Won</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">Won Value</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">Win Rate</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">1st Response</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">Follow-ups</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">On Time %</th>
                      <th className="px-3 py-2 text-right font-bold text-slate-700">Missed</th>
                      <th className="px-3.5 py-2 text-right font-bold text-slate-700">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.staff.map((s) => (
                      <tr key={s.userId} className="hover:bg-slate-50 transition-colors">
                        <td className={`${cellClass} font-bold text-slate-900`}>{s.name}</td>
                        <td className={`${cellClass} text-right font-semibold`}>{s.leads}</td>
                        <td className={`${cellClass} text-right font-bold text-emerald-700`}>{s.won}</td>
                        <td className={`${cellClass} text-right font-semibold`}>{fmtInr(s.wonValue)}</td>
                        <td className={`${cellClass} text-right font-bold text-slate-900`}>{s.conversion}%</td>
                        <td className={`${cellClass} text-right font-medium text-slate-600`}>
                          {minutesText(s.medianFirstResponseMinutes)}
                        </td>
                        <td className={`${cellClass} text-right`}>{s.followUpsDone}</td>
                        <td className={`${cellClass} text-right font-semibold text-slate-800`}>
                          {s.followUpsDone ? `${Math.round((s.followUpsOnTime / s.followUpsDone) * 100)}%` : '—'}
                        </td>
                        <td
                          className={`${cellClass} text-right ${
                            s.followUpsMissed ? 'font-bold text-rose-600' : 'text-slate-400'
                          }`}
                        >
                          {s.followUpsMissed}
                        </td>
                        <td className={`${cellClass} text-right text-slate-600`}>{s.followUpsPending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* LOST REASONS, LEAD AGING & DISCIPLINE */}
          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Lost Deal Reasons" description="Primary reasons reported for lost inquiries">
              {r.lostReasons.length ? (
                <div className="h-60 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={r.lostReasons} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="reason"
                        width={120}
                        tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                        formatter={(value) => [String(value), 'Leads']}
                      />
                      <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No lost leads recorded in this period" />
              )}
            </Panel>

            <Panel title="Open Lead Aging" description="Time elapsed since inquiry creation">
              <ul className="divide-y divide-slate-100 text-xs">
                {r.aging.map((a) => (
                  <li key={a.bucket} className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-600 font-medium">{a.bucket}</span>
                    <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      {a.count} deals
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Follow-up Discipline" description="Compliance against scheduled deadlines">
              <ul className="divide-y divide-slate-100 text-xs">
                {[
                  ['Total Due In Period', r.followUpCompliance.total],
                  ['Completed On Time', r.followUpCompliance.onTime],
                  ['Completed Late', r.followUpCompliance.late],
                  ['Missed / Overdue', r.followUpCompliance.missed],
                  ['Still Pending Action', r.followUpCompliance.pending],
                ].map(([k, v]) => (
                  <li key={String(k)} className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-600 font-medium">{k}</span>
                    <span
                      className={`font-bold ${
                        String(k).includes('Missed') && Number(v) > 0 ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {v}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}

export default function CrmReportsPage() {
  return (
    <CrmPageFrame>
      <Reports />
    </CrmPageFrame>
  );
}
