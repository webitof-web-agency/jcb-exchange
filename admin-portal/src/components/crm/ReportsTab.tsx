'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cellClass, EmptyState, Field, inputClass, LoadingState, Panel, tableHeadClass } from '@/components/financeWorkspace/ui';
import { CrmErrorBanner, fmtInr, getJson, label, LEAD_TYPE_LABELS, useCrmResource } from './crmShared';

type RateRow = { key: string; created: number; won: number; lost: number; open: number; conversion: number };
type Reports = {
  totals: { created: number; won: number; lost: number; wonValue: number; conversion: number };
  funnel: Array<{ status: string; count: number }>;
  bySource: RateRow[];
  byType: RateRow[];
  staff: Array<{ userId: string; name: string; leads: number; won: number; lost: number; wonValue: number; conversion: number; medianFirstResponseMinutes: number | null; followUpsDone: number; followUpsOnTime: number; followUpsMissed: number; followUpsPending: number }>;
  lostReasons: Array<{ reason: string; count: number }>;
  aging: Array<{ bucket: string; count: number }>;
  followUpCompliance: { total: number; done: number; onTime: number; late: number; missed: number; pending: number };
  trend: Array<{ date: string; created: number; won: number }>;
};

// Dataviz palette slots 1–2.
const BLUE = '#2a78d6';
const ORANGE = '#eb6834';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const minutesText = (m: number | null) => (m === null ? '—' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);

