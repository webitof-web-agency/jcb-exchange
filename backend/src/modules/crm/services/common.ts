import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest } from '../http';

export type Db = Prisma.TransactionClient;

export const textOrNull = (value: unknown, max = 500) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
};

export const numberOrNull = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const intOrNull = (value: unknown) => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed);
};

export const decimalOrNull = (value: unknown) => {
  const parsed = numberOrNull(value);
  if (parsed === null) return null;
  if (parsed < 0) throw badRequest('Amounts cannot be negative.');
  return new Prisma.Decimal(parsed.toFixed(2));
};

export const toNumber = (value: Prisma.Decimal | number | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

export const dateOrNull = (value: unknown, label = 'date') => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw badRequest(`Invalid ${label}.`);
  return date;
};

export const stringList = (value: unknown, max = 30) => {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(items.map((item) => String(item ?? '').trim()).filter(Boolean))].slice(0, max).map((item) => item.slice(0, 60));
};

export const staffSelect = { id: true, name: true, mobile: true, role: true } as const;
export const contactSelect = { id: true, name: true, mobile: true, email: true, whatsappNumber: true, city: true, state: true, role: true, status: true } as const;

/** The platform account (first active super admin) receives leads not routed to a partner. */
export const platformRecipientId = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!admin) throw badRequest('No active super admin account is available to receive CRM leads.');
  return admin.id;
};

export type ActivityInput = {
  leadId: string;
  actorId: string | null;
  type: string;
  title: string;
  content?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Calls, messages and visits count as contact with the customer. */
  contacted?: boolean;
};

/** Writes the timeline row (LeadActivity, shared with the old enquiry screens) and touches the lead. */
export const logLeadActivity = async (db: Db, input: ActivityInput) => {
  const now = new Date();
  await db.leadActivity.create({
    data: {
      leadId: input.leadId,
      actorId: input.actorId,
      type: input.type,
      title: input.title.slice(0, 200),
      content: input.content ?? null,
      ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
    },
  });
  const lead = await db.lead.findUnique({ where: { id: input.leadId }, select: { firstResponseAt: true } });
  await db.lead.update({
    where: { id: input.leadId },
    data: {
      lastActivityAt: now,
      ...(input.contacted ? { lastContactedAt: now, ...(lead?.firstResponseAt ? {} : { firstResponseAt: now }) } : {}),
    },
  });
};

/** Keeps Lead.nextFollowUpAt equal to the earliest pending follow-up. */
export const syncNextFollowUp = async (db: Db, leadId: string) => {
  const next = await db.crmFollowUp.findFirst({ where: { leadId, status: 'PENDING' }, orderBy: { dueAt: 'asc' }, select: { dueAt: true } });
  await db.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
};

export const pageArgs = (pageValue: unknown, sizeValue: unknown, maxSize = 100) => {
  const page = Math.max(1, Math.floor(Number(pageValue) || 1));
  const pageSize = Math.min(maxSize, Math.max(1, Math.floor(Number(sizeValue) || 25)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
};

/** Active staff a lead or follow-up can be assigned to. */
export const assertAssignableStaff = async (db: Db, userId: string) => {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, status: true } });
  if (!user || !['EMPLOYEE', 'SUPER_ADMIN', 'ADMIN'].includes(user.role) || user.status !== 'ACTIVE') {
    throw badRequest('Choose an active staff member.');
  }
  return user;
};
