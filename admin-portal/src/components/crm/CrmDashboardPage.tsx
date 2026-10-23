'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlarmClock,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  Flame,
  Inbox,
  Plus,
  Trophy,
  Users,
  UserX,
  PhoneCall,
  Activity,
  Layers,
} from 'lucide-react';
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

// Executive Amber palette
const BAR_COLOR = '#f59e0b';

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
      title="CRM Executive Command Center"
      badgeText={data.data ? `${data.data.kpis.openLeads} Active Deals` : undefined}
      description={
        access?.canSeeAll
          ? 'Live team operational overview — leads velocity, pipeline stages, overdue follow-ups, and closed deals.'
          : 'Your direct customer inquiry queue, follow-ups due today, and deal progress.'
      }
      actions={
        access?.canManage ? (
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setCreating(true)}
          >
            Create New Lead
          </Button>
        ) : undefined
      }
    />
  );

  if (data.loading && !data.data) {
    return (
      <>
        {header}
        <LoadingState label="Loading CRM dashboard metrics…" />
      </>
    );
  }

  if (data.error || !data.data) {
    return (
      <>
        {header}
        <CrmErrorBanner message={data.error} schemaMissing={data.schemaMissing} />
      </>
    );
  }

  const d = data.data;
  const leads = (query: string) => crmPath(base, 'leads', query);

  return (
    <>
      {header}

      {/* 1. TOP EXECUTIVE KPI TILES */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Open Leads"
          value={d.kpis.openLeads}
          hint={`${d.kpis.newToday} new inquiries today`}
          icon={<Inbox className="h-4 w-4" />}
          href={leads('view=open')}
        />
        <StatTile
          label="Overdue Follow-ups"
          value={d.followUps.overdue}
          hint={`${d.followUps.today} scheduled today`}
          tone={d.followUps.overdue ? 'text-rose-600' : 'text-slate-900'}
          icon={<AlarmClock className="h-4 w-4" />}
          href={crmPath(base, 'follow-ups', 'bucket=overdue')}
        />
        <StatTile
          label="Hot Deals"
          value={d.kpis.hotLeads}
          hint="High buy-intent score"
          tone="text-amber-600"
          icon={<Flame className="h-4 w-4" />}
          href={leads('view=open&temperature=HOT')}
        />
        <StatTile
          label="Missing Next Step"
          value={d.kpis.leadsWithoutFollowUp}
          hint="Needs follow-up date"
          tone={d.kpis.leadsWithoutFollowUp ? 'text-amber-700' : 'text-slate-900'}
          icon={<CalendarCheck className="h-4 w-4" />}
          href={leads('followUp=none')}
        />
        {d.kpis.unassigned !== null ? (
          <StatTile
            label="Unassigned"
            value={d.kpis.unassigned}
            hint={`${d.kpis.slaBreached} breached initial SLA`}
            tone={d.kpis.unassigned ? 'text-amber-700' : 'text-slate-900'}
            icon={<UserX className="h-4 w-4" />}
            href={leads('view=open&ownerId=none')}
          />
        ) : (
          <StatTile
            label="SLA Missed"
            value={d.kpis.slaBreached}
            hint="Response time exceeded"
            tone={d.kpis.slaBreached ? 'text-rose-600' : 'text-slate-900'}
            icon={<AlarmClock className="h-4 w-4" />}
            href={leads('sla=breached')}
          />
        )}
        <StatTile
          label="Won This Month"
          value={fmtInr(d.kpis.wonValueThisMonth)}
          hint={`${d.kpis.wonThisMonth} won (${d.kpis.winRateThisMonth}% conversion)`}
          tone="text-emerald-700"
          icon={<Trophy className="h-4 w-4" />}
        />
      </section>

      {/* 2. MAIN WORKSPACE: AGENDA QUEUE & PIPELINE FUNNEL */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel
          title="Priority Follow-up Call Agenda"
          description="Overdue inquiries first, followed by today's calendar and upcoming appointments."
          actions={
            <Link
              href={crmPath(base, 'follow-ups')}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors"
            >
              <span>View Full Call Center</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {d.myAgenda.length ? (
            <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto custom-scrollbar">
              {d.myAgenda.map((f) => (
                <FollowUpRow key={f.id} followUp={f} now={now} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No pending follow-ups scheduled for you"
              description="Your call queue is clear! Schedule next steps directly from the Leads or Pipeline boards."
            />
          )}
        </Panel>

        <Panel
          title="Deal Pipeline Stage Funnel"
          description="Active and completed leads segmented by CRM deal stage."
          actions={
            <Link
              href={crmPath(base, 'pipeline')}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors"
            >
              <span>Open Kanban Board</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="h-72 p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={d.pipeline.map((p) => ({ ...p, name: label(p.status) }))}
                layout="vertical"
                margin={{ left: 24, right: 16, top: 4, bottom: 4 }}
              >
                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={118}
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
                <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>

      {/* 3. RECENT INQUIRIES FEED, LEAD CHANNELS, & TEAM WORKLOAD */}
      <section className={`grid gap-4 lg:grid-cols-2 ${d.team ? '2xl:grid-cols-3' : ''}`}>
        <Panel
          title="New Inbound Inquiries"
          description="Latest buyer and seller leads arriving in real time."
          actions={
            <Link
              href={leads('')}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 transition-colors"
            >
              <span>All Leads</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {d.recent.length ? (
            <ul className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto custom-scrollbar">
              {d.recent.map((lead) => {
                const initial = (lead.customer.name || lead.customer.mobile || 'U').charAt(0).toUpperCase();
                return (
                  <li key={lead.id}>
                    <Link
                      href={leadHref(base, lead.id)}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800 font-bold text-xs border border-slate-200">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">
                            {lead.customer.name || lead.customer.mobile || 'Customer'}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-700">
                              {LEAD_TYPE_LABELS[lead.leadType] || lead.leadType}
                            </span>
                            {lead.listingTitleSnapshot ? ` · ${lead.listingTitleSnapshot}` : ''} ·{' '}
                            {fmtDate(lead.createdAt)}
                            {!access?.isPartner ? ` · ${lead.owner?.name || 'Unassigned'}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <TemperatureBadge temperature={lead.temperature} />
                        <StatusBadge status={lead.status} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No new leads yet" description="Incoming website leads and partner submissions will appear here." />
          )}
        </Panel>

        <Panel
          title="Inbound Lead Sources"
          description="Inquiry acquisition channels over the last 30 days."
        >
          {d.sources30d.length ? (
            <div className="h-72 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={d.sources30d.slice(0, 8).map((s) => ({ ...s, name: label(s.source) }))}
                  layout="vertical"
                  margin={{ left: 24, right: 16, top: 4, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
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
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No source activity in the last 30 days" />
          )}
        </Panel>

        {d.team ? (
          <div className="lg:col-span-2 2xl:col-span-1">
            <Panel
              title="Team Operational Workload"
              description="Open deals and follow-up compliance per relationship manager."
            >
              {d.team.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className={tableHeadClass}>
                      <tr>
                        <th className="px-3.5 py-2 font-bold text-slate-600">Executive</th>
                        <th className="px-2.5 py-2 text-right font-bold text-slate-600">Open</th>
                        <th className="px-2.5 py-2 text-right font-bold text-slate-600">Overdue</th>
                        <th className="px-2.5 py-2 text-right font-bold text-slate-600">Today</th>
                        <th className="px-3.5 py-2 text-right font-bold text-slate-600">Done</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {d.team.map((row) => (
                        <tr
                          key={row.userId ?? 'none'}
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => router.push(leads(`view=open&ownerId=${row.userId ?? 'none'}`))}
                        >
                          <td className={`${cellClass} font-bold ${row.userId ? 'text-slate-800' : 'text-amber-700'}`}>
                            {row.name}
                          </td>
                          <td className={`${cellClass} text-right font-semibold`}>{row.openLeads}</td>
                          <td className={`${cellClass} text-right ${row.overdue ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
                            {row.overdue}
                          </td>
                          <td className={`${cellClass} text-right text-slate-700 font-semibold`}>{row.dueToday}</td>
                          <td className={`${cellClass} text-right text-emerald-700 font-bold`}>{row.doneToday}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="No open team work assigned yet" />
              )}
            </Panel>
          </div>
        ) : null}
      </section>

      {creating ? (
        <LeadForm
          onClose={() => setCreating(false)}
          onCreated={(id) => router.push(leadHref(base, id))}
        />
      ) : null}
    </>
  );
}

export default function CrmDashboardPage() {
  return (
    <CrmPageFrame>
      <Dashboard />
    </CrmPageFrame>
  );
}
