import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { normalizeRemoteMediaUrl } from '../utils/mediaUrl';
import { calculateConversionRate, calculateDemandPerStock, calculateDemandScore, calculatePercentageChange, getPreviousPeriod } from '../services/analyticsMetrics';
import { ANALYTICS_EVENT_TYPES, recordAnalyticsEvent } from '../services/analytics.service';
import { buildCsv } from '../services/csvExport';

const prismaAny = prisma as any;
const analyticsOptionsCache = new Map<string, { expiresAt: number; payload: unknown }>();
const ANALYTICS_OPTIONS_CACHE_TTL_MS = 60_000;

const LEAD_LABELS: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  INSPECTION_SCHEDULED: 'Inspection Scheduled',
  WON: 'Won',
  LOST: 'Lost',
};

const LISTING_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  CHANGES_REQUESTED: 'Changes Requested',
  PUBLISHED: 'Published',
  PAUSED: 'Paused',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  REJECTED: 'Rejected',
};

const LISTING_STATUS_VALUES = new Set(Object.keys(LISTING_LABELS));
const LEAD_STATUS_VALUES = new Set(Object.keys(LEAD_LABELS));
const LEAD_STAGE_STATUS_MAP: Record<string, string[]> = {
  OPEN: ['NEW'],
  ONGOING: ['CONTACTED', 'INTERESTED', 'INSPECTION_SCHEDULED'],
  CLOSED: ['WON', 'LOST'],
};

const label = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const resolvePartnerPresentation = (partner: any) => {
  const isPrime = Boolean(partner?.customerPrimeSubscriptions?.length);
  const rawType = partner?.partnerProfile?.partnerType;

  if (isPrime) return { partnerType: 'Prime Customer', isPrime };
  if (rawType === 'SHOWROOM' || rawType === 'DEALER') return { partnerType: 'Authorized Place', isPrime };
  if (rawType === 'BROKER') return { partnerType: 'Broker', isPrime };
  if (partner?.role === 'CUSTOMER') return { partnerType: 'Customer', isPrime };
  return { partnerType: rawType ? String(rawType) : 'Authorized Place', isPrime };
};

const formatMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const formatMonthLabel = (date: Date) =>
  date.toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
  });

