type QueryValue = string | string[] | undefined;

export type PartnerDirectoryStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'BLOCKED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED';

export type PartnerDirectoryGstStatus = 'VERIFIED' | 'UNVERIFIED' | 'PENDING' | 'FAILED';
export type PartnerDirectorySort = 'newest' | 'oldest' | 'listings' | 'name';
export type PartnerDirectoryArchived = boolean | null;

export interface PartnerDirectoryQuery {
  search: string;
  page: number;
  pageSize: number;
  skip: number;
  countryId?: number | undefined;
  stateId?: number | undefined;
  cityId?: number | undefined;
  gstStatus?: PartnerDirectoryGstStatus | undefined;
  kycStatus?: string | undefined;
  accountStatus?: string | undefined;
  partnerType?: 'SHOWROOM' | 'BROKER' | undefined;
  status?: PartnerDirectoryStatus | undefined;
  joinedFrom?: Date | undefined;
  joinedTo?: Date | undefined;
  sort: PartnerDirectorySort;
  archived: PartnerDirectoryArchived;
}

const MAX_PAGE_SIZE = 100;
const VALID_GST_STATUSES = new Set<PartnerDirectoryGstStatus>([
  'VERIFIED',
  'UNVERIFIED',
  'PENDING',
  'FAILED',
]);
const VALID_PARTNER_TYPES = new Set<'SHOWROOM' | 'BROKER'>(['SHOWROOM', 'BROKER']);
const VALID_KYC_STATUSES = new Set([
  'NOT_STARTED',
  'INCOMPLETE',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);
const VALID_ACCOUNT_STATUSES = new Set(['PENDING', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED']);

const firstValue = (value: QueryValue) => (Array.isArray(value) ? value[0] : value);

const readText = (value: QueryValue) => firstValue(value)?.trim() || '';

const parseInteger = (value: QueryValue, field: string, options: { min: number; max?: number }) => {
  const raw = readText(value);
  if (!raw) return undefined;

  if (!/^\d+$/.test(raw)) {
    throw new Error(`${field} must be a valid integer.`);
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || (options.max !== undefined && parsed > options.max)) {
    const range = options.max === undefined ? `at least ${options.min}` : `between ${options.min} and ${options.max}`;
    throw new Error(`${field} must be ${range}.`);
  }

  return parsed;
};

const parseDate = (value: QueryValue, field: string, endOfDay: boolean) => {
  const raw = readText(value);
  if (!raw) return undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`${field} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error(`${field} must be a valid calendar date.`);
  }

  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
};

const parseUpperEnum = <T extends string>(
  value: QueryValue,
  field: string,
  allowed: Set<T>,
) => {
  const raw = readText(value);
  if (!raw) return undefined;
  const normalized = raw.toUpperCase().replace(/[ -]+/g, '_') as T;
  if (!allowed.has(normalized)) {
    throw new Error(`${field} has an unsupported value.`);
  }
  return normalized;
};

const parseStatus = (value: QueryValue) => {
  const raw = readText(value);
  if (!raw) return undefined;
  const normalized = raw.toUpperCase().replace(/[ -]+/g, '_');
  const aliases: Record<string, PartnerDirectoryStatus> = {
    ACTIVE: 'ACTIVE',
    PENDING: 'PENDING',
    PENDING_KYC: 'PENDING',
    INACTIVE: 'INACTIVE',
    SUSPENDED: 'SUSPENDED',
    BLOCKED: 'BLOCKED',
    REJECTED: 'REJECTED',
    CHANGES_REQUESTED: 'CHANGES_REQUESTED',
    CHANGES_REQUESTED_STATUS: 'CHANGES_REQUESTED',
  };
  const status = aliases[normalized];
  if (!status) throw new Error('status has an unsupported value.');
  return status;
};

const parseArchived = (value: QueryValue): PartnerDirectoryArchived => {
  const raw = readText(value).toLowerCase();
  if (!raw || raw === 'false' || raw === 'active') return false;
  if (raw === 'true' || raw === 'archived') return true;
  if (raw === 'all') return null;
  throw new Error('archived must be true, false, or all.');
};

export const parsePartnerDirectoryQuery = (
  input: Record<string, QueryValue>,
): PartnerDirectoryQuery => {
  const page = parseInteger(input.page, 'page', { min: 1 }) ?? 1;
  const pageSize = parseInteger(input.pageSize, 'pageSize', { min: 1, max: MAX_PAGE_SIZE }) ?? 20;
  const joinedFrom = parseDate(input.joinedFrom, 'joinedFrom', false);
  const joinedTo = parseDate(input.joinedTo, 'joinedTo', true);

  if (joinedFrom && joinedTo && joinedFrom >= joinedTo) {
    throw new Error('joinedFrom must be earlier than joinedTo.');
  }

  const sortRaw = readText(input.sort).toLowerCase() || 'newest';
  if (!['newest', 'oldest', 'listings', 'name'].includes(sortRaw)) {
    throw new Error('sort has an unsupported value.');
  }

  return {
    search: readText(input.search || input.q),
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    countryId: parseInteger(input.countryId, 'countryId', { min: 1 }),
    stateId: parseInteger(input.stateId, 'stateId', { min: 1 }),
    cityId: parseInteger(input.cityId, 'cityId', { min: 1 }),
    gstStatus: parseUpperEnum(input.gstStatus, 'gstStatus', VALID_GST_STATUSES),
    kycStatus: parseUpperEnum(input.kycStatus, 'kycStatus', VALID_KYC_STATUSES),
    accountStatus: parseUpperEnum(input.accountStatus, 'accountStatus', VALID_ACCOUNT_STATUSES),
    partnerType: parseUpperEnum(input.partnerType, 'partnerType', VALID_PARTNER_TYPES),
    status: parseStatus(input.status),
    joinedFrom,
    joinedTo,
    sort: sortRaw as PartnerDirectorySort,
    archived: parseArchived(input.archived),
  };
};

const approvedPartnerProfile = {
  accountStatus: 'ACTIVE',
  kycStatus: 'APPROVED',
  onboardingStatus: 'APPROVED',
};

const statusWhere = (status: PartnerDirectoryStatus) => {
  if (status === 'ACTIVE') {
    return {
      status: 'ACTIVE',
      partnerProfile: { is: approvedPartnerProfile },
    };
  }

  if (status === 'INACTIVE' || status === 'SUSPENDED' || status === 'BLOCKED') {
    return { status };
  }

  if (status === 'REJECTED') {
    return {
      OR: [
        { partnerProfile: { is: { onboardingStatus: 'REJECTED' } } },
        { partnerProfile: { is: { kycStatus: 'REJECTED' } } },
      ],
    };
  }

  if (status === 'CHANGES_REQUESTED') {
    return {
      OR: [
        { partnerProfile: { is: { onboardingStatus: 'CHANGES_REQUESTED' } } },
        { partnerProfile: { is: { kycStatus: 'CHANGES_REQUESTED' } } },
      ],
    };
  }

  return {
    status: { notIn: ['INACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED'] },
    NOT: [
      { partnerProfile: { is: approvedPartnerProfile } },
      { partnerProfile: { is: { onboardingStatus: 'REJECTED' } } },
      { partnerProfile: { is: { kycStatus: 'REJECTED' } } },
      { partnerProfile: { is: { onboardingStatus: 'CHANGES_REQUESTED' } } },
      { partnerProfile: { is: { kycStatus: 'CHANGES_REQUESTED' } } },
    ],
  };
};

const searchWhere = (search: string) => ({
  OR: [
    { id: { contains: search, mode: 'insensitive' } },
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
    { mobile: { contains: search, mode: 'insensitive' } },
    { city: { contains: search, mode: 'insensitive' } },
    { state: { contains: search, mode: 'insensitive' } },
    { partnerProfile: { is: { businessName: { contains: search, mode: 'insensitive' } } } },
    { partnerProfile: { is: { ownerName: { contains: search, mode: 'insensitive' } } } },
    { partnerProfile: { is: { partnerCode: { contains: search, mode: 'insensitive' } } } },
    { partnerProfile: { is: { gstNumber: { contains: search, mode: 'insensitive' } } } },
    { partnerProfile: { is: { district: { contains: search, mode: 'insensitive' } } } },
    { partnerProfile: { is: { state: { is: { name: { contains: search, mode: 'insensitive' } } } } } },
    { partnerProfile: { is: { city: { is: { name: { contains: search, mode: 'insensitive' } } } } } },
  ],
});

const gstWhere = (gstStatus: PartnerDirectoryGstStatus) => {
  if (gstStatus === 'UNVERIFIED') {
    return {
      NOT: {
        partnerProfile: {
          is: { gstVerificationRecord: { is: { status: 'SUCCESS' } } },
        },
      },
    };
  }

  const status = gstStatus === 'VERIFIED' ? 'SUCCESS' : gstStatus;
  return {
    partnerProfile: {
      is: { gstVerificationRecord: { is: { status } } },
    },
  };
};

export const buildPartnerDirectoryWhere = (query: PartnerDirectoryQuery) => {
  const where: Record<string, unknown> = {
    role: 'PARTNER',
    partnerProfile: { isNot: null },
    AND: [],
  };
  const and = where.AND as Array<Record<string, unknown>>;

  if (query.archived === true) where.status = 'CLOSED';
  if (query.archived === false && query.accountStatus !== 'CLOSED') where.status = { not: 'CLOSED' };
  if (query.search) and.push(searchWhere(query.search));
  if (query.countryId !== undefined) and.push({ partnerProfile: { is: { countryId: query.countryId } } });
  if (query.stateId !== undefined) and.push({ partnerProfile: { is: { stateId: query.stateId } } });
  if (query.cityId !== undefined) and.push({ partnerProfile: { is: { cityId: query.cityId } } });
  if (query.gstStatus) and.push(gstWhere(query.gstStatus));
  if (query.kycStatus) and.push({ partnerProfile: { is: { kycStatus: query.kycStatus } } });
  if (query.accountStatus) and.push({ partnerProfile: { is: { accountStatus: query.accountStatus } } });
  if (query.partnerType) and.push({ partnerProfile: { is: { partnerType: query.partnerType } } });
  if (query.status) and.push(statusWhere(query.status));
  if (query.joinedFrom || query.joinedTo) {
    and.push({
      createdAt: {
        ...(query.joinedFrom ? { gte: query.joinedFrom } : {}),
        ...(query.joinedTo ? { lt: query.joinedTo } : {}),
      },
    });
  }

  return where;
};

export const buildPartnerDirectoryOrderBy = (query: PartnerDirectoryQuery) => {
  if (query.sort === 'oldest') return [{ createdAt: 'asc' }, { id: 'asc' }];
  if (query.sort === 'listings') {
    return [{ listings: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'asc' }];
  }
  if (query.sort === 'name') return [{ name: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }];
  return [{ createdAt: 'desc' }, { id: 'asc' }];
};
