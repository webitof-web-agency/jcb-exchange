import crypto from 'crypto';
import { createVerificationFingerprint } from './verificationCache';
import { normalizeChassisNumber } from './chassisToRcVerification.validation';
import { normalizeRcNumber } from './rcOwnerHistory.validation';

export type ListingVerificationSource = 'CHASSIS' | 'RC_FULL';

export type ListingVerificationStatus =
  | 'NOT_VERIFIED'
  | 'API_VERIFIED'
  | 'MANUALLY_MODIFIED'
  | 'REVERIFICATION_REQUIRED';

export type ListingVerificationSnapshot = Record<string, string>;

type VerificationRecord = {
  id?: string;
  status?: unknown;
  requestedById?: unknown;
  requestFingerprint?: unknown;
};

export const buildRcFullVerificationFingerprint = (registrationNumber: unknown) =>
  createVerificationFingerprint('RC_FULL', {
    id_number: normalizeRcNumber(registrationNumber),
  });

export const resolveListingRegistrationNumber = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeRcNumber(value).replace(/[/-]+/g, '');
    if (normalized) return normalized;
  }
  return '';
};

export const chooseVerificationRecordForIdentity = ({
  source,
  identity,
  preferredRecord,
  fallbackRecord,
}: {
  source: ListingVerificationSource;
  identity: unknown;
  preferredRecord: VerificationRecord | null | undefined;
  fallbackRecord: VerificationRecord | null | undefined;
}) => {
  const expectedFingerprint = source === 'RC_FULL'
    ? buildRcFullVerificationFingerprint(identity)
    : buildChassisVerificationFingerprint(identity);
  const matchesCurrentIdentity = (record: VerificationRecord | null | undefined) => Boolean(
    record
    && record.status === 'SUCCESS'
    && record.requestFingerprint === expectedFingerprint,
  );

  if (matchesCurrentIdentity(preferredRecord)) return preferredRecord;
  if (matchesCurrentIdentity(fallbackRecord)) return fallbackRecord;
  return null;
};

export const getVehicleVerificationIdentityMismatch = (
  source: ListingVerificationSource,
  requestedRegistrationNumber: unknown,
  requestedChassisNumber: unknown,
  providerSnapshot: Partial<Pick<ListingVerificationSnapshot, 'registrationNumber' | 'chassisNumber'>>,
) => {
  const requestedRegistration = normalizeRcNumber(requestedRegistrationNumber).replace(/[/-]+/g, '');
  const returnedRegistration = normalizeRcNumber(providerSnapshot.registrationNumber).replace(/[/-]+/g, '');
  const requestedChassis = normalizeChassisNumber(requestedChassisNumber);
  const returnedChassis = normalizeChassisNumber(providerSnapshot.chassisNumber);

  if (source === 'RC_FULL' && requestedRegistration && returnedRegistration && requestedRegistration !== returnedRegistration) {
    return 'The verified registration number does not match the entered registration number.';
  }
  if (requestedChassis && returnedChassis && requestedChassis !== returnedChassis) {
    return 'The verified chassis number does not match the entered chassis number.';
  }
  if (source === 'CHASSIS' && requestedRegistration && returnedRegistration && requestedRegistration !== returnedRegistration) {
    return 'The verified registration number does not match the entered registration number.';
  }
  return null;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim());
const firstText = (...values: unknown[]) => values.map(text).find(Boolean) || '';
const normalizedValue = (value: unknown) => text(value).toLowerCase().replace(/\s+/g, ' ').trim();

const yearFrom = (value: unknown) => {
  const candidate = text(value);
  const match = /^(\d{4})/.exec(candidate) || /(\d{4})$/.exec(candidate);
  return match?.[1] || '';
};

