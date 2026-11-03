import prisma from '../lib/prisma';
import { panVerificationService } from './panVerification.service';
import { gstVerificationService } from './gstVerification.service';
import { mobileToPanLookupService } from './mobileToPanLookup.service';
import { aadhaarVerificationService } from './aadhaarVerification.service';
import { drivingLicenseVerificationService } from './drivingLicenseVerification.service';
import { rcOwnerHistoryService } from './rcOwnerHistory.service';
import { rcChallanVerificationService } from './rcChallanVerification.service';
import { chassisToRcVerificationService } from './chassisToRcVerification.service';
import { rcToMobileVerificationService } from './rcToMobileVerification.service';

// One paginated, newest-first history across several verification services (Identity Hub and
// Vehicle & Transport). Each source is read through its own service's listHistory, so its masking,
// de-duplication, template rules and employee scoping stay exactly as on its own history screen.
// A single source is paged by its service directly; several sources are merged here, which reads
// up to page × limit rows from each, so the merged view goes back MAX_MERGED_DEPTH records.

export type VerificationHistoryGroup = 'identity' | 'vehicle';

type ListResult = { records: Array<Record<string, any>>; pagination?: { total?: number } };
type Viewer = { id: string; role: string };

type Source = {
  type: string;
  /** Any one of these lets an employee read the source, as on its own /history route. */
  permissions: string[];
  list: (filters: Record<string, unknown>, viewer: Viewer) => Promise<ListResult>;
};

const SOURCES: Record<VerificationHistoryGroup, Source[]> = {
  identity: [
    { type: 'PAN', permissions: ['pan.verification.read'], list: (filters, viewer) => panVerificationService.listHistory(filters, viewer.id, viewer.role) as Promise<ListResult> },
    { type: 'GST', permissions: ['gst.verification.read'], list: (filters, viewer) => gstVerificationService.listHistory(filters, viewer.id, viewer.role) as Promise<ListResult> },
    { type: 'MOBILE_TO_PAN', permissions: ['pan.mobile-to-pan.read'], list: (filters) => mobileToPanLookupService.listHistory(filters) as Promise<ListResult> },
    {
      type: 'AADHAAR',
      permissions: ['accounts.sell.crud', 'accounts.sell.update', 'aadhaar.digilocker.read'],
      list: (filters, viewer) => aadhaarVerificationService.listHistory(filters, viewer.id, viewer.role) as Promise<ListResult>,
    },
  ],
  vehicle: [
    { type: 'DRIVING_LICENSE', permissions: ['driving-license.verification.read'], list: (filters) => drivingLicenseVerificationService.listHistory(filters) as Promise<ListResult> },
    { type: 'RC_OWNER', permissions: ['rc.owner-history.read'], list: (filters) => rcOwnerHistoryService.listHistory(filters) as Promise<ListResult> },
    { type: 'RC_CHALLAN', permissions: ['rc.challan.verification.read'], list: (filters) => rcChallanVerificationService.listHistory(filters) as Promise<ListResult> },
    { type: 'CHASSIS_TO_RC', permissions: ['rc.chassis-to-rc.read'], list: (filters) => chassisToRcVerificationService.listHistory(filters) as Promise<ListResult> },
    { type: 'RC_TO_MOBILE', permissions: ['rc.to-mobile.read'], list: (filters) => rcToMobileVerificationService.listHistory(filters) as Promise<ListResult> },
  ],
};

export const PAGE_SIZES = [20, 50, 100];
export const MAX_MERGED_DEPTH = 2000;
const SOURCE_CHUNK = 100; // the services cap one page at 100 rows

export class VerificationHistoryError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'VerificationHistoryError';
  }
}

