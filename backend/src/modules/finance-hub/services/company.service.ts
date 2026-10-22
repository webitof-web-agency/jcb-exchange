import { FinGstRegistrationType } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { getAppSettings, type CompanyInvoiceSettings } from '../../../utils/appSettings';
import { badRequest, notFound } from '../http';
import {
  GST_STATE_CODES,
  isValidGstin,
  isValidPan,
  isValidPinCode,
  isValidTan,
  normalizeGstin,
  normalizeIdentifier,
  panFromGstin,
  stateCodeForName,
} from '../utils/india';
import { onlyProvided, readBoolean, readEnum, readMultiline, readString } from '../utils/input';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';

const PROFILE_ID = 'default';

export const COMPANY_CONSTITUTIONS = [
  'PROPRIETORSHIP',
  'PARTNERSHIP',
  'LLP',
  'PRIVATE_LIMITED',
  'PUBLIC_LIMITED',
  'OPC',
  'HUF',
  'TRUST',
  'OTHER',
] as const;

type ProfileInput = {
  legalName: string;
  tradeName: string | null;
  pan: string | null;
  tan: string | null;
  cin: string | null;
  msmeUdyam: string | null;
  constitution: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pinCode: string | null;
  email: string | null;
  phone: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
};

const identifier = (body: Record<string, unknown>, key: string, label: string, valid: (value: string) => boolean) => {
  if (body[key] === undefined || body[key] === null || body[key] === '') return null;
  const value = normalizeIdentifier(body[key]);
  if (!valid(value)) throw badRequest(`${label} is not valid.`);
  return value;
};

/** Validates the full company profile form (all fields are sent by the page). */
export const buildCompanyProfileInput = (body: Record<string, unknown>): ProfileInput => {
  const state = readString(body, 'state', 'State', { max: 80 });
  const stateCode = body.stateCode ? String(body.stateCode).padStart(2, '0') : stateCodeForName(state);
  if (stateCode && !GST_STATE_CODES[stateCode]) throw badRequest('State code is not a valid GST state code.');

  const email = readString(body, 'email', 'Email', { max: 160 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Email is not valid.');
  const pinCode = readString(body, 'pinCode', 'PIN code', { max: 6 });
  if (pinCode && !isValidPinCode(pinCode)) throw badRequest('PIN code must be 6 digits.');
  const phone = readString(body, 'phone', 'Phone', { max: 20 });
  const phoneDigits = phone ? phone.replace(/\D/g, '') : null;
  if (phoneDigits && (phoneDigits.length < 8 || phoneDigits.length > 15)) throw badRequest('Phone number is not valid.');

  return {
    legalName: readString(body, 'legalName', 'Legal name', { max: 200, required: true }) as string,
    tradeName: readString(body, 'tradeName', 'Trade name', { max: 200 }),
    pan: identifier(body, 'pan', 'PAN', isValidPan),
    tan: identifier(body, 'tan', 'TAN', isValidTan),
    cin: identifier(body, 'cin', 'CIN / LLPIN', (value) => /^([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}|[A-Z]{3}-?[0-9]{4})$/.test(value)),
    msmeUdyam: readString(body, 'msmeUdyam', 'Udyam registration', { max: 30 })?.toUpperCase() ?? null,
    constitution: body.constitution ? readEnum(body, 'constitution', 'Constitution', COMPANY_CONSTITUTIONS) : null,
    address: readMultiline(body, 'address', 'Address', 500),
    city: readString(body, 'city', 'City', { max: 80 }),
    state,
    stateCode,
    pinCode,
    email,
    phone: phoneDigits,
    signatoryName: readString(body, 'signatoryName', 'Signatory name', { max: 120 }),
    signatoryDesignation: readString(body, 'signatoryDesignation', 'Signatory designation', { max: 80 }),
  };
};

const profileFromInvoiceSettings = (invoice: CompanyInvoiceSettings) => {
  const gstin = invoice.gstin && isValidGstin(invoice.gstin) ? invoice.gstin : null;
  const stateCode = gstin ? gstin.slice(0, 2) : stateCodeForName(invoice.state);
  return {
    legalName: invoice.companyName || 'JCB Exchange',
    address: invoice.address,
    city: invoice.city,
    state: invoice.state || (stateCode ? GST_STATE_CODES[stateCode] ?? null : null),
    stateCode,
    pan: gstin ? panFromGstin(gstin) : null,
    gstin,
  };
};

export const getCompanyProfile = async () => {
  const [profile, registrations] = await Promise.all([
    prisma.finCompanyProfile.findUnique({ where: { id: PROFILE_ID } }),
    prisma.finGstRegistration.findMany({ orderBy: [{ isDefault: 'desc' }, { gstin: 'asc' }] }),
  ]);
  if (profile) return { profile, registrations, persisted: true };

  const draft = profileFromInvoiceSettings((await getAppSettings()).companyInvoice);
  const { gstin, ...fields } = draft;
  return { profile: { id: PROFILE_ID, ...fields }, registrations, persisted: false, suggestedGstin: gstin };
};

export const saveCompanyProfile = async (body: Record<string, unknown>, context: ActorContext) => {
  const input = buildCompanyProfileInput(body);
  return prisma.$transaction(async (tx) => {
    const before = await tx.finCompanyProfile.findUnique({ where: { id: PROFILE_ID } });
    const profile = await tx.finCompanyProfile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, ...input, updatedById: context.actorUserId },
      update: { ...input, updatedById: context.actorUserId },
    });
    await writeFinAudit({ ...context, entityType: 'FinCompanyProfile', entityId: PROFILE_ID, action: before ? 'UPDATE' : 'CREATE', before, after: profile }, tx);
    return profile;
  });
};

