import { Prisma, RtoHirePurchaseStatus, RtoHsrpStatus, RtoValidityStatus } from '@prisma/client';

export type ListingRtoDetailsInput = {
  registrationNo?: unknown;
  vehicleType?: unknown;
  vehicleModel?: unknown;
  operatingHours?: unknown;
  hirePurchaseStatus?: unknown;
  taxStatus?: unknown;
  taxValidUntil?: unknown;
  fitnessStatus?: unknown;
  fitnessValidUntil?: unknown;
  insuranceStatus?: unknown;
  insuranceValidUntil?: unknown;
  insuranceExpiry?: unknown;
  pucStatus?: unknown;
  pucValidUntil?: unknown;
  hsrpStatus?: unknown;
  rtoOffice?: unknown;
  rtoAgentName?: unknown;
  rtoExpenses?: unknown;
  vehicleMaintenanceCost?: unknown;
};

export type ListingRtoListingContext = {
  listingId?: string;
  ownerName?: string | null;
  ownerNumber?: string | null;
  locationState?: string | null;
  locationCity?: string | null;
};

type ExistingListingRtoRecord = {
  id?: string;
  customerName?: string | null;
  customerNumber?: string | null;
  sellerName?: string | null;
  sellerNumber?: string | null;
  purchaserName?: string | null;
  purchaserNumber?: string | null;
  rtoAgentState?: string | null;
  rtoAgentCity?: string | null;
  rtoAgentNumber?: string | null;
  rtoExpensesAdvance?: Prisma.Decimal | number | string | null;
  documentSendDate?: Date | null;
  rtoStatus?: string | null;
  noteSheet?: string | null;
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const digits = (value: unknown) => text(value).replace(/\D/g, '');
const dateOrNull = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const money = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? new Prisma.Decimal(amount) : new Prisma.Decimal(0);
};
const validEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T) =>
  allowed.includes(String(value) as T) ? String(value) as T : fallback;

export const validateListingRtoDetails = (input: ListingRtoDetailsInput) => {
  const required: Array<[keyof ListingRtoDetailsInput, string]> = [
    ['registrationNo', 'Vehicle Number'],
    ['vehicleType', 'Vehicle Type'],
    ['vehicleModel', 'Vehicle Model'],
    ['rtoOffice', 'RTO Office'],
    ['rtoAgentName', 'RTO Agent Name'],
  ];
  const missing = required.find(([key]) => !text(input[key]));
  if (missing) return `${missing[1]} is required.`;

  if (!Object.values(RtoHirePurchaseStatus).includes(String(input.hirePurchaseStatus) as RtoHirePurchaseStatus)) {
    return 'Hire Purchase is required.';
  }

  const validityChecks: Array<[string, unknown, unknown]> = [
    ['Tax Validity', input.taxStatus, input.taxValidUntil],
    ['Fitness Validity', input.fitnessStatus, input.fitnessValidUntil],
    ['Insurance Validity', input.insuranceStatus, input.insuranceValidUntil || input.insuranceExpiry],
    ['PUC Validity', input.pucStatus, input.pucValidUntil],
  ];

  const missingValidity = validityChecks.find(([name, status, date]) => {
    const normalizedStatus = String(status || '');
    return !Object.values(RtoValidityStatus).includes(normalizedStatus as RtoValidityStatus)
      || ((normalizedStatus === RtoValidityStatus.VALID || normalizedStatus === RtoValidityStatus.EXPIRED) && !dateOrNull(date));
  });
  if (missingValidity) return `${missingValidity[0]} status and date are required.`;

  if (!Object.values(RtoHsrpStatus).includes(String(input.hsrpStatus) as RtoHsrpStatus)) {
    return 'HSRP Valid is required.';
  }
  if (Number(input.rtoExpenses) <= 0) return 'RTO Expenses is required.';
  if (Number(input.vehicleMaintenanceCost) <= 0) return 'Vehicle Maintenance Cost is required.';
  if (Number(input.operatingHours) <= 0) return 'Hours Running is required.';
  return null;
};

