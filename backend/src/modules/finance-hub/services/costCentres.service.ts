import { FinCostCentreCategory, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, notFound } from '../http';
import { readBoolean, readEnum, readString } from '../utils/input';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';

const readCostCentre = (body: Record<string, unknown>) => {
  const code = readString(body, 'code', 'Code', { max: 20, required: true })!.toUpperCase();
  if (!/^[0-9A-Z][0-9A-Z-]{0,19}$/.test(code)) throw badRequest('Code can contain letters, digits and hyphens.');
  return {
    code,
    name: readString(body, 'name', 'Name', { max: 120, required: true })!,
    category: readEnum(body, 'category', 'Category', Object.values(FinCostCentreCategory), 'DEPARTMENT'),
    parentId: readString(body, 'parentId', 'Parent', { max: 60 }),
    managerUserId: readString(body, 'managerUserId', 'Manager', { max: 60 }),
    isActive: readBoolean(body, 'isActive', true),
  };
};

const assertParent = async (tx: Prisma.TransactionClient, parentId: string | null, selfId?: string) => {
  let cursor = parentId;
  while (cursor) {
    if (cursor === selfId) throw badRequest('A cost centre cannot be placed under itself.');
    const node: { parentId: string | null } | null = await tx.finCostCentre.findUnique({ where: { id: cursor }, select: { parentId: true } });
    if (!node) throw badRequest('Parent cost centre not found.');
    cursor = node.parentId;
  }
};

export const listCostCentres = () => prisma.finCostCentre.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'asc' }] });

export const createCostCentre = async (body: Record<string, unknown>, context: ActorContext) => {
  const data = readCostCentre(body);
  return prisma.$transaction(async (tx) => {
    if (await tx.finCostCentre.findUnique({ where: { code: data.code } })) throw conflict(`Code ${data.code} is already used.`);
    await assertParent(tx, data.parentId);
    const record = await tx.finCostCentre.create({ data });
    await writeFinAudit({ ...context, entityType: 'FinCostCentre', entityId: record.id, action: 'CREATE', after: record }, tx);
    return record;
  });
};

export const updateCostCentre = async (id: string, body: Record<string, unknown>, context: ActorContext) =>
  prisma.$transaction(async (tx) => {
    const before = await tx.finCostCentre.findUnique({ where: { id } });
    if (!before) throw notFound('Cost centre not found.');
    const data = readCostCentre({ ...before, ...body });
    if (data.code !== before.code && (await tx.finCostCentre.findUnique({ where: { code: data.code } }))) {
      throw conflict(`Code ${data.code} is already used.`);
    }
    await assertParent(tx, data.parentId, id);
    const record = await tx.finCostCentre.update({ where: { id }, data });
    await writeFinAudit({ ...context, entityType: 'FinCostCentre', entityId: id, action: 'UPDATE', before, after: record }, tx);
    return record;
  });
