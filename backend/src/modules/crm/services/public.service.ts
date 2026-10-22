import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import prisma from '../../../lib/prisma';
import type { CrmAccess } from '../access';
import { badRequest, CrmHttpError, forbidden } from '../http';
import { LEAD_TYPES, normalizeMobile, oneOf } from '../rules';
import { decimalOrNull, intOrNull, platformRecipientId, textOrNull } from './common';
import { findOrCreateContact } from './contacts.service';
import { onLeadCaptured } from './leads.service';
import { getCrmConfig, saveWebhookKey } from './settings.service';

type CaptureInput = {
  leadType: (typeof LEAD_TYPES)[number];
  source: string;
  body: Record<string, unknown>;
  /** Lead fields specific to the form (requirement, expected price…). */
  fields: Record<string, unknown>;
  message: string;
};

/**
 * Creates (or refreshes, for a repeat) a platform lead from an unauthenticated channel:
 * website forms and the lead-capture webhook. Same repeat rule as the old callback form.
 */
const captureLead = async (input: CaptureInput) => {
  const dealerId = await platformRecipientId();
  const result = await prisma.$transaction(async (tx) => {
    const { user } = await findOrCreateContact(tx, { ...input.body, source: input.source }, null);
    const existing = await tx.lead.findFirst({
      where: { customerId: user.id, leadType: input.leadType, status: { notIn: ['WON', 'LOST'] }, mergedIntoId: null, dealerId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) {
      await tx.leadActivity.create({ data: { leadId: existing.id, type: 'FOLLOW_UP', title: 'Repeat Enquiry', content: input.message, metadata: { source: input.source } } });
      await tx.lead.update({ where: { id: existing.id }, data: { message: input.message, lastActivityAt: new Date(), ...input.fields } });
      return { id: existing.id, repeat: true };
    }
    const lead = await tx.lead.create({
      data: {
        customerId: user.id,
        dealerId,
        enquiryType: `CRM_${input.source}`,
        leadType: input.leadType,
        source: input.source,
        message: input.message,
        lastActivityAt: new Date(),
        ...input.fields,
      },
      select: { id: true },
    });
    await tx.leadActivity.create({ data: { leadId: lead.id, type: 'CREATED', title: 'Lead received', content: input.message, metadata: { source: input.source, leadType: input.leadType } } });
    return { id: lead.id, repeat: false };
  });
  await onLeadCaptured(result.id, { source: input.source, repeat: result.repeat });
  return result;
};

const requireFormsOn = async () => {
  if (!(await getCrmConfig()).publicForms.enabled) throw new CrmHttpError(503, 'This form is not accepting enquiries right now.');
};

// Honeypot: real visitors never fill the hidden "website" field.
const assertHuman = (body: Record<string, unknown>) => {
  if (textOrNull(body.website, 200)) throw badRequest('Could not submit the form.');
  if (!textOrNull(body.name, 120)) throw badRequest('Enter your name.');
  if (!normalizeMobile(body.mobile)) throw badRequest('Enter a valid 10-digit mobile number.');
  if (!textOrNull(body.city, 80)) throw badRequest('Enter your city.');
};

const catalogFields = (body: Record<string, unknown>) => ({
  categoryId: textOrNull(body.categoryId, 60),
  brandId: textOrNull(body.brandId, 60),
  modelId: textOrNull(body.modelId, 60),
});

/** "Can't find a machine? Post your requirement" → BUY lead with match alerts on. */
export const submitRequirement = async (body: Record<string, unknown>) => {
  await requireFormsOn();
  assertHuman(body);
  const notes = textOrNull(body.message, 2000);
  const yearFrom = intOrNull(body.yearFrom);
  const budgetMax = decimalOrNull(body.budgetMax);
  await captureLead({
    leadType: 'BUY',
    source: 'WEBSITE_FORM',
    body,
    message: notes || 'Posted a machine requirement on the website.',
    fields: {
      ...catalogFields(body),
      yearFrom,
      yearTo: intOrNull(body.yearTo),
      budgetMin: decimalOrNull(body.budgetMin),
      budgetMax,
      requirementState: textOrNull(body.state, 80),
      requirementCity: textOrNull(body.city, 80),
      requirementNotes: notes,
      matchAlertsEnabled: true,
    },
  });
  return { ok: true };
};

/** "Sell your machine" → SELL lead with the machine details in the requirement fields. */
export const submitSellMachine = async (body: Record<string, unknown>) => {
  await requireFormsOn();
  assertHuman(body);
  const year = intOrNull(body.year);
  if (year !== null && (year < 1980 || year > new Date().getFullYear() + 1)) throw badRequest('Enter a valid manufacturing year.');
  const hours = intOrNull(body.operatingHours);
  const details = [
    textOrNull(body.registrationNumber, 20) ? `Reg. no: ${textOrNull(body.registrationNumber, 20)}` : null,
    year ? `Year: ${year}` : null,
    hours ? `Hours run: ${hours}` : null,
    textOrNull(body.message, 2000),
  ].filter(Boolean).join('\n');
  await captureLead({
    leadType: 'SELL',
    source: 'WEBSITE_FORM',
    body,
    message: details || 'Wants to sell a machine.',
    fields: {
      ...catalogFields(body),
      yearFrom: year,
      yearTo: year,
      expectedValue: decimalOrNull(body.expectedPrice),
      requirementState: textOrNull(body.state, 80),
      requirementCity: textOrNull(body.city, 80),
      requirementNotes: details || null,
    },
  });
  return { ok: true };
};

/** Categories + brands for the website forms (models come from /master/models/:brandId). */
export const publicCatalog = async () => {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({ where: { partnerProfileId: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.brand.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return { categories: categories.filter((c) => c.name.trim().toLowerCase() !== 'uncategorized'), brands };
};

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Lead-capture API for IndiaMART / Facebook / partner sites (X-CRM-Key header). */
export const webhookLead = async (key: string | undefined, body: Record<string, unknown>) => {
  const config = await getCrmConfig();
  if (!config.webhook.enabled || !config.webhook.keyHash) throw new CrmHttpError(503, 'Lead capture API is off.');
  const given = Buffer.from(hashKey(key || ''), 'hex');
  const stored = Buffer.from(config.webhook.keyHash, 'hex');
  if (!key || given.length !== stored.length || !timingSafeEqual(given, stored)) throw new CrmHttpError(401, 'Invalid API key.');
  if (!normalizeMobile(body.mobile)) throw badRequest('mobile is required (10-digit Indian number).');
  const source = (textOrNull(body.source, 40) || 'API').toUpperCase();
  const leadType = oneOf(LEAD_TYPES, body.leadType) ?? 'BUY';
  const result = await captureLead({
    leadType,
    source,
    body,
    message: textOrNull(body.message, 2000) || `Lead received via ${source}.`,
    fields: {
      ...catalogFields(body),
      budgetMax: decimalOrNull(body.budgetMax),
      requirementState: textOrNull(body.state, 80),
      requirementCity: textOrNull(body.city, 80),
      requirementNotes: textOrNull(body.message, 2000),
    },
  });
  return { ok: true, leadId: result.id, repeat: result.repeat };
};

/** Generates a new webhook key; the plain key is shown once. */
export const rotateWebhookKey = async (access: CrmAccess, enabled: boolean) => {
  if (!access.canSettings) throw forbidden();
  const key = `crm_${randomBytes(24).toString('hex')}`;
  await saveWebhookKey(hashKey(key), `…${key.slice(-4)}`, enabled, access.userId);
  return { key, enabled };
};

export const setWebhookEnabled = async (access: CrmAccess, enabled: boolean) => {
  if (!access.canSettings) throw forbidden();
  const config = await getCrmConfig();
  if (enabled && !config.webhook.keyHash) throw badRequest('Generate an API key first.');
  await saveWebhookKey(config.webhook.keyHash, config.webhook.keyHint, enabled, access.userId);
  return { enabled };
};