export const buildListingRtoData = (
  input: ListingRtoDetailsInput,
  context: ListingRtoListingContext,
  existing?: ExistingListingRtoRecord,
) => ({
  listingId: context.listingId,
  customerName: existing?.customerName || text(context.ownerName) || 'Listing Owner',
  customerNumber: existing?.customerNumber || digits(context.ownerNumber),
  vehicleNumber: text(input.registrationNo).toUpperCase(),
  vehicleType: text(input.vehicleType),
  vehicleModel: text(input.vehicleModel),
  hirePurchaseStatus: validEnum(input.hirePurchaseStatus, Object.values(RtoHirePurchaseStatus), RtoHirePurchaseStatus.PENDING),
  taxStatus: validEnum(input.taxStatus, Object.values(RtoValidityStatus), RtoValidityStatus.NOT_AVAILABLE),
  taxValidUntil: dateOrNull(input.taxValidUntil),
  fitnessStatus: validEnum(input.fitnessStatus, Object.values(RtoValidityStatus), RtoValidityStatus.NOT_AVAILABLE),
  fitnessValidUntil: dateOrNull(input.fitnessValidUntil),
  insuranceStatus: validEnum(input.insuranceStatus, Object.values(RtoValidityStatus), RtoValidityStatus.NOT_AVAILABLE),
  insuranceValidUntil: dateOrNull(input.insuranceValidUntil || input.insuranceExpiry),
  pucStatus: validEnum(input.pucStatus, Object.values(RtoValidityStatus), RtoValidityStatus.NOT_AVAILABLE),
  pucValidUntil: dateOrNull(input.pucValidUntil),
  hsrpStatus: validEnum(input.hsrpStatus, Object.values(RtoHsrpStatus), RtoHsrpStatus.PENDING),
  sellerName: existing?.sellerName || text(context.ownerName),
  sellerNumber: existing?.sellerNumber || digits(context.ownerNumber),
  purchaserName: existing?.purchaserName || '',
  purchaserNumber: existing?.purchaserNumber || '',
  rtoOffice: text(input.rtoOffice),
  rtoAgentName: text(input.rtoAgentName),
  rtoAgentState: existing?.rtoAgentState || text(context.locationState),
  rtoAgentCity: existing?.rtoAgentCity || text(context.locationCity),
  rtoAgentNumber: existing?.rtoAgentNumber || '',
  rtoExpenses: money(input.rtoExpenses),
  rtoExpensesAdvance: existing?.rtoExpensesAdvance || new Prisma.Decimal(0),
  documentSendDate: existing?.documentSendDate || null,
  rtoStatus: existing?.rtoStatus || 'PENDING',
  noteSheet: existing?.noteSheet || null,
  vehicleMaintenanceCost: money(input.vehicleMaintenanceCost),
  hourRunning: Number(input.operatingHours) || null,
});

export const syncListingRtoRecord = async (
  client: any,
  input: ListingRtoDetailsInput,
  context: ListingRtoListingContext,
) => {
  const validationError = validateListingRtoDetails(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const vehicleNumber = text(input.registrationNo).toUpperCase();
  const existing = await client.vehicleRtoRecord.findFirst({
    where: {
      OR: [
        { listingId: context.listingId },
        ...(vehicleNumber ? [{ listingId: null, vehicleNumber }] : []),
      ],
    },
    orderBy: { updatedAt: 'desc' },
  });
  const data = buildListingRtoData(input, context, existing || undefined);

  return existing
    ? client.vehicleRtoRecord.update({ where: { id: existing.id }, data })
    : client.vehicleRtoRecord.create({ data });
};

export const syncListingRtoForListing = async (
  client: any,
  listingId: string,
  input: ListingRtoDetailsInput,
) => {
  const listing = await client.listing.findUnique({
    where: { id: listingId },
    include: {
      partner: { select: { name: true, mobile: true } },
      category: { select: { name: true } },
      model: { select: { name: true } },
    },
  });

  if (!listing) {
    throw new Error('Listing not found.');
  }

  return syncListingRtoRecord(client, input, {
    listingId,
    ownerName: listing.partner?.name,
    ownerNumber: listing.partner?.mobile,
    locationState: listing.locationState,
    locationCity: listing.locationCity,
  });
};
