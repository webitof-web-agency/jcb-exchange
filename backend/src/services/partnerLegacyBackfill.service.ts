import prisma from '../lib/prisma';
import { findAvailablePartnerCode } from '../utils/partnerCode';
import {
  resolveLegacyPartnerLocation,
  type LegacyCityLocation,
  type LegacyPartnerLocationInput,
  type LegacyStateLocation,
} from '../utils/partnerLegacyLocation';

type PartnerLegacyBackfillDb = Pick<typeof prisma, 'country' | 'state' | 'city' | 'partnerProfile'>;

type LegacyGstProof = {
  id: string;
  status: string;
  completedAt: Date | null;
} | null;

type LegacyPartnerProfileRow = {
  id: string;
  userId: string;
  partnerCode: string | null;
  ownerName: string | null;
  businessName: string | null;
  countryId: number | null;
  stateId: number | null;
  cityId: number | null;
  district: string | null;
  gstNumber: string | null;
  gstVerificationRecordId: string | null;
  gstVerifiedAt: Date | null;
  gstVerificationRecord: LegacyGstProof;
  user: { name: string | null; state: string | null; city: string | null };
};

export type PartnerLegacyIssue = {
  profileId: string;
  userId: string;
  partnerCode: string | null;
  dealerName: string | null;
  legacyState: string | null;
  legacyCity: string | null;
  reason: string;
};

export type PartnerLegacyBackfillOptions = {
  dryRun?: boolean;
};

export type PartnerLegacyBackfillReport = {
  dryRun: boolean;
  catalogAvailable: boolean;
  partnersScanned: number;
  partnersUpdated: number;
  locationsBackfilled: number;
  partnerCodesBackfilled: number;
  gstLinksCreated: number;
  gstVerificationCleared: number;
  missingStateCount: number;
  missingCityCount: number;
  missingState: PartnerLegacyIssue[];
  missingCity: PartnerLegacyIssue[];
  gstProof: {
    gstNumbersPresent: number;
    verifiedWithProof: number;
    unverifiedWithoutProof: number;
    invalidProofLinks: number;
  };
  skippedByReason: Record<string, number>;
};

const emptyReport = (dryRun: boolean): PartnerLegacyBackfillReport => ({
  dryRun,
  catalogAvailable: false,
  partnersScanned: 0,
  partnersUpdated: 0,
  locationsBackfilled: 0,
  partnerCodesBackfilled: 0,
  gstLinksCreated: 0,
  gstVerificationCleared: 0,
  missingStateCount: 0,
  missingCityCount: 0,
  missingState: [],
  missingCity: [],
  gstProof: {
    gstNumbersPresent: 0,
    verifiedWithProof: 0,
    unverifiedWithoutProof: 0,
    invalidProofLinks: 0,
  },
  skippedByReason: {},
});

const increment = (report: PartnerLegacyBackfillReport, reason: string) => {
  report.skippedByReason[reason] = (report.skippedByReason[reason] || 0) + 1;
};

const locationInputFor = (partner: LegacyPartnerProfileRow): LegacyPartnerLocationInput => ({
  countryId: partner.countryId,
  stateId: partner.stateId,
  cityId: partner.cityId,
  userState: partner.user.state,
  userCity: partner.user.city,
  district: partner.district,
});

const issueFor = (partner: LegacyPartnerProfileRow, reason: string): PartnerLegacyIssue => ({
  profileId: partner.id,
  userId: partner.userId,
  partnerCode: partner.partnerCode,
  dealerName: partner.businessName || partner.ownerName || partner.user.name,
  legacyState: partner.user.state,
  legacyCity: partner.user.city || partner.district,
  reason,
});

const hasText = (value: string | null | undefined) => Boolean(value?.trim());

const hasTrustedGstProof = (partner: LegacyPartnerProfileRow) => (
  hasText(partner.gstNumber)
  && partner.gstVerificationRecordId === partner.gstVerificationRecord?.id
  && partner.gstVerificationRecord?.status === 'SUCCESS'
  && partner.gstVerificationRecord.completedAt instanceof Date
);

const gstChangesFor = (partner: LegacyPartnerProfileRow, report: PartnerLegacyBackfillReport) => {
  const data: Record<string, Date | null> = {};
  const proof = hasTrustedGstProof(partner);
  const hasLegacyVerification = Boolean(partner.gstVerificationRecordId || partner.gstVerifiedAt);

  if (hasText(partner.gstNumber)) report.gstProof.gstNumbersPresent += 1;

  if (proof) {
    report.gstProof.verifiedWithProof += 1;
    if (!partner.gstVerifiedAt && partner.gstVerificationRecord?.completedAt) {
      data.gstVerifiedAt = partner.gstVerificationRecord.completedAt;
    }
    return data;
  }

  if (hasText(partner.gstNumber)) report.gstProof.unverifiedWithoutProof += 1;
  if (hasLegacyVerification) {
    report.gstProof.invalidProofLinks += 1;
    data.gstVerificationRecordId = null;
    data.gstVerifiedAt = null;
    report.gstVerificationCleared += 1;
  }
  return data;
};