/** Same rule as requireAdminOrEmployeePermissions: admins read everything, employees by permission. */
const readableSources = async (group: VerificationHistoryGroup, viewer: Viewer) => {
  if (viewer.role === 'SUPER_ADMIN' || viewer.role === 'ADMIN') return SOURCES[group];
  if (viewer.role !== 'EMPLOYEE') return [];
  const employee = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { customRole: { select: { permissions: true } }, adminPermissions: { select: { permission: true } } },
  });
  const permissions: string[] = Array.isArray(employee?.customRole?.permissions)
    ? employee.customRole.permissions
    : (employee?.adminPermissions || []).map((item) => item.permission);
  if (permissions.includes('ALL_ACCESS')) return SOURCES[group];
  return SOURCES[group].filter((source) => source.permissions.some((permission) => permissions.includes(permission)));
};

const createdAtOf = (record: Record<string, any>) => new Date(record.createdAt || 0).getTime();

/** Newest `needed` rows of one source, walking its pages of 100. */
const readNewest = async (source: Source, filters: Record<string, unknown>, viewer: Viewer, needed: number) => {
  const records: Array<Record<string, any>> = [];
  let total = 0;
  for (let page = 1; records.length < needed; page += 1) {
    const result = await source.list({ ...filters, page, limit: SOURCE_CHUNK }, viewer);
    if (page === 1) total = Number(result.pagination?.total ?? result.records.length);
    records.push(...result.records);
    if (result.records.length < SOURCE_CHUNK || page * SOURCE_CHUNK >= total) break;
  }
  return { records: records.slice(0, needed), total };
};

export const listVerificationHistory = async (group: VerificationHistoryGroup, query: Record<string, unknown>, viewer: Viewer) => {
  const pageValue = Number.parseInt(String(query.page ?? '1'), 10);
  const limitValue = Number.parseInt(String(query.limit ?? '20'), 10);
  const page = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = PAGE_SIZES.includes(limitValue) ? limitValue : 20;
  const type = typeof query.type === 'string' ? query.type.trim().toUpperCase() : 'ALL';

  const readable = await readableSources(group, viewer);
  const sources = type === 'ALL' ? readable : readable.filter((source) => source.type === type);
  if (!sources.length) {
    return { records: [], pagination: { page, limit, total: 0, totalPages: 0 }, totals: {}, types: readable.map((source) => source.type) };
  }

  const filters: Record<string, unknown> = {
    ...(typeof query.search === 'string' && query.search.trim() ? { search: query.search.trim() } : {}),
    ...(typeof query.status === 'string' && query.status.trim() ? { status: query.status.trim().toUpperCase() } : {}),
    ...(typeof query.operation === 'string' && query.operation.trim() ? { operation: query.operation.trim().toUpperCase() } : {}),
  };
  const tag = (source: Source) => (record: Record<string, any>) => ({ ...record, _type: source.type });

  // One source: its own pagination, any depth.
  if (sources.length === 1) {
    const [source] = sources;
    const result = await source!.list({ ...filters, page, limit }, viewer);
    const total = Number(result.pagination?.total ?? result.records.length);
    return {
      records: result.records.map(tag(source!)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      totals: { [source!.type]: total },
      types: readable.map((item) => item.type),
    };
  }

  const needed = page * limit;
  if (needed > MAX_MERGED_DEPTH) {
    throw new VerificationHistoryError(`The combined list goes back ${MAX_MERGED_DEPTH} records. Pick one verification type or search to see older records.`);
  }
  const perSource = await Promise.all(sources.map(async (source) => {
    const result = await readNewest(source, filters, viewer, needed);
    return { source, total: result.total, records: result.records.map(tag(source)) };
  }));
  const merged = perSource.flatMap((item) => item.records).sort((a, b) => createdAtOf(b) - createdAtOf(a));
  const total = perSource.reduce((sum, item) => sum + item.total, 0);
  const reachable = Math.min(total, MAX_MERGED_DEPTH);
  return {
    records: merged.slice((page - 1) * limit, page * limit),
    pagination: { page, limit, total, totalPages: Math.ceil(reachable / limit) },
    totals: Object.fromEntries(perSource.map((item) => [item.source.type, item.total])),
    types: readable.map((item) => item.type),
  };
};
