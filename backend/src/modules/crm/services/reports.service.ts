import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { followUpScopeWhere, leadScopeWhere, type CrmAccess } from '../access';
import { badRequest, forbidden } from '../http';
import { addDays, istDayStart, LEAD_STATUSES, toCsv } from '../rules';
import { dateOrNull, toNumber } from './common';
import { followUpSummary } from './followups.service';
import { leadFilterWhere, serializeLead } from './leads.service';
import { getCrmConfig } from './settings.service';

const DAY = 24 * 60 * 60 * 1000;
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

export const getDashboard = async (access: CrmAccess) => {
  const now = new Date();
  const todayStart = istDayStart(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const scope: Prisma.LeadWhereInput = { AND: [leadScopeWhere(access), { mergedIntoId: null }] };
  const open: Prisma.LeadWhereInput = { AND: [scope, { status: { notIn: ['WON', 'LOST'] } }] };
  const [openCount, newToday, unassigned, hot, noFollowUp, slaBreached, wonMonth, lostMonth, pipeline, sources, recent, followUps, myToday] = await Promise.all([
    prisma.lead.count({ where: open }),
    prisma.lead.count({ where: { AND: [scope, { createdAt: { gte: todayStart } }] } }),
    access.canAssign ? prisma.lead.count({ where: { AND: [open, { ownerId: null, dealer: { role: { not: 'PARTNER' } } }] } }) : Promise.resolve(null),
    prisma.lead.count({ where: { AND: [open, { temperature: 'HOT' }] } }),
    prisma.lead.count({ where: { AND: [open, { nextFollowUpAt: null }] } }),
    prisma.lead.count({ where: { AND: [open, { slaBreachedAt: { not: null }, firstResponseAt: null }] } }),
    prisma.lead.aggregate({ where: { AND: [scope, { status: 'WON', closedAt: { gte: monthStart } }] }, _count: { _all: true }, _sum: { wonAmount: true } }),
    prisma.lead.count({ where: { AND: [scope, { status: 'LOST', closedAt: { gte: monthStart } }] } }),
    prisma.lead.groupBy({ by: ['status'], where: scope, _count: { _all: true }, _sum: { expectedValue: true } }),
    prisma.lead.groupBy({ by: ['source'], where: { AND: [scope, { createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }] }, _count: { _all: true } }),
    prisma.lead.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { id: true, status: true, leadType: true, source: true, temperature: true, createdAt: true, listingTitleSnapshot: true, customer: { select: { id: true, name: true, mobile: true } }, owner: { select: { id: true, name: true } } },
    }),
    followUpSummary(access, access.canSeeAll ? '' : 'me'),
    prisma.crmFollowUp.findMany({
      where: { AND: [followUpScopeWhere(access), { ownerId: access.userId, status: 'PENDING', dueAt: { lt: addDays(todayStart, 1) } }] },
      orderBy: { dueAt: 'asc' },
      take: 8,
      include: { contact: { select: { id: true, name: true, mobile: true } }, lead: { select: { id: true, status: true, listingTitleSnapshot: true, leadType: true } } },
    }),
  ]);
  const closedMonth = wonMonth._count._all + lostMonth;
  return {
    kpis: {
      openLeads: openCount,
      newToday,
      unassigned,
      hotLeads: hot,
      leadsWithoutFollowUp: noFollowUp,
      slaBreached,
      wonThisMonth: wonMonth._count._all,
      wonValueThisMonth: toNumber(wonMonth._sum.wonAmount) ?? 0,
      winRateThisMonth: pct(wonMonth._count._all, closedMonth),
    },
    followUps,
    myAgenda: myToday,
    pipeline: LEAD_STATUSES.map((status) => {
      const row = pipeline.find((p) => p.status === status);
      return { status, count: row?._count._all ?? 0, expectedValue: toNumber(row?._sum.expectedValue ?? null) ?? 0 };
    }),
    sources30d: sources.map((row) => ({ source: row.source, count: row._count._all })).sort((a, b) => b.count - a.count),
    recent,
  };
};

const rangeOf = (query: Record<string, string>) => {
  const now = new Date();
  const to = dateOrNull(query.to, 'to date') ?? now;
  const from = dateOrNull(query.from, 'from date') ?? new Date(to.getTime() - 30 * DAY);
  if (from > to) throw badRequest('The start date is after the end date.');
  if (to.getTime() - from.getTime() > 366 * DAY) throw badRequest('Pick a range of one year or less.');
  return { from, to };
};

