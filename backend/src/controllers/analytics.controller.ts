import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';

const prismaAny = prisma as any;

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
          listing.media.find((media: any) => media.type === 'IMAGE' && media.isFeatured)?.url ||
          listing.media.find((media: any) => media.type === 'IMAGE')?.url ||
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
