import prisma from '../../../lib/prisma';
import { canDeletePipelineStage, getPipelineStageStatusSets, normalizePipelineStageInput, type PipelineStageColor } from '../pipelineStages';
import { badRequest, conflict, forbidden, notFound } from '../http';
import type { CrmAccess } from '../access';

export type PipelineStageView = {
  id: string;
  code: string;
  name: string;
  order: number;
  color: PipelineStageColor;
  isTerminal: boolean;
  isSystem: boolean;
  usageCount: number;
};

const stageSelect = {
  id: true,
  code: true,
  name: true,
  order: true,
  color: true,
  isTerminal: true,
  isSystem: true,
  _count: { select: { leads: true } },
} as const;

const serializeStage = (stage: { id: string; code: string; name: string; order: number; color: string; isTerminal: boolean; isSystem: boolean; _count: { leads: number } }): PipelineStageView => ({
  id: stage.id,
  code: stage.code,
  name: stage.name,
  order: stage.order,
  color: stage.color as PipelineStageColor,
  isTerminal: stage.isTerminal,
  isSystem: stage.isSystem,
  usageCount: stage._count.leads,
});

const requireStageManager = (access: CrmAccess) => {
  if (access.isPartner || !access.canPipelineManage) throw forbidden('You do not have permission to manage CRM pipeline stages.');
};

export const listPipelineStages = async () => {
  const stages = await prisma.crmPipelineStage.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    select: stageSelect,
  });
  return stages.map(serializeStage);
};

export const listPipelineStageStatusSets = async () => {
  const stages = await prisma.crmPipelineStage.findMany({ select: { code: true, isTerminal: true }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  return getPipelineStageStatusSets(stages);
};

export const getPipelineStage = async (code: string) => {
  const stage = await prisma.crmPipelineStage.findUnique({ where: { code }, select: stageSelect });
  return stage ? serializeStage(stage) : null;
};

export const createPipelineStage = async (access: CrmAccess, body: Record<string, unknown>) => {
  requireStageManager(access);
  let input: ReturnType<typeof normalizePipelineStageInput>;
  try {
    input = normalizePipelineStageInput(body);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid pipeline stage.');
  }

  const existing = await prisma.crmPipelineStage.findUnique({ where: { code: input.code }, select: { id: true } });
  if (existing) throw conflict('A CRM pipeline stage with this code already exists.');

  const stage = await prisma.crmPipelineStage.create({ data: input, select: stageSelect });
  return serializeStage(stage);
};

export const updatePipelineStage = async (access: CrmAccess, code: string, body: Record<string, unknown>) => {
  requireStageManager(access);
  const current = await prisma.crmPipelineStage.findUnique({ where: { code }, select: { id: true, code: true, isTerminal: true, isSystem: true } });
  if (!current) throw notFound('Pipeline stage not found.');

  let input: ReturnType<typeof normalizePipelineStageInput>;
  try {
    input = normalizePipelineStageInput({ ...body, code: current.code, isTerminal: current.isTerminal });
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid pipeline stage.');
  }

  const stage = await prisma.crmPipelineStage.update({ where: { id: current.id }, data: input, select: stageSelect });
  return serializeStage(stage);
};

export const deletePipelineStage = async (access: CrmAccess, code: string) => {
  requireStageManager(access);
  const stage = await prisma.crmPipelineStage.findUnique({ where: { code }, select: { id: true, code: true, name: true, isTerminal: true, isSystem: true, _count: { select: { leads: true } } } });
  if (!stage) throw notFound('Pipeline stage not found.');
  if (stage.code === 'WON' || stage.code === 'LOST') throw conflict('Won and Lost are system close stages and cannot be deleted.');
  const openStageCount = await prisma.crmPipelineStage.count({ where: { isTerminal: false } });
  if (!canDeletePipelineStage(stage._count.leads, stage.isTerminal, openStageCount)) {
    if (!stage.isTerminal && openStageCount <= 1) throw conflict('At least one open CRM pipeline stage must remain.');
    throw conflict(`Cannot delete "${stage.name}" because it is used by ${stage._count.leads} lead(s).`, { usageCount: stage._count.leads });
  }

  const stageCount = await prisma.crmPipelineStage.count();
  if (stageCount <= 1) throw conflict('At least one CRM pipeline stage must remain.');

  await prisma.crmPipelineStage.delete({ where: { id: stage.id } });
  return { id: stage.id, code: stage.code };
};