export const getReports = async (access: CrmAccess, query: Record<string, string>) => {
  if (!access.canReports) throw forbidden('You do not have access to CRM reports.');
  const { from, to } = rangeOf(query);
  const config = await getCrmConfig();
  const scope = leadScopeWhere(access);
  const created = await prisma.lead.findMany({
    where: { AND: [scope, { mergedIntoId: null, createdAt: { gte: from, lte: to } }] },
    select: { id: true, status: true, source: true, leadType: true, ownerId: true, createdAt: true, firstResponseAt: true, closedAt: true, wonAmount: true, lostReason: true },
    take: 20000,
  });
  const closedInRange = await prisma.lead.findMany({
    where: { AND: [scope, { mergedIntoId: null, closedAt: { gte: from, lte: to } }] },
    select: { status: true, lostReason: true, wonAmount: true, ownerId: true, closedAt: true },
    take: 20000,
  });
  const followUps = await prisma.crmFollowUp.findMany({
    where: { AND: [followUpScopeWhere(access), { dueAt: { gte: from, lte: to }, status: { in: ['DONE', 'MISSED', 'PENDING'] } }] },
    select: { status: true, dueAt: true, completedAt: true, ownerId: true, outcome: true },
    take: 50000,
  });

  const groupRate = (key: 'source' | 'leadType') => {
    const map = new Map<string, { key: string; created: number; won: number; lost: number; open: number }>();
    for (const lead of created) {
      const k = lead[key];
      const row = map.get(k) ?? { key: k, created: 0, won: 0, lost: 0, open: 0 };
      row.created += 1;
      if (lead.status === 'WON') row.won += 1;
      else if (lead.status === 'LOST') row.lost += 1;
      else row.open += 1;
      map.set(k, row);
    }
    return [...map.values()].map((row) => ({ ...row, conversion: pct(row.won, row.created) })).sort((a, b) => b.created - a.created);
  };

  // Staff performance.
  const ownerIds = [...new Set([...created.map((l) => l.ownerId), ...followUps.map((f) => f.ownerId)].filter((id): id is string => Boolean(id)))];
  const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, role: true } }) : [];
  const graceMs = config.missed.graceMinutes * 60000;
  const staff = owners.map((owner) => {
    const leads = created.filter((l) => l.ownerId === owner.id);
    const responded = leads.filter((l) => l.firstResponseAt);
    const responseMinutes = responded.map((l) => (l.firstResponseAt!.getTime() - l.createdAt.getTime()) / 60000).sort((a, b) => a - b);
    const mine = followUps.filter((f) => f.ownerId === owner.id);
    const done = mine.filter((f) => f.status === 'DONE');
    const won = closedInRange.filter((l) => l.ownerId === owner.id && l.status === 'WON');
    return {
      userId: owner.id,
      name: owner.name || 'Unnamed',
      role: owner.role,
      leads: leads.length,
      won: won.length,
      lost: closedInRange.filter((l) => l.ownerId === owner.id && l.status === 'LOST').length,
      wonValue: won.reduce((sum, l) => sum + (toNumber(l.wonAmount) ?? 0), 0),
      conversion: pct(leads.filter((l) => l.status === 'WON').length, leads.length),
      medianFirstResponseMinutes: responseMinutes.length ? Math.round(responseMinutes[Math.floor(responseMinutes.length / 2)] as number) : null,
      followUpsDone: done.length,
      followUpsOnTime: done.filter((f) => f.completedAt && f.completedAt.getTime() <= f.dueAt.getTime() + graceMs).length,
      followUpsMissed: mine.filter((f) => f.status === 'MISSED').length,
      followUpsPending: mine.filter((f) => f.status === 'PENDING').length,
    };
  }).sort((a, b) => b.leads - a.leads);

  const lostReasons = new Map<string, number>();
  for (const lead of closedInRange) if (lead.status === 'LOST') lostReasons.set(lead.lostReason || 'Not given', (lostReasons.get(lead.lostReason || 'Not given') ?? 0) + 1);

  const now = Date.now();
  const openNow = await prisma.lead.findMany({ where: { AND: [scope, { mergedIntoId: null, status: { notIn: ['WON', 'LOST'] } }] }, select: { createdAt: true }, take: 20000 });
  const aging = [
    { bucket: '0–2 days', max: 2 }, { bucket: '3–7 days', max: 7 }, { bucket: '8–30 days', max: 30 }, { bucket: '31–90 days', max: 90 }, { bucket: '90+ days', max: Infinity },
  ].map((b, i, all) => {
    const min = i === 0 ? -1 : (all[i - 1]?.max ?? -1);
    return { bucket: b.bucket, count: openNow.filter((l) => { const age = (now - l.createdAt.getTime()) / DAY; return age > min && age <= b.max; }).length };
  });

  // IST calendar days from the first to the last day of the range (max 92, ending at `to`).
  const lastDay = istDayStart(to);
  const days = Math.min(92, Math.round((lastDay.getTime() - istDayStart(from).getTime()) / DAY) + 1);
  const start = addDays(lastDay, -(days - 1));
  const trend = Array.from({ length: days }, (_, i) => {
    const dayStart = addDays(start, i);
    const dayEnd = addDays(dayStart, 1);
    return {
      date: new Date(dayStart.getTime() + 330 * 60000).toISOString().slice(0, 10),
      created: created.filter((l) => l.createdAt >= dayStart && l.createdAt < dayEnd).length,
      won: closedInRange.filter((l) => l.status === 'WON' && l.closedAt && l.closedAt >= dayStart && l.closedAt < dayEnd).length,
    };
  });

  const done = followUps.filter((f) => f.status === 'DONE');
  return {
    range: { from, to },
    totals: {
      created: created.length,
      won: closedInRange.filter((l) => l.status === 'WON').length,
      lost: closedInRange.filter((l) => l.status === 'LOST').length,
      wonValue: closedInRange.filter((l) => l.status === 'WON').reduce((sum, l) => sum + (toNumber(l.wonAmount) ?? 0), 0),
      conversion: pct(created.filter((l) => l.status === 'WON').length, created.length),
    },
    funnel: LEAD_STATUSES.map((status) => ({ status, count: created.filter((l) => l.status === status).length })),
    bySource: groupRate('source'),
    byType: groupRate('leadType'),
    staff,
    lostReasons: [...lostReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    aging,
    followUpCompliance: {
      total: followUps.length,
      done: done.length,
      onTime: done.filter((f) => f.completedAt && f.completedAt.getTime() <= f.dueAt.getTime() + graceMs).length,
      late: done.filter((f) => f.completedAt && f.completedAt.getTime() > f.dueAt.getTime() + graceMs).length,
      missed: followUps.filter((f) => f.status === 'MISSED').length,
      pending: followUps.filter((f) => f.status === 'PENDING').length,
    },
    trend,
  };
};