/** Copies name/address/state and the GSTIN from Settings → Company invoice settings. */
export const syncCompanyFromInvoiceSettings = async (context: ActorContext) => {
  const draft = profileFromInvoiceSettings((await getAppSettings()).companyInvoice);
  const { gstin, ...fields } = draft;

  return prisma.$transaction(async (tx) => {
    const before = await tx.finCompanyProfile.findUnique({ where: { id: PROFILE_ID } });
    const profile = await tx.finCompanyProfile.upsert({
      where: { id: PROFILE_ID },
      create: { id: PROFILE_ID, ...fields, updatedById: context.actorUserId },
      update: {
        legalName: fields.legalName,
        address: fields.address,
        city: fields.city,
        state: fields.state,
        stateCode: fields.stateCode,
        ...(before?.pan ? {} : { pan: fields.pan }),
        updatedById: context.actorUserId,
      },
    });

    let registrationCreated = false;
    if (gstin && !(await tx.finGstRegistration.findUnique({ where: { gstin } }))) {
      const hasDefault = Boolean(await tx.finGstRegistration.findFirst({ where: { isDefault: true } }));
      const stateCode = gstin.slice(0, 2);
      await tx.finGstRegistration.create({
        data: { gstin, stateCode, stateName: GST_STATE_CODES[stateCode] || stateCode, isDefault: !hasDefault },
      });
      registrationCreated = true;
    }

    await writeFinAudit({ ...context, entityType: 'FinCompanyProfile', entityId: PROFILE_ID, action: 'SYNC_INVOICE_SETTINGS', before, after: { profile, gstin, registrationCreated } }, tx);
    return { profile, registrationCreated };
  });
};

const buildRegistrationInput = (body: Record<string, unknown>, isCreate: boolean) => {
  const values: Record<string, unknown> = {
    registrationType: readEnum(body, 'registrationType', 'Registration type', ['REGULAR', 'COMPOSITION'] as const, 'REGULAR') as FinGstRegistrationType,
    isDefault: readBoolean(body, 'isDefault', false),
    marginSchemeEnabled: readBoolean(body, 'marginSchemeEnabled', true),
    einvoiceApplicable: readBoolean(body, 'einvoiceApplicable', false),
    isActive: readBoolean(body, 'isActive', true),
  };
  if (isCreate) {
    const gstin = normalizeGstin(body.gstin);
    if (!isValidGstin(gstin)) throw badRequest('GSTIN is not valid. Check the 15 characters and the check digit.');
    const stateCode = gstin.slice(0, 2);
    Object.assign(values, { gstin, stateCode, stateName: GST_STATE_CODES[stateCode] });
    return values;
  }
  return onlyProvided(body, values);
};

export const createGstRegistration = async (body: Record<string, unknown>, context: ActorContext) => {
  const data = buildRegistrationInput(body, true) as {
    gstin: string; stateCode: string; stateName: string; registrationType: FinGstRegistrationType;
    isDefault: boolean; marginSchemeEnabled: boolean; einvoiceApplicable: boolean; isActive: boolean;
  };
  return prisma.$transaction(async (tx) => {
    const hasDefault = Boolean(await tx.finGstRegistration.findFirst({ where: { isDefault: true } }));
    const isDefault = data.isDefault || !hasDefault;
    if (isDefault) await tx.finGstRegistration.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const registration = await tx.finGstRegistration.create({ data: { ...data, isDefault } });
    await writeFinAudit({ ...context, entityType: 'FinGstRegistration', entityId: registration.id, action: 'CREATE', after: registration }, tx);
    return registration;
  });
};

export const updateGstRegistration = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const data = buildRegistrationInput(body, false) as Partial<{ isDefault: boolean; isActive: boolean }>;
  return prisma.$transaction(async (tx) => {
    const before = await tx.finGstRegistration.findUnique({ where: { id } });
    if (!before) throw notFound('GST registration not found.');
    if (before.isDefault && data.isDefault === false) throw badRequest('Mark another GSTIN as default instead.');
    if (before.isDefault && data.isActive === false) throw badRequest('The default GSTIN cannot be deactivated.');
    if (data.isDefault) await tx.finGstRegistration.updateMany({ where: { isDefault: true, NOT: { id } }, data: { isDefault: false } });
    const registration = await tx.finGstRegistration.update({ where: { id }, data });
    await writeFinAudit({ ...context, entityType: 'FinGstRegistration', entityId: id, action: 'UPDATE', before, after: registration }, tx);
    return registration;
  });
};
