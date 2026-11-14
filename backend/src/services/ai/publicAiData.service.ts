import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { getPublicListingPricing } from '../../utils/listingPricing';
import { getPublicMarketplaceAvailableListingWhere } from '../../utils/publicListingVisibility';
import { getCachedPublicFeed } from '../../utils/publicListingsCache';
import { buildPublicBuyerResult, buildPublicSupportResult, parsePublicBuyerQuery, publicBuyerModeFor, type PublicBuyerListing } from './publicAiAssistant.service';
import { parseKnowledgeSources } from './aiKnowledge.service';

const loadPublicBuyerFeed = async (): Promise<PublicBuyerListing[]> => {
  const feed = await getCachedPublicFeed('ai-buyer-available', async () => {
    const listings = await prisma.listing.findMany({
      where: getPublicMarketplaceAvailableListingWhere() as Prisma.ListingWhereInput,
      select: {
        id: true,
        title: true,
        price: true,
        adminMarginAmount: true,
        adminExpenseAmount: true,
        adminExpenseBreakdown: true,
        manufacturingYear: true,
        operatingHours: true,
        locationCity: true,
        locationState: true,
        condition: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        model: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      price: getPublicListingPricing(listing).finalPrice,
      manufacturingYear: listing.manufacturingYear,
      operatingHours: listing.operatingHours,
      locationCity: listing.locationCity,
      locationState: listing.locationState,
      condition: listing.condition,
      category: listing.category,
      brand: listing.brand,
      model: listing.model,
    }));
  });

  return feed.items;
};

const unique = (values: Array<string | null | undefined>) => Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));

export const searchPublicBuyerListings = async (message: string) => {
  const feed = await loadPublicBuyerFeed();
  const intent = parsePublicBuyerQuery(message, {
    categories: unique(feed.map((listing) => listing.category?.name)),
    brands: unique(feed.map((listing) => listing.brand?.name)),
    models: unique(feed.map((listing) => listing.model?.name)),
    locations: unique(feed.flatMap((listing) => [listing.locationCity, listing.locationState, [listing.locationCity, listing.locationState].filter(Boolean).join(', ')])),
  });
  return { intent, ...buildPublicBuyerResult(feed, intent, { mode: publicBuyerModeFor(message) }) };
};

export const searchPublicSupport = async (message: string) => buildPublicSupportResult(
  message,
  parseKnowledgeSources(process.env.AI_PUBLIC_KNOWLEDGE_SOURCES_JSON),
);
