import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { hasRequirement, listingMatch, type Requirement } from '../rules';
import { toNumber } from './common';
import { getListingFinalPrice, listingPricingSelect } from '../../../utils/listingPricing';

type LeadRequirementFields = {
  categoryId: string | null;
  brandId: string | null;
  modelId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  budgetMin: Prisma.Decimal | null;
  budgetMax: Prisma.Decimal | null;
  requirementState: string | null;
  requirementCity: string | null;
};

export const requirementOf = (lead: LeadRequirementFields): Requirement => ({
  categoryId: lead.categoryId,
  brandId: lead.brandId,
  modelId: lead.modelId,
  yearFrom: lead.yearFrom,
  yearTo: lead.yearTo,
  budgetMin: toNumber(lead.budgetMin),
  budgetMax: toNumber(lead.budgetMax),
  state: lead.requirementState,
  city: lead.requirementCity,
});

/** Published listings that fit a lead's requirement, best fit first. */
export const findMatchingListings = async (lead: LeadRequirementFields, options: { limit?: number; excludeIds?: string[]; publishedSince?: Date } = {}) => {
  const requirement = requirementOf(lead);
  if (!hasRequirement(requirement)) return [];
  const where: Prisma.ListingWhereInput = {
    status: 'PUBLISHED',
    ...(requirement.categoryId ? { categoryId: requirement.categoryId } : {}),
    ...(requirement.brandId ? { brandId: requirement.brandId } : {}),
    ...(requirement.modelId ? { modelId: requirement.modelId } : {}),
    ...(requirement.yearFrom || requirement.yearTo
      ? { manufacturingYear: { ...(requirement.yearFrom ? { gte: requirement.yearFrom } : {}), ...(requirement.yearTo ? { lte: requirement.yearTo } : {}) } }
      : {}),
    // Seller price <= final price, so this pre-filter never drops a listing the budget check below keeps.
    ...(requirement.budgetMax ? { price: { lte: new Prisma.Decimal(Math.ceil(requirement.budgetMax * 1.1)) } } : {}),
    ...(options.excludeIds?.length ? { id: { notIn: options.excludeIds } } : {}),
    ...(options.publishedSince ? { updatedAt: { gte: options.publishedSince } } : {}),
  };
  const listings = await prisma.listing.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      id: true, title: true, ...listingPricingSelect, manufacturingYear: true, locationState: true, locationCity: true,
      categoryId: true, brandId: true, modelId: true, operatingHours: true,
      brand: { select: { name: true } }, model: { select: { name: true } }, category: { select: { name: true } },
    },
  });
  return listings
    // Buyers are matched on, and offered, the final price; the margin itself is dropped.
    .map(({ adminMarginAmount, adminExpenseAmount, adminExpenseBreakdown, ...listing }) => ({
      ...listing,
      price: getListingFinalPrice({ price: listing.price, adminMarginAmount, adminExpenseAmount, adminExpenseBreakdown }),
    }))
    .map((listing) => ({ listing, score: listingMatch(requirement, listing) }))
    .filter((row): row is { listing: typeof row.listing; score: number } => row.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 10)
    .map(({ listing, score }) => ({ ...listing, matchScore: score }));
};