export const exportLeadsCsv = async (access: CrmAccess, query: Record<string, string>) => {
  if (!access.canExport) throw forbidden('You do not have permission to export CRM data.');
  const leads = await prisma.lead.findMany({
    where: leadFilterWhere(access, query),
    orderBy: { createdAt: 'desc' },
    take: 10000,
    select: {
      id: true, createdAt: true, status: true, leadType: true, source: true, priority: true, temperature: true, score: true, listingTitleSnapshot: true,
      budgetMin: true, budgetMax: true, requirementCity: true, requirementState: true, expectedValue: true, wonAmount: true, lostReason: true, tags: true,
      nextFollowUpAt: true, lastContactedAt: true, closedAt: true, message: true,
      customer: { select: { name: true, mobile: true, email: true, city: true, state: true } },
      owner: { select: { name: true } }, dealer: { select: { name: true, role: true } },
    },
  });
  const iso = (d: Date | null) => (d ? d.toISOString() : '');
  const rows = leads.map(serializeLead);
  return toCsv([
    ['Lead ID', 'Created', 'Status', 'Type', 'Source', 'Priority', 'Temperature', 'Score', 'Customer', 'Mobile', 'Email', 'City', 'State', 'Machine', 'Budget min', 'Budget max', 'Req. city', 'Req. state', 'Expected value', 'Won amount', 'Lost reason', 'Tags', 'Owner', 'Routed to', 'Next follow-up', 'Last contacted', 'Closed', 'Message'],
    ...rows.map((l) => [
      l.id, iso(l.createdAt), l.status, l.leadType, l.source, l.priority, l.temperature, l.score, l.customer.name, l.customer.mobile, l.customer.email, l.customer.city, l.customer.state,
      l.listingTitleSnapshot, l.budgetMin, l.budgetMax, l.requirementCity, l.requirementState, l.expectedValue, l.wonAmount, l.lostReason, l.tags.join('; '),
      l.owner?.name, l.dealer.role === 'PARTNER' ? `Partner: ${l.dealer.name ?? ''}` : 'Platform', iso(l.nextFollowUpAt), iso(l.lastContactedAt), iso(l.closedAt), l.message,
    ]),
  ]);
};