const validDate = (value: unknown) => {
  const raw = (text(value).split('T')[0] || '').trim().replace(/,/g, ' ');
  if (!raw) return '';
  const tokens = raw.replace(/[/.]/g, '-').replace(/\s+/g, '-').split('-').filter(Boolean);
  const months: Record<string, number> = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
  const numeric = (token: string) => /^\d+$/.test(token) ? Number(token) : 0;
  let year = 0;
  let month = 0;
  let day = 0;
  if (tokens.length === 3) {
    const monthToken = tokens[1]!.toLowerCase();
    if (/^\d{4}$/.test(tokens[0]!) && (numeric(tokens[1]!) || months[monthToken])) {
      year = numeric(tokens[0]!); month = numeric(tokens[1]!) || months[monthToken]!; day = numeric(tokens[2]!);
    } else if (/^\d{4}$/.test(tokens[2]!) && (numeric(tokens[1]!) || months[monthToken])) {
      day = numeric(tokens[0]!); month = numeric(tokens[1]!) || months[monthToken]!; year = numeric(tokens[2]!);
    }
  }
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    : '';
};

const validityStatus = (value: string) => {
  if (!value) return 'NOT_AVAILABLE';
  const [yearText = '0', monthText = '0', dayText = '0'] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const expiry = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry.getTime() >= today.getTime() ? 'VALID' : 'EXPIRED';
};

const descriptionFields = (description: unknown) => {
  const fields: Record<string, string> = {};
  for (const line of text(description).split(/\r?\n/)) {
    const match = line.trim().match(/^([^:]+):\s*(.+)$/);
    const key = match?.[1];
    const value = match?.[2];
    if (key && value) fields[key.trim().toLowerCase()] = value.trim();
  }
  return fields;
};

const emptyValue = (value: unknown) => text(value);

const getProviderDate = (result: Record<string, unknown>, ...keys: string[]) =>
  validDate(keys.map((key) => result[key]).find((value) => text(value)));

const getProviderData = (result: Record<string, unknown>) => {
  const nested = result.details;
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? { ...(nested as Record<string, unknown>), ...result }
    : result;
};

export const buildProviderListingVerificationSnapshot = (input: Record<string, unknown>): ListingVerificationSnapshot => {
  const result = getProviderData(input);
  const insuranceExpiry = getProviderDate(result, 'insuranceUpto', 'insurance_upto');
  const fitnessValidUntil = getProviderDate(result, 'fitUpTo', 'fit_up_to');
  const taxValidUntil = getProviderDate(result, 'taxUpto', 'tax_upto') || getProviderDate(result, 'taxPaidUpto', 'tax_paid_upto');
  const pucValidUntil = getProviderDate(result, 'puccUpto', 'pucc_upto', 'puccValidUpto', 'pucc_valid_upto', 'puccExpiryDate', 'pucc_expiry_date', 'puccValidUntil', 'pucc_valid_until', 'pucUpto', 'puc_upto', 'pucValidUpto', 'puc_valid_upto', 'pucExpiryDate', 'puc_expiry_date', 'pucValidUntil', 'puc_valid_until', 'pollutionUpto', 'pollution_upto', 'pollutionValidUpto', 'pollution_valid_upto', 'pollutionExpiryDate', 'pollution_expiry_date', 'pollutionValidUntil', 'pollution_valid_until');
  const brandName = firstText(result.makerDescription, result.maker_description);
  const modelName = firstText(result.makerModel, result.maker_model);
  const chassisNumber = firstText(result.vehicleChasiNumber, result.vehicle_chasi_number);
  const financerName = firstText(result.financer, result.financier, result.financerName, result.financer_name);
  const hsrpNumber = firstText(result.hsrpNumber, result.hsrp_number, result.hsrpNo, result.hsrp_no, typeof result.hsrp === 'string' ? result.hsrp : '');

  return {
    vehicleName: [brandName, modelName].filter(Boolean).join(' '),
    categoryName: firstText(result.vehicleCategoryDescription, result.vehicle_category_description, result.vehicleCategory, result.vehicle_category),
    brandName,
    modelName,
    variant: firstText(result.variant),
    manufacturingYear: yearFrom(firstText(result.manufacturingDateFormatted, result.manufacturing_date_formatted, result.manufacturingDate, result.manufacturing_date)),
    registrationYear: yearFrom(firstText(result.registrationDate, result.registration_date)),
    registrationNumber: firstText(result.rcNumber, result.rc_number),
    chassisNumber,
    engineNumber: firstText(result.vehicleEngineNumber, result.vehicle_engine_number),
    previousOwners: firstText(result.ownerNumber, result.owner_number),
    fuelType: firstText(result.fuelType, result.fuel_type),
    insuranceExpiry,
    fitnessValidUntil,
    taxValidUntil,
    pucValidUntil,
    rtoOffice: firstText(result.registeredAt, result.registered_at),
    hirePurchaseStatus: result.financed === true ? 'ACTIVE' : result.financed === false ? 'NOT_APPLICABLE' : 'PENDING',
    financerName,
    hsrpNumber,
    taxStatus: validityStatus(taxValidUntil),
    fitnessStatus: validityStatus(fitnessValidUntil),
    insuranceStatus: validityStatus(insuranceExpiry),
    pucStatus: validityStatus(pucValidUntil),
  };
};