const addLocationIssues = (
  report: PartnerLegacyBackfillReport,
  partner: LegacyPartnerProfileRow,
  status: string,
) => {
  const stateMissing = [
    'MISSING_STATE',
    'STATE_NOT_FOUND',
    'STATE_ID_NOT_FOUND',
    'AMBIGUOUS_STATE',
    'COUNTRY_NOT_SUPPORTED',
  ].includes(status);
  const cityMissing = [
    'MISSING_CITY',
    'CITY_NOT_FOUND',
    'CITY_ID_NOT_FOUND',
    'AMBIGUOUS_CITY',
    'CITY_STATE_MISMATCH',
  ].includes(status);

  if (stateMissing) {
    report.missingState.push(issueFor(partner, status));
    report.missingStateCount += 1;
    report.missingCity.push(issueFor(partner, `CITY_NOT_RESOLVED_${status}`));
    report.missingCityCount += 1;
  } else if (cityMissing) {
    report.missingCity.push(issueFor(partner, status));
    report.missingCityCount += 1;
  }
};

const partnerProfileSelect = {
  id: true,
  userId: true,
  partnerCode: true,
  ownerName: true,
  businessName: true,
  countryId: true,
  stateId: true,
  cityId: true,
  district: true,
  gstNumber: true,
  gstVerificationRecordId: true,
  gstVerifiedAt: true,
  gstVerificationRecord: { select: { id: true, status: true, completedAt: true } },
  user: { select: { name: true, state: true, city: true } },
} as const;

const readPartnerCatalog = async (db: PartnerLegacyBackfillDb) => {
  const india = await db.country.findFirst({
    where: {
      OR: [
        { iso2: { equals: 'IN', mode: 'insensitive' } },
        { name: { equals: 'India', mode: 'insensitive' } },
      ],
    },
    select: { id: true },
  });
  if (!india) return null;

  const [states, cities] = await Promise.all([
    db.state.findMany({
      where: { countryId: india.id },
      select: { id: true, name: true, stateCode: true, countryId: true },
      orderBy: { id: 'asc' },
    }),
    db.city.findMany({
      where: { countryId: india.id },
      select: { id: true, name: true, stateId: true, countryId: true },
      orderBy: { id: 'asc' },
    }),
  ]);
  return { india, states, cities };
};

export const backfillLegacyPartnerProfiles = async (
  db: PartnerLegacyBackfillDb = prisma,
  options: PartnerLegacyBackfillOptions = {},
): Promise<PartnerLegacyBackfillReport> => {
  const dryRun = options.dryRun === true;
  const report = emptyReport(dryRun);
  const catalog = await readPartnerCatalog(db);

  if (!catalog) {
    increment(report, 'LOCATION_CATALOG_UNAVAILABLE');
    return report;
  }

  const partners = await db.partnerProfile.findMany({
    where: { user: { role: 'PARTNER' } },
    select: partnerProfileSelect,
    orderBy: { id: 'asc' },
  }) as LegacyPartnerProfileRow[];

  report.catalogAvailable = true;
  report.partnersScanned = partners.length;
  const reservedCodes = new Set<string>();

  for (const partner of partners) {
    const resolvedLocation = resolveLegacyPartnerLocation(locationInputFor(partner), {
      countryId: catalog.india.id,
      states: catalog.states as LegacyStateLocation[],
      cities: catalog.cities as LegacyCityLocation[],
    });
    const data: Record<string, number | string | null | Date> = {};

    if (resolvedLocation.status !== 'RESOLVED') {
      addLocationIssues(report, partner, resolvedLocation.status);
      increment(report, `LOCATION_${resolvedLocation.status}`);
    } else {
      if (partner.countryId === null) data.countryId = resolvedLocation.countryId;
      if (partner.stateId === null) data.stateId = resolvedLocation.stateId;
      if (partner.cityId === null) data.cityId = resolvedLocation.cityId;
      if (['countryId', 'stateId', 'cityId'].some((key) => key in data)) report.locationsBackfilled += 1;

      if (!hasText(partner.partnerCode)) {
        const dealerName = partner.businessName || partner.ownerName || partner.user.name;
        if (!hasText(dealerName)) {
          increment(report, 'MISSING_DEALER_NAME');
        } else {
          const partnerCode = await findAvailablePartnerCode(
            {
              stateCode: resolvedLocation.stateCode,
              stateName: resolvedLocation.stateName,
              cityName: resolvedLocation.cityName,
              dealerName,
            },
            {
              findUnique: async ({ where }) => {
                if (reservedCodes.has(where.partnerCode)) return { id: 'reserved-in-this-run' };
                return db.partnerProfile.findUnique({ where });
              },
            },
          );
          reservedCodes.add(partnerCode);
          data.partnerCode = partnerCode;
          report.partnerCodesBackfilled += 1;
        }
      }
    }

    Object.assign(data, gstChangesFor(partner, report));

    if (!Object.keys(data).length) continue;
    report.partnersUpdated += 1;
    if (!dryRun) {
      await db.partnerProfile.update({ where: { id: partner.id }, data });
    }
  }

  return report;
};

export const verifyLegacyPartnerBackfill = async (
  db: PartnerLegacyBackfillDb = prisma,
) => {
  const report = await backfillLegacyPartnerProfiles(db, { dryRun: true });
  return {
    passed: report.catalogAvailable
      && report.partnersUpdated === 0
      && report.gstProof.invalidProofLinks === 0,
    pendingCanonicalUpdates: report.partnersUpdated,
    missingStateCount: report.missingStateCount,
    missingCityCount: report.missingCityCount,
    invalidProofLinks: report.gstProof.invalidProofLinks,
    report,
  };
};
