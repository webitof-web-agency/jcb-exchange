import prisma from '../../lib/prisma';
import { analyticsPageQuestionKeys, type AnalyticsAiPageKey } from './analyticsAiPage.service';
import type { AiToolContext } from './aiReadOnlyTools.service';
import { buildAiFileAction } from './aiUiActions.service';

export type AnalyticsPageArguments = { pageKey: AnalyticsAiPageKey; days?: number; limit?: number; listingId?: string; export?: boolean };

const limitFor = (value: number | undefined) => Math.min(20, Math.max(1, Math.floor(value ?? 10)));
const dateValue = (value: Date | null | undefined) => value?.toISOString() || null;
const decimalValue = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export const getAnalyticsAiPageData = async (context: AiToolContext, args: AnalyticsPageArguments) => {
  if (context.role !== 'SUPER_ADMIN' && context.role !== 'ADMIN' && !context.permissions.includes('ALL_ACCESS') && !['analytics.read', 'dashboard.view'].some((permission) => context.permissions.includes(permission))) {
    throw new Error('Analytics page permission required.');
  }
  const limit = limitFor(args.limit);
  const base = { pageKey: args.pageKey, questionKeys: analyticsPageQuestionKeys(args.pageKey), relatedModules: ['analytics-overview', 'analytics-listing-detail'], limit };
  if (args.pageKey === 'listing-detail') {
    if (!args.listingId) return { ...base, found: false, message: 'Provide a listingId or ask from the listing analytics detail page.' };
    const listing = await prisma.listing.findUnique({ where: { id: args.listingId }, select: { id: true, title: true, status: true, price: true, views: true, manufacturingYear: true, condition: true, locationCity: true, locationState: true, createdAt: true, updatedAt: true, soldAt: true, brand: { select: { name: true } }, model: { select: { name: true } }, _count: { select: { leads: true } } } });
    if (!listing) return { ...base, found: false };
    return { ...base, found: true, item: { ...listing, price: decimalValue(listing.price), location: [listing.locationCity, listing.locationState].filter(Boolean).join(', '), createdAt: dateValue(listing.createdAt), updatedAt: dateValue(listing.updatedAt), soldAt: dateValue(listing.soldAt), leads: listing._count.leads }, insights: ['Compare views to leads before changing price.', 'Use period-scoped analytics for trend claims; a snapshot is not a forecast.'] };
  }
  const [totalListings, liveListings, inventoryValue, leads, sold, payments, listingStatus, leadStatus, topListings] = await Promise.all([
    prisma.listing.count(),
    prisma.listing.count({ where: { status: { in: ['PUBLISHED', 'PAUSED', 'RESERVED'] } } }),
    prisma.listing.aggregate({ where: { status: { in: ['PUBLISHED', 'PAUSED', 'RESERVED'] } }, _sum: { price: true } }),
    prisma.lead.count({ where: { mergedIntoId: null } }),
    prisma.saleRecord.aggregate({ _count: { _all: true }, _sum: { soldPrice: true } }),
    prisma.listingPaymentSubmission.aggregate({ where: { status: { in: ['PAID', 'APPROVED'] } }, _count: { _all: true }, _sum: { amount: true } }),
    prisma.listing.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['status'], where: { mergedIntoId: null }, _count: { _all: true } }),
    prisma.listing.findMany({ take: limit, orderBy: [{ views: 'desc' }, { updatedAt: 'desc' }], select: { id: true, title: true, status: true, price: true, views: true, manufacturingYear: true, locationCity: true, locationState: true, brand: { select: { name: true } }, model: { select: { name: true } }, _count: { select: { leads: true } } } }),
  ]);
  const exportAction = args.export ? buildAiFileAction({ label: 'Analytics listings export', fileName: 'analytics-listings.csv', mimeType: 'text/csv', url: '/api/analytics/export/listings.csv' }) : null;
  return { ...base, summary: { totalListings, liveListings, liveInventoryValue: decimalValue(inventoryValue._sum.price) || 0, leads, soldCount: sold._count._all, soldValue: decimalValue(sold._sum.soldPrice) || 0, paymentCount: payments._count._all, paymentAmount: decimalValue(payments._sum.amount) || 0 }, listingStatusBreakdown: listingStatus.map((row) => ({ status: row.status, count: row._count._all })), leadStatusBreakdown: leadStatus.map((row) => ({ status: row.status, count: row._count._all })), topListings: topListings.map((row) => ({ ...row, price: decimalValue(row.price), location: [row.locationCity, row.locationState].filter(Boolean).join(', '), leads: row._count.leads })), dataAvailability: { periodDays: Math.min(90, Math.max(1, Math.floor(args.days ?? 30))), historicalEventTrend: 'available-through-analytics-events', financialReconciliation: 'partial-source-checks-only' }, insights: ['High views with low leads indicate listing quality, price, or targeting friction.', 'Forecasts require a requested period and are returned separately with confidence and assumptions.'], ...(exportAction ? { uiActions: [exportAction] } : {}) };
};