export const getPartnerAnalyticsOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || req.user.role !== 'PARTNER') {
      return res.status(403).json({ error: 'Partner access required.' });
    }

    const [listings, leads] = await Promise.all([
      prismaAny.listing.findMany({
        where: { partnerId: req.user.id },
        select: {
          id: true,
          title: true,
          status: true,
          price: true,
          manufacturingYear: true,
          locationCity: true,
          locationState: true,
          updatedAt: true,
          media: {
            select: {
              url: true,
              type: true,
              isFeatured: true,
            },
          },
          leads: {
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),
      prismaAny.lead.findMany({
        where: { dealerId: req.user.id },
        select: {
          id: true,
          status: true,
          enquiryType: true,
          createdAt: true,
          customer: {
            select: {
              name: true,
              mobile: true,
            },
          },
          listing: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
    ]);

    const totalLeads = leads.length;
    const totalListings = listings.length;
    const liveListings = listings.filter((listing: any) => ['PUBLISHED', 'RESERVED', 'PAUSED'].includes(listing.status));
    const publishedListings = listings.filter((listing: any) => listing.status === 'PUBLISHED');
    const pendingListings = listings.filter((listing: any) => ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'].includes(listing.status));
    const soldListings = listings.filter((listing: any) => listing.status === 'SOLD');
    const wonLeads = leads.filter((lead: any) => lead.status === 'WON').length;
    const activeLeads = leads.filter((lead: any) =>
      ['NEW', 'CONTACTED', 'INTERESTED', 'INSPECTION_SCHEDULED'].includes(lead.status)
    ).length;
    const liveInventoryValue = liveListings.reduce((sum: number, listing: any) => sum + Number(listing.price || 0), 0);

    const listingStatusCounts: Record<string, number> = {};
    for (const listing of listings) {
      listingStatusCounts[listing.status] = (listingStatusCounts[listing.status] ?? 0) + 1;
    }

    const listingStatusBreakdown = Object.entries(listingStatusCounts).map(([status, count]) => ({
      status,
      label: LISTING_LABELS[status] || status,
      count,
    }));

    const leadStatusCounts: Record<string, number> = {};
    for (const lead of leads) {
      leadStatusCounts[lead.status] = (leadStatusCounts[lead.status] ?? 0) + 1;
    }

    const leadStatusBreakdown = Object.entries(leadStatusCounts).map(([status, count]) => ({
      status,
      label: LEAD_LABELS[status] || status,
      count,
    }));

    const topListings = listings
      .map((listing: any) => ({
        id: listing.id,
        title: listing.title,
        status: listing.status,
        price: Number(listing.price || 0),
        location: [listing.locationCity, listing.locationState].filter(Boolean).join(', '),
        manufacturingYear: listing.manufacturingYear,
        leadCount: listing.leads.length,
        wonLeadCount: listing.leads.filter((lead: any) => lead.status === 'WON').length,
        featuredImage:
          normalizeRemoteMediaUrl(listing.media.find((media: any) => media.type === 'IMAGE' && media.isFeatured)?.url) ||
          normalizeRemoteMediaUrl(listing.media.find((media: any) => media.type === 'IMAGE')?.url) ||
          '',
      }))
      .sort((first: any, second: any) => second.leadCount - first.leadCount || second.price - first.price)
      .slice(0, 5);

    const now = new Date();
    const monthlyLeadTrend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = formatMonthKey(date);
      return {
        key,
        label: formatMonthLabel(date),
        count: 0,
      };
    });

    const monthlyLeadMap: Record<string, number> = {};
    for (const item of monthlyLeadTrend) {
      monthlyLeadMap[item.key] = 0;
    }

    for (const lead of leads) {
      const key = formatMonthKey(new Date(lead.createdAt));
      if (key in monthlyLeadMap) {
        monthlyLeadMap[key] = (monthlyLeadMap[key] ?? 0) + 1;
      }
    }

    const recentLeads = leads.slice(0, 5).map((lead: any) => ({
      id: lead.id,
      status: lead.status,
      enquiryType: lead.enquiryType,
      createdAt: lead.createdAt,
      customerName: lead.customer?.name || lead.customer?.mobile || 'Customer',
      listingTitle: lead.listing?.title || 'Listing',
    }));

    return res.json({
      summary: {
        totalListings,
        liveListings: liveListings.length,
        publishedListings: publishedListings.length,
        pendingListings: pendingListings.length,
        soldListings: soldListings.length,
        totalLeads,
        activeLeads,
        wonLeads,
        conversionRate: totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(1)) : 0,
        averageLeadsPerListing: totalListings > 0 ? Number((totalLeads / totalListings).toFixed(1)) : 0,
        liveInventoryValue,
      },
      listingStatusBreakdown,
      leadStatusBreakdown,
      monthlyLeadTrend: monthlyLeadTrend.map((item) => ({
        ...item,
        count: monthlyLeadMap[item.key] || 0,
      })),
      topListings,
      recentLeads,
    });
  } catch (error) {
    next(error);
  }
};

type AnalyticsFilters = {
  from: Date;
  to: Date;
  brandId?: string | undefined;
  modelId?: string | undefined;
  categoryId?: string | undefined;
  partnerId?: string | undefined;
  locationState?: string | undefined;
  locationCity?: string | undefined;
  locationCountryId?: number | undefined;
  locationStateId?: number | undefined;
  locationCityId?: number | undefined;
  locationStateNames?: string[] | undefined;
  manufacturingYear?: number | undefined;
  listingStatus?: string | undefined;
  leadStatus?: string | undefined;
  leadStatusStage?: string | undefined;
  listingId?: string | undefined;
};

const parseDate = (value: unknown, endOfDay = false) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseNumericQuery = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const parseAnalyticsFilters = async (req: Request, partnerId?: string): Promise<AnalyticsFilters> => {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  defaultFrom.setUTCHours(0, 0, 0, 0);
  const from = parseDate(req.query.from) || defaultFrom;
  const to = parseDate(req.query.to, true) || now;
  const rawYear = Number(req.query.manufacturingYear);
  const locationCountryId = parseNumericQuery(req.query.countryId);
  const locationStateId = parseNumericQuery(req.query.stateId);
  const locationCityId = parseNumericQuery(req.query.cityId);
  const rawLeadStatus = typeof req.query.leadStatus === 'string' ? req.query.leadStatus.trim().toUpperCase() : '';
  let locationStateNames: string[] | undefined;
  let resolvedLocationState: string | undefined;
  let resolvedLocationCity: string | undefined;

  if (locationCityId) {
    const city = await prismaAny.city.findUnique({
      where: { id: locationCityId },
      select: { name: true, stateId: true, countryId: true, state: { select: { name: true } } },
    });

    if (!city || (locationStateId && city.stateId !== locationStateId) || (locationCountryId && city.countryId !== locationCountryId)) {
      locationStateNames = [];
    } else {
      resolvedLocationState = city.state.name;
      resolvedLocationCity = city.name;
    }
  } else if (locationStateId) {
    const state = await prismaAny.state.findUnique({
      where: { id: locationStateId },
      select: { name: true, countryId: true },
    });

    if (!state || (locationCountryId && state.countryId !== locationCountryId)) {
      locationStateNames = [];
    } else {
      resolvedLocationState = state.name;
    }
  } else if (locationCountryId) {
    const states = await prismaAny.state.findMany({
      where: { countryId: locationCountryId },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    locationStateNames = states.map((state: { name: string }) => state.name);
  }

  return {
    from: from <= to ? from : defaultFrom,
    to: from <= to ? to : now,
    brandId: typeof req.query.brandId === 'string' ? req.query.brandId.trim() : undefined,
    modelId: typeof req.query.modelId === 'string' ? req.query.modelId.trim() : undefined,
    categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId.trim() : undefined,
    partnerId: partnerId || (typeof req.query.partnerId === 'string' ? req.query.partnerId.trim() : undefined),
    locationState: resolvedLocationState || (typeof req.query.locationState === 'string' ? req.query.locationState.trim() : undefined),
    locationCity: resolvedLocationCity || (typeof req.query.locationCity === 'string' ? req.query.locationCity.trim() : undefined),
    locationCountryId,
    locationStateId,
    locationCityId,
    locationStateNames,
    manufacturingYear: Number.isInteger(rawYear) && rawYear >= 1900 && rawYear <= 2200 ? rawYear : undefined,
    listingStatus:
      typeof req.query.listingStatus === 'string' && LISTING_STATUS_VALUES.has(req.query.listingStatus.trim())
        ? req.query.listingStatus.trim()
        : undefined,
    leadStatus:
      LEAD_STATUS_VALUES.has(rawLeadStatus)
        ? rawLeadStatus
        : undefined,
    leadStatusStage: Object.prototype.hasOwnProperty.call(LEAD_STAGE_STATUS_MAP, rawLeadStatus) ? rawLeadStatus : undefined,
    listingId: typeof req.query.listingId === 'string' ? req.query.listingId.trim() : undefined,
  };
};

const getScopedListingWhere = (filters: AnalyticsFilters, period?: { from: Date; to: Date }) => ({
  ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
  ...(filters.brandId ? { brandId: filters.brandId } : {}),
  ...(filters.modelId ? { modelId: filters.modelId } : {}),
  ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
  ...(filters.locationStateNames ? { locationState: { in: filters.locationStateNames, mode: 'insensitive' } } : filters.locationState ? { locationState: { equals: filters.locationState, mode: 'insensitive' } } : {}),
  ...(filters.locationCity ? { locationCity: { equals: filters.locationCity, mode: 'insensitive' } } : {}),
  ...(filters.manufacturingYear ? { manufacturingYear: filters.manufacturingYear } : {}),
  ...(filters.listingStatus ? { status: filters.listingStatus } : {}),
  ...(filters.listingId ? { id: filters.listingId } : {}),
  ...(period ? { createdAt: { gte: period.from, lte: period.to } } : {}),
});

const hasListingScopeFilters = (filters: AnalyticsFilters) => Boolean(
  filters.partnerId ||
  filters.brandId ||
  filters.modelId ||
  filters.categoryId ||
  filters.locationState ||
  filters.locationCity ||
  filters.locationStateNames ||
  filters.manufacturingYear ||
  filters.listingStatus ||
  filters.listingId,
);

const getScopedLeadWhere = (filters: AnalyticsFilters, period: { from: Date; to: Date }) => {
  const listingWhere = getScopedListingWhere(filters);
  const conditions: any[] = [{ createdAt: { gte: period.from, lte: period.to } }];

  if (filters.partnerId) {
    conditions.push({
      OR: [
        { dealerId: filters.partnerId },
        { listing: { partnerId: filters.partnerId } },
      ],
    });
  }

  if (Object.keys(listingWhere).length > 0) {
    conditions.push({ listing: listingWhere });
  }

  if (filters.leadStatus) {
    conditions.push({ status: filters.leadStatus });
  }

  if (filters.leadStatusStage) {
    conditions.push({ status: { in: LEAD_STAGE_STATUS_MAP[filters.leadStatusStage] } });
  }

  return conditions.length === 1 ? conditions[0] : { AND: conditions };
};

const makeKpi = (current: number, previous: number) => ({
  current,
  previous,
  difference: current - previous,
  percentageChange: calculatePercentageChange(current, previous),
  trend: current === previous ? 'flat' : current > previous ? 'up' : 'down',
});

const safeEventCount = async (where: Record<string, unknown>) => {
  try {
    return await prismaAny.analyticsEvent.count({ where });
  } catch (error) {
    console.error('Analytics event aggregate unavailable:', error);
    return 0;
  }
};

const safeUniqueListingViewCount = async (listingId: string) => {
  try {
    const result = await prismaAny.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(DISTINCT COALESCE(
        NULLIF("actorUserId", ''),
        NULLIF("anonymousId", ''),
        NULLIF("sessionId", ''),
        NULLIF("dedupeKey", '')
      )) AS count
      FROM "AnalyticsEvent"
      WHERE "eventType" = 'LISTING_VIEW'
        AND "listingId" = ${listingId}
    `;

    return Number(result[0]?.count || 0);
  } catch (error) {
    console.error('Unique listing view aggregate unavailable:', error);
    return 0;
  }
};

const safeEventFirstDate = async () => {
  try {
    const first = await prismaAny.analyticsEvent.findFirst({
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true },
    });
    return first?.occurredAt || null;
  } catch {
    return null;
  }
};

const getUserLabels = async (ids: string[]) => {
  if (!ids.length) {
    return new Map<string, string>();
  }

  const users = await prismaAny.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      email: true,
      partnerProfile: { select: { businessName: true } },
    },
  });

  return new Map(users.map((user: any) => [
    user.id,
    user.partnerProfile?.businessName || user.name || user.email || 'Partner',
  ]));
};

export const getAnalyticsOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Analytics access required.' });
    }

    const listingScope = req.user.role === 'PARTNER' ? { partnerId: req.user.id } : {};
    const cacheKey = req.user.role === 'PARTNER' ? `partner:${req.user.id}` : 'platform';
    const cached = analyticsOptionsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.payload);
    }

    const [brands, models, categories, partners, years, listings, listingStatuses, leadStatuses, countries] = await Promise.all([
      prismaAny.brand.findMany({
        where: { listings: { some: listingScope } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prismaAny.model.findMany({
        where: { listings: { some: listingScope } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, brandId: true },
      }),
      prismaAny.category.findMany({
        where: { listings: { some: listingScope } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prismaAny.user.findMany({
        where: { role: 'PARTNER', ...(req.user.role === 'PARTNER' ? { id: req.user.id } : {}), listings: { some: listingScope } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, partnerProfile: { select: { businessName: true } } },
      }),
      prismaAny.listing.groupBy({
        by: ['manufacturingYear'],
        where: listingScope,
        orderBy: { manufacturingYear: 'desc' },
      }),
      prismaAny.listing.findMany({
        where: listingScope,
        orderBy: { title: 'asc' },
        take: 1000,
        select: { id: true, title: true },
      }),
      prismaAny.listing.groupBy({ by: ['status'], where: listingScope, orderBy: { status: 'asc' } }),
      prismaAny.lead.groupBy({
        by: ['status'],
        where: req.user.role === 'PARTNER' ? { OR: [{ dealerId: req.user.id }, { listing: { partnerId: req.user.id } }] } : {},
        orderBy: { status: 'asc' },
      }),
      prismaAny.country.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, iso2: true, emoji: true } }),
    ]);

    const payload = {
      brands,
      models,
      categories,
      partners: partners.map((partner: any) => ({ id: partner.id, name: partner.partnerProfile?.businessName || partner.name || 'Partner' })),
      years: years.map((year: { manufacturingYear: number }) => year.manufacturingYear),
      listings: listings.map((listing: { id: string; title: string }) => ({ id: listing.id, name: listing.title })),
      listingStatuses: listingStatuses.map((item: { status: string }) => item.status),
      leadStatuses: leadStatuses.map((item: { status: string }) => item.status),
      countries,
    };
    analyticsOptionsCache.set(cacheKey, { expiresAt: Date.now() + ANALYTICS_OPTIONS_CACHE_TTL_MS, payload });
    return res.json(payload);
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Analytics access required.' });
    }

    const filters = await parseAnalyticsFilters(req, req.user.role === 'PARTNER' ? req.user.id : undefined);
    const previous = getPreviousPeriod(filters.from, filters.to);
    const currentListingWhere = getScopedListingWhere(filters);
    const currentCreatedListingWhere = getScopedListingWhere(filters, filters);
    const previousCreatedListingWhere = getScopedListingWhere(filters, previous);
    const currentLeadWhere = getScopedLeadWhere(filters, filters);
    const previousLeadWhere = getScopedLeadWhere(filters, previous);
    const liveListingWhere = {
      ...currentListingWhere,
      status: { in: ['PUBLISHED', 'PAUSED', 'RESERVED'] },
    };

    const [
      totalListings,
      createdListings,
      previousCreatedListings,
      liveInventory,
      listingStatusGroups,
      leadCount,
      previousLeadCount,
      leadStatusGroups,
      modelYearGroups,
      topListings,
      saleAggregate,
      saleRecordsMissingInvoice,
      paymentAggregate,
      subscriptionAggregate,
      depositAggregate,
      trackedViews,
      previousTrackedViews,
      trackedSearches,
      trackedZeroResultSearches,
      firstTrackedEventAt,
    ] = await Promise.all([
      prismaAny.listing.count({ where: currentListingWhere }),
      prismaAny.listing.count({ where: currentCreatedListingWhere }),
      prismaAny.listing.count({ where: previousCreatedListingWhere }),
      prismaAny.listing.aggregate({
        where: liveListingWhere,
        _count: { _all: true },
        _sum: { price: true, views: true },
      }),
      prismaAny.listing.groupBy({ by: ['status'], where: currentListingWhere, _count: { _all: true } }),
      prismaAny.lead.count({ where: currentLeadWhere }),
      prismaAny.lead.count({ where: previousLeadWhere }),
      prismaAny.lead.groupBy({ by: ['status'], where: currentLeadWhere, _count: { _all: true } }),
      prismaAny.listing.groupBy({
        by: ['brandId', 'modelId', 'manufacturingYear'],
        where: liveListingWhere,
        _count: { _all: true },
        _sum: { views: true },
        _avg: { price: true },
      }),
      prismaAny.listing.findMany({
        where: currentListingWhere,
        orderBy: [{ views: 'desc' }, { updatedAt: 'desc' }],
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          price: true,
          views: true,
          manufacturingYear: true,
          locationCity: true,
          locationState: true,
          brand: { select: { id: true, name: true } },
          model: { select: { id: true, name: true } },
          partner: {
            select: {
              id: true,
              name: true,
              role: true,
              partnerProfile: { select: { businessName: true, partnerType: true } },
              customerPrimeSubscriptions: {
                where: { status: 'ACTIVE' },
                select: { id: true },
              },
            },
          },
          _count: { select: { leads: true } },
        },
      }),
      prismaAny.saleRecord.aggregate({
        where: {
          soldAt: { gte: filters.from, lte: filters.to },
          ...(hasListingScopeFilters(filters)
            ? { listing: getScopedListingWhere(filters) }
            : {}),
        },
        _count: { _all: true },
        _sum: { soldPrice: true },
      }),
      prismaAny.saleRecord.count({
        where: {
          soldAt: { gte: filters.from, lte: filters.to },
          invoiceNo: null,
          ...(hasListingScopeFilters(filters)
            ? { listing: getScopedListingWhere(filters) }
            : {}),
        },
      }),
      prismaAny.listingPaymentSubmission.aggregate({
        where: {
          submittedAt: { gte: filters.from, lte: filters.to },
          status: { in: ['PAID', 'APPROVED'] },
          ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
          ...(hasListingScopeFilters(filters) ? { listing: getScopedListingWhere(filters) } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      req.user.role === 'PARTNER'
        ? Promise.resolve({ _count: { _all: 0 }, _sum: { paidAmount: null } })
        : prismaAny.customerPrimeSubscription.aggregate({
            where: { submittedAt: { gte: filters.from, lte: filters.to }, status: 'ACTIVE' },
            _count: { _all: true },
            _sum: { paidAmount: true },
          }),
      prismaAny.partnerDeposit.aggregate({
        where: {
          createdAt: { gte: filters.from, lte: filters.to },
          ...(filters.partnerId ? { partnerProfile: { userId: filters.partnerId } } : {}),
        },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      safeEventCount({
        eventType: 'LISTING_VIEW',
        occurredAt: { gte: filters.from, lte: filters.to },
        ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
      }),
      safeEventCount({
        eventType: 'LISTING_VIEW',
        occurredAt: { gte: previous.from, lte: previous.to },
        ...(filters.partnerId ? { partnerId: filters.partnerId } : {}),
      }),
      safeEventCount({ eventType: 'SEARCH', occurredAt: { gte: filters.from, lte: filters.to } }),
      safeEventCount({ eventType: 'SEARCH', resultCount: 0, occurredAt: { gte: filters.from, lte: filters.to } }),
      safeEventFirstDate(),
    ]);

    const modelIds = [...new Set(modelYearGroups.map((item: any) => item.modelId))];
    const brandIds = [...new Set(modelYearGroups.map((item: any) => item.brandId))];
    const [models, brands] = await Promise.all([
      prismaAny.model.findMany({ where: { id: { in: modelIds } }, select: { id: true, name: true } }),
      prismaAny.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } }),
    ]);
    const modelLabels = new Map(models.map((item: any) => [item.id, item.name]));
    const brandLabels = new Map(brands.map((item: any) => [item.id, item.name]));

    const leadListingGroups = await prismaAny.lead.groupBy({ by: ['listingId'], where: currentLeadWhere, _count: { _all: true } });
    const leadListingIds = leadListingGroups.map((item: any) => item.listingId).filter(Boolean);
    const leadListingMeta = await prismaAny.listing.findMany({
      where: { id: { in: leadListingIds } },
      select: { id: true, modelId: true, manufacturingYear: true },
    });
    const leadCountByDimension = new Map<string, number>();
    const leadWonByDimension = new Map<string, number>();
    if (leadListingIds.length) {
      const leadRows = await prismaAny.lead.findMany({
        where: { ...currentLeadWhere, listingId: { in: leadListingIds } },
        select: { status: true, listingId: true },
      });
      const listingMetaById = new Map<string, { modelId: string; manufacturingYear: number }>(
        leadListingMeta.map((item: any) => [item.id, item] as [string, { modelId: string; manufacturingYear: number }]),
      );
      for (const lead of leadRows) {
        const listing = listingMetaById.get(lead.listingId);
        if (!listing) continue;
        const key = `${listing.modelId}:${listing.manufacturingYear}`;
        leadCountByDimension.set(key, (leadCountByDimension.get(key) || 0) + 1);
        if (lead.status === 'WON') leadWonByDimension.set(key, (leadWonByDimension.get(key) || 0) + 1);
      }
    }

    const modelYear = modelYearGroups
      .map((item: any) => {
        const key = `${item.modelId}:${item.manufacturingYear}`;
        const leads = leadCountByDimension.get(key) || 0;
        const wonLeads = leadWonByDimension.get(key) || 0;
        const views = Number(item._sum?.views || 0);
        const inventory = Number(item._count?._all || 0);
        return {
          brandId: item.brandId,
          brand: brandLabels.get(item.brandId) || 'Unknown brand',
          modelId: item.modelId,
          model: modelLabels.get(item.modelId) || 'Unknown model',
          manufacturingYear: item.manufacturingYear,
          inventory,
          views,
          leads,
          wonLeads,
          conversionRate: calculateConversionRate(wonLeads, leads),
          averagePrice: Number(item._avg?.price || 0),
          demandScore: calculateDemandScore({ views, leads, wonLeads }),
          demandPerStock: calculateDemandPerStock(calculateDemandScore({ views, leads, wonLeads }), inventory),
        };
      })
      .sort((left: any, right: any) => right.demandScore - left.demandScore);

    const listingStatusBreakdown = listingStatusGroups.map((item: any) => ({ status: item.status, count: item._count?._all || 0 }));
    const leadStatusBreakdown = leadStatusGroups.map((item: any) => ({ status: item.status, count: item._count?._all || 0 }));
    const wonLeads = leadStatusBreakdown.find((item: any) => item.status === 'WON')?.count || 0;
    const liveInventoryValue = Number(liveInventory._sum?.price || 0);
    const legacyViews = Number(liveInventory._sum?.views || 0);
    const trackedViewKpi = makeKpi(trackedViews, previousTrackedViews);

    return res.json({
      filters: {
        from: filters.from.toISOString(),
        to: filters.to.toISOString(),
        previousFrom: previous.from.toISOString(),
        previousTo: previous.to.toISOString(),
        dimensions: filters,
      },
      summary: {
        inventory: makeKpi(totalListings, totalListings),
        listingsCreated: makeKpi(createdListings, previousCreatedListings),
        liveListings: liveInventory._count?._all || 0,
        liveInventoryValue,
        legacyViews,
        trackedViews: trackedViewKpi,
        leads: makeKpi(leadCount, previousLeadCount),
        activeLeads: leadStatusBreakdown
          .filter((item: any) => ['NEW', 'CONTACTED', 'INTERESTED', 'INSPECTION_SCHEDULED'].includes(item.status))
          .reduce((sum: number, item: any) => sum + item.count, 0),
        wonLeads,
        conversionRate: calculateConversionRate(wonLeads, leadCount),
        trackedSearches,
        trackedZeroResultSearches,
        soldCount: saleAggregate._count?._all || 0,
        soldValue: Number(saleAggregate._sum?.soldPrice || 0),
        paymentCount: paymentAggregate._count?._all || 0,
        paymentAmount: Number(paymentAggregate._sum?.amount || 0),
        primeSubscriptionCount: subscriptionAggregate._count?._all || 0,
        primeSubscriptionAmount: Number(subscriptionAggregate._sum?.paidAmount || 0),
        depositCount: depositAggregate._count?._all || 0,
        depositAmount: Number(depositAggregate._sum?.amount || 0),
      },
      listingStatusBreakdown,
      leadStatusBreakdown,
      modelYear,
      topListings: topListings.map((listing: any) => {
        const { partnerType, isPrime } = resolvePartnerPresentation(listing.partner);

        return {
          id: listing.id,
          title: listing.title,
          status: listing.status,
          price: Number(listing.price || 0),
          views: listing.views,
          leads: listing._count?.leads || 0,
          manufacturingYear: listing.manufacturingYear,
          brand: listing.brand,
          model: listing.model,
          location: [listing.locationCity, listing.locationState].filter(Boolean).join(', '),
          partner: listing.partner?.partnerProfile?.businessName || listing.partner?.name || 'Partner',
          partnerType,
          isPrime,
        };
      }),
      financialAvailability: {
        saleRecords: 'available',
        listingPayments: 'available',
        primeSubscriptions: req.user.role === 'PARTNER' ? 'partner-scoped-unavailable' : 'available',
        deposits: 'available',
        platformRevenue: 'unavailable-from-data',
        gst: 'unavailable-from-data',
        reconciliation: 'partial-source-checks-only',
      },
      reconciliation: {
        status: saleRecordsMissingInvoice > 0 ? 'EXCEPTIONS_FOUND' : 'CHECKED',
        checked: ['sale_record_invoice_presence'],
        missingInvoiceNumberSaleRecords: saleRecordsMissingInvoice,
        unavailableChecks: ['platform_revenue_ledger', 'invoice_tax_lines', 'settlement_reconciliation'],
      },
      trackingAvailability: {
        earliestTrackedEventAt: firstTrackedEventAt,
        historicalViewTrend: firstTrackedEventAt ? 'available-from-tracking-start' : 'unavailable',
        legacyAggregateViews: 'available-without-history',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Analytics access required.' });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const filters = await parseAnalyticsFilters(req, req.user.role === 'PARTNER' ? req.user.id : undefined);
    const where = getScopedListingWhere(filters);
    const [total, listings] = await Promise.all([
      prismaAny.listing.count({ where }),
      prismaAny.listing.findMany({
        where,
        orderBy: [{ views: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          price: true,
          views: true,
          manufacturingYear: true,
          locationCity: true,
          locationState: true,
          createdAt: true,
          updatedAt: true,
          brand: { select: { name: true } },
          model: { select: { name: true } },
          partner: { select: { id: true, name: true, partnerProfile: { select: { businessName: true } } } },
          _count: { select: { leads: true } },
        },
      }),
    ]);

    return res.json({
      page,
      limit,
      total,
      items: listings.map((listing: any) => ({
        ...listing,
        price: Number(listing.price || 0),
        partner: listing.partner?.partnerProfile?.businessName || listing.partner?.name || 'Partner',
        leads: listing._count?.leads || 0,
        location: [listing.locationCity, listing.locationState].filter(Boolean).join(', '),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalyticsListingDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Analytics access required.' });
    }

    const listingId = String(req.params.id || '').trim();
    const filters = await parseAnalyticsFilters(req, req.user.role === 'PARTNER' ? req.user.id : undefined);
    const listing = await prismaAny.listing.findFirst({
      where: { id: listingId, ...getScopedListingWhere(filters) },
      select: {
        id: true,
        title: true,
        status: true,
        price: true,
        isNegotiable: true,
        views: true,
        manufacturingYear: true,
        operatingHours: true,
        address: true,
        condition: true,
        description: true,
        additionalDescription: true,
        grossPower: true,
        contactMode: true,
        locationCity: true,
        locationState: true,
        createdAt: true,
        updatedAt: true,
        soldAt: true,
        category: { select: { id: true, name: true } },
        brand: { select: { name: true } },
        model: { select: { name: true } },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            partnerProfile: {
              select: {
                businessName: true,
                ownerName: true,
                partnerType: true,
                contactPreference: true,
              },
            },
          },
        },
        media: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, url: true, type: true, slot: true, isFeatured: true },
        },
        leads: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: { id: true, status: true, enquiryType: true, createdAt: true, updatedAt: true },
        },
        saleRecord: { select: { soldPrice: true, soldAt: true, invoiceNo: true } },
        paymentSubmissions: {
          orderBy: { submittedAt: 'desc' },
          take: 100,
          select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            transactionRef: true,
            submittedAt: true,
            reviewedAt: true,
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const [trackedViews, uniqueViews, trackedViewEvents, leadStatusGroups] = await Promise.all([
      safeEventCount({ eventType: 'LISTING_VIEW', listingId }),
      safeUniqueListingViewCount(listingId),
      prismaAny.analyticsEvent.findMany({
        where: { eventType: 'LISTING_VIEW', listingId },
        orderBy: { occurredAt: 'asc' },
        take: 366,
        select: { occurredAt: true },
      }),
      prismaAny.lead.groupBy({
        by: ['status'],
        where: { listingId },
        _count: { _all: true },
      }),
    ]);

    const trackedViewTimeline = trackedViewEvents.reduce((timeline: Record<string, number>, event: { occurredAt: Date }) => {
      const day = new Date(event.occurredAt).toISOString().slice(0, 10);
      timeline[day] = (timeline[day] || 0) + 1;
      return timeline;
    }, {});

    const leadStatusBreakdown = leadStatusGroups
      .map((item: { status: string; _count?: { _all?: number } }) => ({
        status: item.status,
        count: item._count?._all || 0,
      }))
      .sort((left: { count: number }, right: { count: number }) => right.count - left.count);

    const totalLeadCount = leadStatusBreakdown.reduce((sum: number, item: { count: number }) => sum + item.count, 0);
    const activeLeadCount = leadStatusBreakdown
      .filter((item: { status: string }) => ['NEW', 'CONTACTED', 'INTERESTED', 'INSPECTION_SCHEDULED'].includes(item.status))
      .reduce((sum: number, item: { count: number }) => sum + item.count, 0);
    const wonLeadCount = leadStatusBreakdown.find((item: { status: string }) => item.status === 'WON')?.count || 0;

    return res.json({
      listing: {
        ...listing,
        price: Number(listing.price || 0),
        views: listing.views,
        trackedViews,
        saleRecord: listing.saleRecord
          ? { ...listing.saleRecord, soldPrice: Number(listing.saleRecord.soldPrice || 0) }
          : null,
        leads: listing.leads,
      },
      leadSummary: {
        total: totalLeadCount,
        active: activeLeadCount,
        won: wonLeadCount,
        conversionRate: calculateConversionRate(wonLeadCount, totalLeadCount),
      },
      leadStatusBreakdown,
      payments: listing.paymentSubmissions.map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount || 0),
      })),
      trackedViewTimeline: Object.entries(trackedViewTimeline).map(([date, count]) => ({ date, count })),
      availability: {
        uniqueViews,
        historicalImpressions: 'unavailable-from-data',
        sampledTrackedViewEvents: trackedViewEvents.length,
        trackedViewTimelineDays: Object.keys(trackedViewTimeline).length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const exportAnalyticsListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Analytics export access required.' });
    }

    const filters = await parseAnalyticsFilters(req, req.user.role === 'PARTNER' ? req.user.id : undefined);
    const listings = await prismaAny.listing.findMany({
      where: getScopedListingWhere(filters),
      orderBy: [{ views: 'desc' }, { updatedAt: 'desc' }],
      take: 5000,
      select: {
        id: true,
        title: true,
        status: true,
        price: true,
        isNegotiable: true,
        views: true,
        manufacturingYear: true,
        operatingHours: true,
        condition: true,
        grossPower: true,
        contactMode: true,
        address: true,
        locationCity: true,
        locationState: true,
        createdAt: true,
        updatedAt: true,
        soldAt: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        model: { select: { name: true } },
        partner: {
          select: {
            name: true,
            role: true,
            partnerProfile: { select: { businessName: true, partnerType: true } },
            customerPrimeSubscriptions: {
              where: { status: 'ACTIVE' },
              select: { id: true },
            },
          },
        },
        saleRecord: { select: { soldPrice: true, soldAt: true, invoiceNo: true } },
        leads: {
          where: { createdAt: { gte: filters.from, lte: filters.to } },
          select: { status: true },
        },
        paymentSubmissions: {
          where: { submittedAt: { gte: filters.from, lte: filters.to } },
          select: { amount: true, status: true },
        },
        _count: { select: { media: true, leads: true } },
      },
    });

    const leadStatusCount = (leads: any[], status: string) => leads.filter((lead) => lead.status === status).length;
    const liveSupplyByModelYear = new Map<string, number>();
    for (const listing of listings as any[]) {
      if (!['PUBLISHED', 'PAUSED', 'RESERVED'].includes(listing.status)) continue;
      const key = `${listing.model?.name || ''}:${listing.manufacturingYear}`;
      liveSupplyByModelYear.set(key, (liveSupplyByModelYear.get(key) || 0) + 1);
    }
    const rows = [
      ['Report From', 'Report To', 'Listing ID', 'Title', 'Listing Status', 'Category', 'Brand', 'Model', 'Manufacturing Year', 'Price (INR)', 'Negotiable', 'Condition', 'Operating Hours', 'Gross Power', 'Contact Mode', 'Views (Legacy Cumulative)', 'Leads (Listing Performance)', 'Selected Period Leads', 'New Leads', 'Contacted Leads', 'Interested Leads', 'Inspection Scheduled Leads', 'Won Leads', 'Lost Leads', 'Lead Conversion %', 'Demand Score', 'Live Supply (Model/Year)', 'Demand / Stock', 'Media Count', 'Location City', 'Location State', 'Address', 'Partner / Dealer', 'Partner Type', 'Prime Customer', 'Created At', 'Updated At', 'Sold At', 'Sold Price (INR)', 'Invoice Number', 'Period Payment Count', 'Period Approved/Paid Amount (INR)'],
      ...listings.map((listing: any) => {
        const leads = listing.leads || [];
        const totalLeads = leads.length;
        const wonLeads = leadStatusCount(leads, 'WON');
        const { partnerType, isPrime } = resolvePartnerPresentation(listing.partner);
        const demandScore = Number(listing.views || 0) + totalLeads * 5 + wonLeads * 10;
        const supply = liveSupplyByModelYear.get(`${listing.model?.name || ''}:${listing.manufacturingYear}`) || 0;
        const periodPayments = listing.paymentSubmissions || [];
        const approvedPaidAmount = periodPayments
          .filter((payment: any) => ['APPROVED', 'PAID'].includes(payment.status))
          .reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
        return [
          filters.from.toISOString().slice(0, 10),
          filters.to.toISOString().slice(0, 10),
          listing.id,
          listing.title,
          listing.status,
          listing.category?.name,
          listing.brand?.name,
          listing.model?.name,
          listing.manufacturingYear,
          Number(listing.price || 0),
          listing.isNegotiable ? 'Yes' : 'No',
          listing.condition,
          listing.operatingHours,
          listing.grossPower,
          listing.contactMode,
          Number(listing.views || 0),
          listing._count?.leads || 0,
          totalLeads,
          leadStatusCount(leads, 'NEW'),
          leadStatusCount(leads, 'CONTACTED'),
          leadStatusCount(leads, 'INTERESTED'),
          leadStatusCount(leads, 'INSPECTION_SCHEDULED'),
          wonLeads,
          leadStatusCount(leads, 'LOST'),
          totalLeads > 0 ? Number(((wonLeads / totalLeads) * 100).toFixed(1)) : 0,
          demandScore,
          supply,
          supply > 0 ? Number((demandScore / supply).toFixed(1)) : null,
          listing._count?.media || 0,
          listing.locationCity,
          listing.locationState,
          listing.address,
          listing.partner?.partnerProfile?.businessName || listing.partner?.name,
          partnerType,
          isPrime ? 'Yes' : 'No',
          listing.createdAt,
          listing.updatedAt,
          listing.saleRecord?.soldAt || listing.soldAt,
          listing.saleRecord ? Number(listing.saleRecord.soldPrice || 0) : null,
          listing.saleRecord?.invoiceNo,
          periodPayments.length,
          approvedPaidAmount,
        ];
      }),
    ];

    const csv = buildCsv(rows);
    const exportDate = new Date().toISOString().slice(0, 10);
    res.status(200).set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="jcb-analytics-listings-${exportDate}.csv"`,
      'Content-Length': String(Buffer.byteLength(csv, 'utf8')),
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Export-Row-Count': String(listings.length),
    }).send(csv);
  } catch (error) {
    next(error);
  }
};

export const ingestAnalyticsEvent = async (req: Request, res: Response) => {
  const eventType = String(req.body?.eventType || '').trim().toUpperCase();
  if (!ANALYTICS_EVENT_TYPES.has(eventType)) {
    return res.status(400).json({ accepted: false, error: 'Unsupported analytics event.' });
  }

  const accepted = await recordAnalyticsEvent({
    eventType,
    anonymousId: req.body?.anonymousId,
    sessionId: req.body?.sessionId,
    listingId: req.body?.listingId,
    // These ownership and catalog dimensions are never trusted from a public
    // browser payload. Server-side listing-view tracking supplies them from
    // the database; public search/filter events stay unscoped.
    query: req.body?.query,
    filterPayload: req.body?.filterPayload,
    resultCount: Number(req.body?.resultCount),
    source: req.body?.source,
  });

  return res.status(202).json({ accepted });
};
