'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, CalendarCheck, Flame, Inbox, Trophy, UserX } from 'lucide-react';
import { EmptyState, LoadingState, Panel } from '@/components/financeWorkspace/ui';
import { FollowUpRow } from './FollowUpsTab';
import {
  CrmErrorBanner,
  fmtDate,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type FollowUp,
} from './crmShared';

type Dashboard = {
  kpis: { openLeads: number; newToday: number; unassigned: number | null; hotLeads: number; leadsWithoutFollowUp: number; slaBreached: number; wonThisMonth: number; wonValueThisMonth: number; winRateThisMonth: number };
  followUps: { overdue: number; today: number; upcoming: number; doneToday: number; missed: number };
  myAgenda: FollowUp[];
  pipeline: Array<{ status: string; count: number; expectedValue: number }>;
  sources30d: Array<{ source: string; count: number }>;
  recent: Array<{ id: string; status: string; leadType: string; temperature: string; createdAt: string; listingTitleSnapshot: string | null; customer: { name: string | null; mobile: string | null }; owner: { name: string | null } | null }>;
};

// Dataviz palette slot 1 (single-series charts).
const SERIES = '#2a78d6';

function Kpi({ icon, value, label: text, href, tone = 'text-slate-900' }: { icon: ReactNode; value: string | number; label: string; href?: string; tone?: string }) {
  const body = (
    <div className="flex h-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-300">
      <div className="rounded-xl bg-slate-50 p-2 text-slate-500">{icon}</div>
      <div>
        <p className={`text-2xl font-bold ${tone}`}>{value}</p>
        <p className="text-xs font-semibold text-slate-500">{text}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardTab() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const [now] = useState(() => Date.now());
  const data = useCrmResource(() => getJson<Dashboard>('/crm/dashboard'), 'crm-dashboard');
  if (data.loading && !data.data) return <Panel><LoadingState /></Panel>;
  if (data.error || !data.data) return <Panel><CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} /></Panel>;
  const d = data.data;
  const leadsTab = (params: string) => `${base}?tab=leads&${params}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Inbox className="h-5 w-5" />} value={d.kpis.openLeads} label={`Open leads · ${d.kpis.newToday} new today`} href={leadsTab('view=open')} />
        <Kpi icon={<AlarmClock className="h-5 w-5" />} value={d.followUps.overdue} label={`Overdue follow-ups · ${d.followUps.today} due today`} href={`${base}?tab=followups`} tone={d.followUps.overdue ? 'text-red-600' : 'text-slate-900'} />
        <Kpi icon={<Flame className="h-5 w-5" />} value={d.kpis.hotLeads} label="Hot leads" href={leadsTab('temperature=HOT&view=open')} />
        <Kpi icon={<Trophy className="h-5 w-5" />} value={fmtInr(d.kpis.wonValueThisMonth)} label={`${d.kpis.wonThisMonth} won this month · ${d.kpis.winRateThisMonth}% win rate`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={<CalendarCheck className="h-5 w-5" />} value={d.kpis.leadsWithoutFollowUp} label="Open leads with no next step" href={leadsTab('followUp=none')} tone={d.kpis.leadsWithoutFollowUp ? 'text-amber-700' : 'text-slate-900'} />
        <Kpi icon={<AlarmClock className="h-5 w-5" />} value={d.kpis.slaBreached} label="Not contacted within SLA" href={leadsTab('sla=breached')} tone={d.kpis.slaBreached ? 'text-red-600' : 'text-slate-900'} />
        {d.kpis.unassigned !== null ? <Kpi icon={<UserX className="h-5 w-5" />} value={d.kpis.unassigned} label="Unassigned leads" href={leadsTab('ownerId=none&view=open')} tone={d.kpis.unassigned ? 'text-amber-700' : 'text-slate-900'} /> : <div />}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="My follow-ups today" description="Overdue first. Finish each with an outcome and the next step." actions={<Link href={`${base}?tab=followups`} className="text-xs font-semibold text-amber-700 hover:underline">Open follow-ups</Link>}>
          {d.myAgenda.length ? <div className="divide-y divide-slate-100">{d.myAgenda.map((f) => <FollowUpRow key={f.id} followUp={f} now={now} />)}</div> : <EmptyState title="Nothing due for you today" />}
        </Panel>
        <Panel title="Pipeline" description="Leads by stage">
          <div className="h-64 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.pipeline.map((p) => ({ ...p, name: label(p.status) }))} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid horizontal={false} stroke="#eef2f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [String(value), 'Leads']} />
                <Bar dataKey="count" fill={SERIES} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Newest leads" actions={<Link href={leadsTab('')} className="text-xs font-semibold text-amber-700 hover:underline">All leads</Link>}>
          {d.recent.length ? (
            <ul className="divide-y divide-slate-100">
              {d.recent.map((lead) => (
                <li key={lead.id}>
                  <Link href={leadHref(base, lead.id)} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{lead.customer.name || lead.customer.mobile}</p>
                      <p className="truncate text-xs text-slate-500">{LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}{lead.listingTitleSnapshot ? ` · ${lead.listingTitleSnapshot}` : ''} · {fmtDate(lead.createdAt)}{!meta?.access.isPartner ? ` · ${lead.owner?.name || 'Unassigned'}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5"><TemperatureBadge temperature={lead.temperature} /><StatusBadge status={lead.status} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No leads yet" />}
        </Panel>
        <Panel title="Lead sources" description="Last 30 days">
          {d.sources30d.length ? (
            <div className="h-64 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.sources30d.map((s) => ({ ...s, name: label(s.source) }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [String(value), 'Leads']} />
                  <Bar dataKey="count" fill={SERIES} radius={[4, 4, 0, 0]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No leads in the last 30 days" />}
        </Panel>
      </div>
    </div>
  );
}