function RateTable({ rows, keyLabel, nameOf }: { rows: RateRow[]; keyLabel: string; nameOf: (key: string) => string }) {
  if (!rows.length) return <EmptyState title="No leads in this period" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className={tableHeadClass}><tr><th className="px-4 py-3">{keyLabel}</th><th className="px-4 py-3 text-right">Leads</th><th className="px-4 py-3 text-right">Won</th><th className="px-4 py-3 text-right">Lost</th><th className="px-4 py-3 text-right">Open</th><th className="px-4 py-3 text-right">Conversion</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className={cellClass}>{nameOf(r.key)}</td>
              <td className={`${cellClass} text-right font-semibold`}>{r.created}</td>
              <td className={`${cellClass} text-right text-emerald-700`}>{r.won}</td>
              <td className={`${cellClass} text-right text-red-600`}>{r.lost}</td>
              <td className={`${cellClass} text-right`}>{r.open}</td>
              <td className={`${cellClass} text-right font-semibold`}>{r.conversion}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsTab() {
  const [range, setRange] = useState(() => { const to = new Date(); const from = new Date(to.getTime() - 29 * 86400000); return { from: iso(from), to: iso(to) }; });
  const params = { from: new Date(`${range.from}T00:00:00`).toISOString(), to: new Date(`${range.to}T23:59:59`).toISOString() };
  const data = useCrmResource(() => getJson<Reports>('/crm/reports', params), JSON.stringify(params));
  const r = data.data;

  return (
    <div className="space-y-4">
      <Panel title="CRM reports" description="Leads created in the period; won/lost by the date they closed.">
        <div className="grid gap-3 p-4 sm:grid-cols-[180px_180px_1fr]">
          <Field label="From"><input type="date" value={range.from} max={range.to} onChange={(e) => setRange((x) => ({ ...x, from: e.target.value }))} className={inputClass} /></Field>
          <Field label="To"><input type="date" value={range.to} min={range.from} onChange={(e) => setRange((x) => ({ ...x, to: e.target.value }))} className={inputClass} /></Field>
        </div>
        {data.loading && !r ? <LoadingState /> : data.error || !r ? <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} /> : (
          <div className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-5">
            {[
              ['Leads created', r.totals.created],
              ['Won', r.totals.won],
              ['Lost', r.totals.lost],
              ['Conversion', `${r.totals.conversion}%`],
              ['Won value', fmtInr(r.totals.wonValue)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold text-slate-900">{v}</p><p className="text-xs font-semibold text-slate-500">{k}</p></div>
            ))}
          </div>
        )}
      </Panel>

      {r ? (
        <>
          <Panel title="Daily trend" description="New leads and deals won per day">
            <div className="h-64 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.trend} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v: string) => v.slice(5)} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="linear" dataKey="created" name="New leads" stroke={BLUE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="linear" dataKey="won" name="Won" stroke={ORANGE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="By source"><RateTable rows={r.bySource} keyLabel="Source" nameOf={label} /></Panel>
            <Panel title="By lead type"><RateTable rows={r.byType} keyLabel="Type" nameOf={(k) => LEAD_TYPE_LABELS[k] || label(k)} /></Panel>
          </div>

          <Panel title="Team performance" description="First response is the median time from lead creation to the first contact.">
            {!r.staff.length ? <EmptyState title="No assigned leads in this period" /> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className={tableHeadClass}><tr><th className="px-4 py-3">Staff</th><th className="px-4 py-3 text-right">Leads</th><th className="px-4 py-3 text-right">Won</th><th className="px-4 py-3 text-right">Won value</th><th className="px-4 py-3 text-right">Conversion</th><th className="px-4 py-3 text-right">First response</th><th className="px-4 py-3 text-right">Follow-ups done</th><th className="px-4 py-3 text-right">On time</th><th className="px-4 py-3 text-right">Missed</th><th className="px-4 py-3 text-right">Pending</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.staff.map((s) => (
                      <tr key={s.userId}>
                        <td className={`${cellClass} font-semibold`}>{s.name}</td>
                        <td className={`${cellClass} text-right`}>{s.leads}</td>
                        <td className={`${cellClass} text-right text-emerald-700`}>{s.won}</td>
                        <td className={`${cellClass} text-right`}>{fmtInr(s.wonValue)}</td>
                        <td className={`${cellClass} text-right font-semibold`}>{s.conversion}%</td>
                        <td className={`${cellClass} text-right`}>{minutesText(s.medianFirstResponseMinutes)}</td>
                        <td className={`${cellClass} text-right`}>{s.followUpsDone}</td>
                        <td className={`${cellClass} text-right`}>{s.followUpsDone ? `${Math.round((s.followUpsOnTime / s.followUpsDone) * 100)}%` : '—'}</td>
                        <td className={`${cellClass} text-right ${s.followUpsMissed ? 'font-semibold text-red-600' : ''}`}>{s.followUpsMissed}</td>
                        <td className={`${cellClass} text-right`}>{s.followUpsPending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel title="Why leads were lost">
              {r.lostReasons.length ? (
                <div className="h-60 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={r.lostReasons} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid horizontal={false} stroke="#eef2f6" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="reason" width={120} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [String(value), 'Leads']} />
                      <Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState title="No lost leads in this period" />}
            </Panel>
            <Panel title="Open lead age">
              <ul className="divide-y divide-slate-100">
                {r.aging.map((a) => <li key={a.bucket} className="flex justify-between px-4 py-2.5 text-sm"><span className="text-slate-600">{a.bucket}</span><span className="font-semibold text-slate-900">{a.count}</span></li>)}
              </ul>
            </Panel>
            <Panel title="Follow-up discipline" description="Follow-ups due in the period">
              <ul className="divide-y divide-slate-100 text-sm">
                {[
                  ['Due', r.followUpCompliance.total],
                  ['Done on time', r.followUpCompliance.onTime],
                  ['Done late', r.followUpCompliance.late],
                  ['Missed', r.followUpCompliance.missed],
                  ['Still pending', r.followUpCompliance.pending],
                ].map(([k, v]) => <li key={k} className="flex justify-between px-4 py-2.5"><span className="text-slate-600">{k}</span><span className={`font-semibold ${k === 'Missed' && Number(v) > 0 ? 'text-red-600' : 'text-slate-900'}`}>{v}</span></li>)}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
