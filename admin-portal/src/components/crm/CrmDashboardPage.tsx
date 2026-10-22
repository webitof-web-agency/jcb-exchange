'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlarmClock, CalendarCheck, Flame, Inbox, Plus, Trophy, UserX } from 'lucide-react';
import { Button, cellClass, EmptyState, LoadingState, Panel, tableHeadClass } from '@/components/financeWorkspace/ui';
import { FollowUpRow } from './FollowUpRow';
import LeadForm from './LeadForm';
import {
  CrmErrorBanner,
  CrmPageFrame,
  crmPath,
  fmtDate,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  PageHeader,
  StatTile,
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
  team: Array<{ userId: string | null; name: string; openLeads: number; overdue: number; dueToday: number; doneToday: number }> | null;
};

// Dataviz palette slot 1 (single-series charts).
const SERIES = '#2a78d6';

function Dashboard() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const [creating, setCreating] = useState(false);
  const data = useCrmResource(() => getJson<Dashboard>('/crm/dashboard'), 'crm-dashboard');
  const access = meta?.access;

  const header = (
    <PageHeader
      title="CRM Dashboard"
      description={access?.canSeeAll ? 'Today across the whole team — leads, follow-ups and wins.' : 'Your leads and follow-ups for today.'}
      actions={access?.canManage ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New lead</Button> : undefined}
    />
  );
  if (data.loading && !data.data) return <>{header}<LoadingState /></>;
  if (data.error || !data.data) return <>{header}<CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} /></>;
  const d = data.data;
  const leads = (query: string) => crmPath(base, 'leads', query);

  return (
    <>
      {header}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile label="Open leads" value={d.kpis.openLeads} hint={`${d.kpis.newToday} new today`} icon={<Inbox className="h-4 w-4" />} href={leads('view=open')} />
        <StatTile label="Overdue follow-ups" value={d.followUps.overdue} hint={`${d.followUps.today} due today`} tone={d.followUps.overdue ? 'text-red-600' : 'text-slate-900'} icon={<AlarmClock className="h-4 w-4" />} href={crmPath(base, 'follow-ups', 'bucket=overdue')} />
        <StatTile label="Hot leads" value={d.kpis.hotLeads} hint="Score 65+" icon={<Flame className="h-4 w-4" />} href={leads('view=open&temperature=HOT')} />
        <StatTile label="No next step" value={d.kpis.leadsWithoutFollowUp} hint="Open leads without a follow-up" tone={d.kpis.leadsWithoutFollowUp ? 'text-amber-700' : 'text-slate-900'} icon={<CalendarCheck className="h-4 w-4" />} href={leads('followUp=none')} />
        {d.kpis.unassigned !== null ? (
          <StatTile label="Unassigned" value={d.kpis.unassigned} hint={`${d.kpis.slaBreached} not contacted within SLA`} tone={d.kpis.unassigned ? 'text-amber-700' : 'text-slate-900'} icon={<UserX className="h-4 w-4" />} href={leads('view=open&ownerId=none')} />
        ) : (
          <StatTile label="SLA missed" value={d.kpis.slaBreached} hint="Not contacted in time" tone={d.kpis.slaBreached ? 'text-red-600' : 'text-slate-900'} icon={<AlarmClock className="h-4 w-4" />} href={leads('sla=breached')} />
        )}
        <StatTile label="Won this month" value={fmtInr(d.kpis.wonValueThisMonth)} hint={`${d.kpis.wonThisMonth} deals · ${d.kpis.winRateThisMonth}% win rate`} tone="text-emerald-700" icon={<Trophy className="h-4 w-4" />} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel title="My next follow-ups" description="Overdue first, then today and upcoming. Finish each with an outcome and the next step." actions={<Link href={crmPath(base, 'follow-ups')} className="text-xs font-semibold text-amber-700 hover:underline">All follow-ups</Link>}>
          {d.myAgenda.length ? <div className="divide-y divide-slate-100">{d.myAgenda.map((f) => <FollowUpRow key={f.id} followUp={f} now={now} />)}</div> : <EmptyState title="No follow-ups planned for you" description="Plan next steps from the Leads page." />}
        </Panel>
        <Panel title="Pipeline" description="Open and closed leads by stage" actions={<Link href={crmPath(base, 'pipeline')} className="text-xs font-semibold text-amber-700 hover:underline">Open board</Link>}>
          <div className="h-72 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.pipeline.map((p) => ({ ...p, name: label(p.status) }))} layout="vertical" margin={{ left: 24, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="#eef2f6" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [String(value), 'Leads']} />
                <Bar dataKey="count" fill={SERIES} radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      <section className={`grid gap-5 lg:grid-cols-2 ${d.team ? '2xl:grid-cols-3' : ''}`}>
        <Panel title="Newest leads" actions={<Link href={leads('')} className="text-xs font-semibold text-amber-700 hover:underline">All leads</Link>}>
          {d.recent.length ? (
            <ul className="divide-y divide-slate-100">
              {d.recent.map((lead) => (
                <li key={lead.id}>
                  <Link href={leadHref(base, lead.id)} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{lead.customer.name || lead.customer.mobile}</p>
                      <p className="truncate text-xs text-slate-500">{LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}{lead.listingTitleSnapshot ? ` · ${lead.listingTitleSnapshot}` : ''} · {fmtDate(lead.createdAt)}{!access?.isPartner ? ` · ${lead.owner?.name || 'Unassigned'}` : ''}</p>
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
            <div className="h-72 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.sources30d.slice(0, 8).map((s) => ({ ...s, name: label(s.source) }))} layout="vertical" margin={{ left: 24, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="#eef2f6" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} formatter={(value) => [String(value), 'Leads']} />
                  <Bar dataKey="count" fill={SERIES} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <EmptyState title="No leads in the last 30 days" />}
        </Panel>
        {d.team ? (
          <div className="lg:col-span-2 2xl:col-span-1">
            <Panel title="Team today" description="Open leads and follow-up load per person">
              {d.team.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className={tableHeadClass}>
                      <tr><th className="px-4 py-2.5">Owner</th><th className="px-3 py-2.5 text-right">Open</th><th className="px-3 py-2.5 text-right">Overdue</th><th className="px-3 py-2.5 text-right">Today</th><th className="px-4 py-2.5 text-right">Done</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {d.team.map((row) => (
                        <tr key={row.userId ?? 'none'} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(leads(`view=open&ownerId=${row.userId ?? 'none'}`))}>
                          <td className={`${cellClass} font-semibold ${row.userId ? 'text-slate-800' : 'text-amber-700'}`}>{row.name}</td>
                          <td className={`${cellClass} text-right`}>{row.openLeads}</td>
                          <td className={`${cellClass} text-right ${row.overdue ? 'font-semibold text-red-600' : ''}`}>{row.overdue}</td>
                          <td className={`${cellClass} text-right`}>{row.dueToday}</td>
                          <td className={`${cellClass} text-right text-emerald-700`}>{row.doneToday}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState title="No open work yet" />}
            </Panel>
          </div>
        ) : null}
      </section>

      {creating ? <LeadForm onClose={() => setCreating(false)} onCreated={(id) => router.push(leadHref(base, id))} /> : null}
    </>
  );
}

export default function CrmDashboardPage() {
  return <CrmPageFrame><Dashboard /></CrmPageFrame>;
}