export const buildCurrentListingVerificationSnapshot = (input: {
  title?: unknown;
  categoryName?: unknown;
  brandName?: unknown;
  modelName?: unknown;
  variant?: unknown;
  manufacturingYear?: unknown;
  engineNumber?: unknown;
  description?: unknown;
  chassisOrSerialNo?: unknown;
  rtoDetails?: Record<string, unknown> | null;
}): ListingVerificationSnapshot => {
  const details = input.rtoDetails || {};
  const parsed = descriptionFields(input.description);
  const insuranceExpiry = firstText(details.insuranceValidUntil, details.insuranceExpiry, parsed['insurance expiry']);

  return {
    vehicleName: emptyValue(input.title),
    categoryName: emptyValue(input.categoryName),
    brandName: emptyValue(input.brandName),
    modelName: emptyValue(input.modelName),
    variant: firstText(input.variant, parsed.variant),
    manufacturingYear: yearFrom(input.manufacturingYear),
    registrationYear: yearFrom(parsed['registration year']),
    registrationNumber: firstText(details.registrationNo, parsed['registration no']),
    chassisNumber: firstText(input.chassisOrSerialNo, parsed['chassis/serial'], parsed['chassis / serial'], parsed['chassis or serial']),
    engineNumber: firstText(input.engineNumber, parsed['engine number'], parsed['engine no']),
    previousOwners: firstText(parsed.owners),
    fuelType: firstText(parsed.fuel),
    insuranceExpiry: validDate(insuranceExpiry),
    fitnessValidUntil: validDate(details.fitnessValidUntil),
    taxValidUntil: validDate(details.taxValidUntil),
    pucValidUntil: validDate(details.pucValidUntil),
    rtoOffice: emptyValue(details.rtoOffice),
    hirePurchaseStatus: emptyValue(details.hirePurchaseStatus),
    financerName: emptyValue(details.financerName),
    hsrpNumber: emptyValue(details.hsrpNumber),
    taxStatus: emptyValue(details.taxStatus),
    fitnessStatus: emptyValue(details.fitnessStatus),
    insuranceStatus: emptyValue(details.insuranceStatus),
    pucStatus: emptyValue(details.pucStatus),
  };
};

export const getListingVerificationStatus = (
  providerSnapshot: ListingVerificationSnapshot | null | undefined,
  currentSnapshot: ListingVerificationSnapshot,
) => {
  if (!providerSnapshot) {
    return { status: 'NOT_VERIFIED' as const, changedFields: [] as string[] };
  }

  const changedFields = Object.keys(providerSnapshot).filter((field) =>
    normalizedValue(providerSnapshot[field]) !== normalizedValue(currentSnapshot[field]),
  );
  const identityChanged = changedFields.includes('chassisNumber') || changedFields.includes('engineNumber');

  return {
    status: identityChanged
      ? 'REVERIFICATION_REQUIRED' as const
      : changedFields.length
        ? 'MANUALLY_MODIFIED' as const
        : 'API_VERIFIED' as const,
    changedFields,
  };
};

export const hashListingVerificationSnapshot = (snapshot: ListingVerificationSnapshot) =>
  Object.fromEntries(
    Object.entries(snapshot).map(([field, value]) => [
      field,
      crypto.createHash('sha256').update(normalizedValue(value)).digest('hex'),
    ]),
  );

