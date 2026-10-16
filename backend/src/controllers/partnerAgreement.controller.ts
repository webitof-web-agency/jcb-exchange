import { AgreementType, PartnerAgreementDefinitionStatus } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { bumpPartnerAgreementVersion, normalizePartnerAgreementInput } from '../services/partnerAgreement.service';

const mapAgreementDefinition = (definition: any) => ({
  id: definition.id,
  agreementType: definition.agreementType,
  title: definition.title,
  summary: definition.summary || '',
  content: definition.content,
  version: definition.version,
  applicablePartnerTypes: definition.applicablePartnerTypes || [],
  isRequired: definition.isRequired,
  status: definition.status,
  effectiveFrom: definition.effectiveFrom,
  displayOrder: definition.displayOrder,
  createdAt: definition.createdAt,
  updatedAt: definition.updatedAt,
});

const parseEffectiveFrom = (value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new Error('Effective date must be a valid date.');
  }

  return date;
};

export const listPartnerAgreementDefinitions = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const definitions = await prisma.partnerAgreementDefinition.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ agreements: definitions.map(mapAgreementDefinition) });
  } catch (error) {
    next(error);
  }
};

export const getPartnerAgreementDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const definition = await prisma.partnerAgreementDefinition.findUnique({
      where: { id: String(req.params.id) },
    });

    if (!definition) {
      return res.status(404).json({ error: 'Partner agreement not found.' });
    }

    res.json({ agreement: mapAgreementDefinition(definition) });
  } catch (error) {
    next(error);
  }
};

export const createPartnerAgreementDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const normalized = normalizePartnerAgreementInput(req.body || {});
    const effectiveFrom = parseEffectiveFrom(req.body?.effectiveFrom);
    const definition = await prisma.partnerAgreementDefinition.create({
      data: {
        agreementType: normalized.agreementType as AgreementType,
        title: normalized.title,
        summary: normalized.summary || null,
        content: normalized.content,
        version: normalized.version,
        applicablePartnerTypes: normalized.applicablePartnerTypes,
        isRequired: normalized.isRequired,
        status: normalized.status as PartnerAgreementDefinitionStatus,
        effectiveFrom,
        displayOrder: normalized.displayOrder,
        createdById: req.user?.id || null,
        updatedById: req.user?.id || null,
      },
    });

    res.status(201).json({ agreement: mapAgreementDefinition(definition) });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'An agreement definition already exists for this agreement type.' });
    }

    if (error instanceof Error && error.message.includes('required') || error instanceof Error && error.message.includes('Unsupported') || error instanceof Error && error.message.includes('version') || error instanceof Error && error.message.includes('status') || error instanceof Error && error.message.includes('display order') || error instanceof Error && error.message.includes('Effective date')) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
};

export const updatePartnerAgreementDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.partnerAgreementDefinition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Partner agreement not found.' });
    }

    const normalized = normalizePartnerAgreementInput({
      ...req.body,
      agreementType: req.body?.agreementType || existing.agreementType,
      status: req.body?.status || existing.status,
      version: req.body?.version || existing.version,
    });
    const effectiveFrom = parseEffectiveFrom(req.body?.effectiveFrom);
    const contentChanged = normalized.content !== existing.content || normalized.title !== existing.title || normalized.summary !== (existing.summary || '');
    const nextVersion = existing.status === 'PUBLISHED' && contentChanged && normalized.version === existing.version
      ? bumpPartnerAgreementVersion(existing.version)
      : normalized.version;

    const definition = await prisma.partnerAgreementDefinition.update({
      where: { id },
      data: {
        agreementType: normalized.agreementType as AgreementType,
        title: normalized.title,
        summary: normalized.summary || null,
        content: normalized.content,
        version: nextVersion,
        applicablePartnerTypes: normalized.applicablePartnerTypes,
        isRequired: normalized.isRequired,
        status: normalized.status as PartnerAgreementDefinitionStatus,
        effectiveFrom,
        displayOrder: normalized.displayOrder,
        updatedById: req.user?.id || null,
      },
    });

    res.json({ agreement: mapAgreementDefinition(definition) });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'An agreement definition already exists for this agreement type.' });
    }

    if (error instanceof Error && (error.message.includes('required') || error.message.includes('Unsupported') || error.message.includes('version') || error.message.includes('status') || error.message.includes('display order') || error.message.includes('Effective date') || error.message.includes('Publish content'))) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
};

export const archivePartnerAgreementDefinition = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const definition = await prisma.partnerAgreementDefinition.updateMany({
      where: { id: String(req.params.id), status: { not: 'ARCHIVED' } },
      data: { status: 'ARCHIVED', updatedById: req.user?.id || null },
    });

    if (definition.count === 0) {
      return res.status(404).json({ error: 'Partner agreement not found or already archived.' });
    }

    res.json({ message: 'Partner agreement removed from the active catalogue.' });
  } catch (error) {
    next(error);
  }
};
