type SearchDb = {
  sellAccount: { findMany: (args: any) => Promise<any[]> };
};

export type SoldVehicleSearchArguments = {
  query?: string;
  recordNumber?: string;
  listingId?: string;
  invoiceNumber?: string;
  vehicleNumber?: string;
  chassisNumber?: string;
  limit?: number;
};

export class SoldVehicleSearchError extends Error {
  constructor(message: string, public readonly code: 'QUERY_REQUIRED' | 'QUERY_INVALID') {
    super(message);
    this.name = 'SoldVehicleSearchError';
  }
}

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const normalized = (value: unknown): string => text(value).toLocaleUpperCase('en-IN').replace(/[^A-Z0-9]/gu, '');

const iso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && value && 'toNumber' in value && typeof value.toNumber === 'function') {
    const numberValue = (value.toNumber as () => number)();
    return Number.isFinite(numberValue) ? numberValue : null;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const hasExplicitIdentifier = (args: SoldVehicleSearchArguments): boolean => Boolean(
  args.recordNumber || args.listingId || args.invoiceNumber || args.vehicleNumber || args.chassisNumber,
);

const validIdentifier = (value: string | undefined): boolean => Boolean(value && value.trim().length >= 3);

const exactMatch = (value: unknown, expected: string | undefined): boolean => {
  if (!expected) return true;
  return normalized(value) === normalized(expected);
};

const containsMatch = (value: unknown, query: string): boolean => {
  const rawValue = text(value).toLocaleLowerCase('en-IN');
  const rawQuery = query.trim().toLocaleLowerCase('en-IN');
  return rawValue.includes(rawQuery) || normalized(value).includes(normalized(query));
};

const candidateMatch = (row: Record<string, unknown>, args: SoldVehicleSearchArguments): boolean => {
  if (args.recordNumber && !exactMatch(row.recordNumber, args.recordNumber)) return false;
  if (args.listingId && !exactMatch(row.listingId, args.listingId)) return false;
  if (args.invoiceNumber && !exactMatch(row.invoiceNumber, args.invoiceNumber)) return false;
  if (args.vehicleNumber && !exactMatch(row.vehicleNumber, args.vehicleNumber)) return false;
  if (args.chassisNumber && !exactMatch(row.chassisNumber, args.chassisNumber)) return false;
  if (args.query) {
    const queryFields = [
      row.recordNumber, row.invoiceNumber, row.listingTitle, row.vehicleNumber,
      row.chassisNumber, row.sellerName, row.purchaserName,
    ];
    if (!queryFields.some((value) => containsMatch(value, args.query as string))) return false;
  }
  return true;
};

const fieldWhere = (field: string, value: string, identityField = false) => {
  const raw = value.trim();
  if (!identityField) return { [field]: { equals: raw, mode: 'insensitive' } };
  const key = normalized(raw);
  const suffix = key.slice(-Math.min(8, key.length));
  return { [field]: { contains: suffix, mode: 'insensitive' } };
};

const searchWhereFor = (args: SoldVehicleSearchArguments) => {
  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  if (args.recordNumber) and.push(fieldWhere('recordNumber', args.recordNumber));
  if (args.listingId) and.push({ listingId: args.listingId.trim() });
  if (args.invoiceNumber) and.push(fieldWhere('invoiceNumber', args.invoiceNumber));
  if (args.vehicleNumber) and.push(fieldWhere('vehicleNumber', args.vehicleNumber, true));
  if (args.chassisNumber) and.push(fieldWhere('chassisNumber', args.chassisNumber, true));
  if (args.query && !hasExplicitIdentifier(args)) {
    const query = args.query.trim();
    const identitySuffix = normalized(query).slice(-Math.min(8, normalized(query).length));
    and.push({
      OR: [
        fieldWhere('recordNumber', query),
        fieldWhere('invoiceNumber', query),
        fieldWhere('listingTitle', query),
        fieldWhere('sellerName', query),
        fieldWhere('purchaserName', query),
        { vehicleNumber: { contains: identitySuffix, mode: 'insensitive' } },
        { chassisNumber: { contains: identitySuffix, mode: 'insensitive' } },
      ],
    });
  }
  return { AND: and };
};

const searchSelect = {
  id: true,
  recordNumber: true,
  listingId: true,
  listingTitle: true,
  invoiceNumber: true,
  vehicleNumber: true,
  chassisNumber: true,
  brandName: true,
  vehicleModel: true,
  sellerName: true,
  sellerNumber: true,
  purchaserName: true,
  purchaserNumber: true,
  ownerName: true,
  ownerNumber: true,
  dealStatus: true,
  sellDate: true,
  purchaseAmount: true,
  sellAmount: true,
  expenses: true,
  netProfit: true,
  gstRatePercent: true,
  taxMode: true,
  netProfitAfterGst: true,
  deletedAt: true,
} as const;

const matchReasonsFor = (row: Record<string, unknown>, args: SoldVehicleSearchArguments): string[] => {
  const reasons: string[] = [];
  if (args.recordNumber && exactMatch(row.recordNumber, args.recordNumber)) reasons.push('recordNumber');
  if (args.listingId && exactMatch(row.listingId, args.listingId)) reasons.push('listingId');
  if (args.invoiceNumber && exactMatch(row.invoiceNumber, args.invoiceNumber)) reasons.push('invoiceNumber');
  if (args.vehicleNumber && exactMatch(row.vehicleNumber, args.vehicleNumber)) reasons.push('vehicleNumber');
  if (args.chassisNumber && exactMatch(row.chassisNumber, args.chassisNumber)) reasons.push('chassisNumber');
  if (args.query) reasons.push('query');
  return reasons;
};

export const buildSoldVehicleSearch = async (db: SearchDb, args: SoldVehicleSearchArguments) => {
  const trimmedArgs = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined && value !== null)) as SoldVehicleSearchArguments;
  if (!hasExplicitIdentifier(trimmedArgs) && !trimmedArgs.query?.trim()) {
    throw new SoldVehicleSearchError('Provide a sold vehicle query or exact identifier.', 'QUERY_REQUIRED');
  }
  if (Object.entries(trimmedArgs).some(([key, value]) => ['query', 'recordNumber', 'listingId', 'invoiceNumber', 'vehicleNumber', 'chassisNumber'].includes(key) && typeof value === 'string' && !validIdentifier(value))) {
    throw new SoldVehicleSearchError('The sold vehicle search value is not valid.', 'QUERY_INVALID');
  }

  const limit = Math.min(20, Math.max(1, Math.floor(trimmedArgs.limit ?? 10)));
  const rows = await db.sellAccount.findMany({
    where: searchWhereFor(trimmedArgs),
    orderBy: [{ sellDate: 'desc' }, { updatedAt: 'desc' }],
    take: Math.min(100, limit * 5),
    select: searchSelect,
  } as never) as unknown[];
  const candidates = rows
    .map(asRecord)
    .filter((row) => row.deletedAt === null || row.deletedAt === undefined)
    .filter((row) => candidateMatch(row, trimmedArgs))
    .slice(0, limit)
    .map((row) => ({
      dealId: text(row.id) || null,
      recordNumber: text(row.recordNumber) || null,
      listingId: text(row.listingId) || null,
      listingTitle: text(row.listingTitle) || null,
      invoiceNumber: text(row.invoiceNumber) || null,
      vehicleNumber: text(row.vehicleNumber) || null,
      chassisNumber: text(row.chassisNumber) || null,
      brandName: text(row.brandName) || null,
      vehicleModel: text(row.vehicleModel) || null,
      sellerName: text(row.sellerName) || null,
      sellerNumber: text(row.sellerNumber) || null,
      purchaserName: text(row.purchaserName) || null,
      purchaserNumber: text(row.purchaserNumber) || null,
      ownerName: text(row.ownerName) || null,
      ownerNumber: text(row.ownerNumber) || null,
      dealStatus: text(row.dealStatus) || null,
      sellDate: iso(row.sellDate),
      purchaseAmount: numeric(row.purchaseAmount),
      sellAmount: numeric(row.sellAmount),
      expenses: numeric(row.expenses),
      netProfit: numeric(row.netProfit),
      gstRatePercent: numeric(row.gstRatePercent),
      taxMode: text(row.taxMode) || null,
      netProfitAfterGst: numeric(row.netProfitAfterGst),
      matchReasons: matchReasonsFor(row, trimmedArgs),
    }));

  return {
    found: candidates.length > 0,
    exact: candidates.length === 1,
    ambiguous: candidates.length > 1,
    dataAvailability: 'AVAILABLE' as const,
    source: 'database' as const,
    requested: {
      query: trimmedArgs.query ?? null,
      recordNumber: trimmedArgs.recordNumber ?? null,
      listingId: trimmedArgs.listingId ?? null,
      invoiceNumber: trimmedArgs.invoiceNumber ?? null,
      vehicleNumber: trimmedArgs.vehicleNumber ?? null,
      chassisNumber: trimmedArgs.chassisNumber ?? null,
    },
    candidates,
    message: candidates.length === 0
      ? 'No sold vehicle record matched the supplied search.'
      : candidates.length > 1
        ? 'Multiple sold vehicle records matched. Select one exact recordNumber or dealId before requesting full details.'
        : 'One sold vehicle record matched. Use its dealId or recordNumber for complete details.',
  };
};