export const syncListingVehicleVerification = async (
  client: any,
  input: {
    listingId: string;
    actorUserId?: string;
    verificationRecordId?: string | null;
    verificationSource?: ListingVerificationSource | null;
    providerSnapshot?: ListingVerificationSnapshot | null;
    currentSnapshot: ListingVerificationSnapshot;
  },
) => {
  const assessment = getListingVerificationStatus(input.providerSnapshot, input.currentSnapshot);
  const providerSnapshot = input.providerSnapshot || null;
  const now = new Date();
  const previous = await client.listingVehicleVerification.findUnique({
    where: { listingId: input.listingId },
    select: { status: true, changedFields: true, verificationRecordId: true, verificationSource: true },
  });

  const verification = await client.listingVehicleVerification.upsert({
    where: { listingId: input.listingId },
    create: {
      listingId: input.listingId,
      verificationRecordId: input.verificationRecordId || null,
      verificationSource: input.verificationSource || null,
      status: assessment.status,
      verifiedRegistrationNumber: providerSnapshot?.registrationNumber || null,
      verifiedChassisNumber: providerSnapshot?.chassisNumber || null,
      verifiedEngineNumber: providerSnapshot?.engineNumber || null,
      verifiedFieldHashes: providerSnapshot ? hashListingVerificationSnapshot(providerSnapshot) : null,
      changedFields: assessment.changedFields,
      lastVerifiedAt: providerSnapshot ? now : null,
      lastModifiedAt: assessment.status === 'API_VERIFIED' ? null : now,
    },
    update: {
      // The absence of a provider snapshot is meaningful. It means the current
      // identity is no longer backed by the previous verification, so do not
      // retain an old record/source that could be reused on the next edit.
      verificationRecordId: input.verificationRecordId || null,
      verificationSource: input.verificationSource || null,
      status: assessment.status,
      ...(providerSnapshot
        ? {
            verifiedRegistrationNumber: providerSnapshot.registrationNumber || null,
            verifiedChassisNumber: providerSnapshot.chassisNumber || null,
            verifiedEngineNumber: providerSnapshot.engineNumber || null,
            verifiedFieldHashes: hashListingVerificationSnapshot(providerSnapshot),
            lastVerifiedAt: now,
          }
        : {}),
      changedFields: assessment.changedFields,
      lastModifiedAt: assessment.status === 'API_VERIFIED' ? null : now,
    },
  });

  if (input.actorUserId && client.auditLog?.create) {
    const previousStatus = previous?.status || 'NOT_VERIFIED';
    const previousChangedFields = Array.isArray(previous?.changedFields) ? previous.changedFields : [];
    const changed = previousStatus !== assessment.status
      || JSON.stringify(previousChangedFields) !== JSON.stringify(assessment.changedFields)
      || previous?.verificationRecordId !== (input.verificationRecordId || null)
      || previous?.verificationSource !== (input.verificationSource || null);

    if (changed) {
      await client.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          entityType: 'LISTING_VERIFICATION',
          entityId: input.listingId,
          action: 'LISTING_VEHICLE_VERIFICATION_UPDATED',
          beforeJson: previous
            ? { status: previousStatus, changedFields: previousChangedFields }
            : null,
          afterJson: {
            status: assessment.status,
            changedFields: assessment.changedFields,
            verificationRecordId: input.verificationRecordId || null,
            ...(input.verificationSource
              ? { verificationSource: input.verificationSource }
              : {}),
          },
        },
      });
    }
  }

  return verification;
};

export const buildChassisVerificationFingerprint = (chassisNumber: unknown) =>
  createVerificationFingerprint('CHASSIS_TO_RC', {
    chassis_number: normalizeChassisNumber(chassisNumber),
  });

export const isUsableChassisVerification = (
  record: {
    status?: unknown;
    requestedById?: unknown;
    requestFingerprint?: unknown;
  } | null | undefined,
  chassisNumber: unknown,
  requestedById: string,
) => Boolean(
  record
  && record.status === 'SUCCESS'
  && record.requestedById === requestedById
  && record.requestFingerprint === buildChassisVerificationFingerprint(chassisNumber),
);

export const isUsableRcFullVerification = (
  record: {
    status?: unknown;
    requestedById?: unknown;
    requestFingerprint?: unknown;
  } | null | undefined,
  registrationNumber: unknown,
  requestedById: string,
) => Boolean(
  record
  && record.status === 'SUCCESS'
  && record.requestedById === requestedById
  && record.requestFingerprint === buildRcFullVerificationFingerprint(registrationNumber),
);
