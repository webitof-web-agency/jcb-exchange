import { Prisma } from '@prisma/client';
import {
  normalizeSellAccountExpenseBreakdown,
  sumSellAccountExpenseBreakdown,
  type SellAccountExpenseBreakdown,
} from '../services/sellAccountFinance';

/**
 * A partner/customer lists a vehicle at their own price. At approval the admin adds a margin
 * and expenses (transport, paperwork, RTO work, other), and buyers see the final price:
 *   final price = seller price + margin + expenses
 * Buyers may see the expenses, but never the seller's price or the margin.
 */

export type ListingExpenseBreakdown = SellAccountExpenseBreakdown;

export interface ListingPricingSource {
  price?: unknown;
  adminMarginAmount?: unknown;
  adminExpenseAmount?: unknown;
  adminExpenseBreakdown?: unknown;
}

const money = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
};

export const getListingPricing = (listing: ListingPricingSource) => {
  const sellerPrice = money(listing.price);
  const marginAmount = money(listing.adminMarginAmount);
  const expenseBreakdown = normalizeSellAccountExpenseBreakdown(listing.adminExpenseBreakdown);
  const expenseAmount = expenseBreakdown ? sumSellAccountExpenseBreakdown(expenseBreakdown) : money(listing.adminExpenseAmount);

  return {
    sellerPrice,
    marginAmount,
    expenseAmount,
    expenseBreakdown,
    finalPrice: money(sellerPrice + marginAmount + expenseAmount),
  };
};

/** The amount a buyer is shown and charged. */
export const getListingFinalPrice = (listing: ListingPricingSource) => getListingPricing(listing).finalPrice;

/** What the public marketplace may reveal: final price and expenses only. */
export const getPublicListingPricing = (listing: ListingPricingSource) => {
  const { finalPrice, expenseAmount, expenseBreakdown } = getListingPricing(listing);
  return { finalPrice, expenseAmount, expenseBreakdown };
};

/** Prisma `select` fragment needed by getListingPricing. */
export const listingPricingSelect = {
  price: true,
  adminMarginAmount: true,
  adminExpenseAmount: true,
  adminExpenseBreakdown: true,
} as const;

/**
 * Reads `adminMarginAmount` and `adminExpenseBreakdown` (or a plain `adminExpenseAmount`)
 * from an admin request body. Returns null when the body carries no pricing fields.
 */
export const parseListingPricingInput = (body: Record<string, unknown> | null | undefined) => {
  const source = body || {};
  const has = (field: string) => Object.prototype.hasOwnProperty.call(source, field);
  if (!has('adminMarginAmount') && !has('adminExpenseBreakdown') && !has('adminExpenseAmount')) {
    return null;
  }

  for (const field of ['adminMarginAmount', 'adminExpenseAmount']) {
    const raw = source[field];
    if (has(field) && raw !== null && raw !== '' && !(Number.isFinite(Number(raw)) && Number(raw) >= 0)) {
      return { error: 'Margin and expenses must be zero or a positive amount.' as const };
    }
  }

  const expenseBreakdown = normalizeSellAccountExpenseBreakdown(source.adminExpenseBreakdown);
  return {
    adminMarginAmount: money(source.adminMarginAmount),
    adminExpenseBreakdown: expenseBreakdown ?? Prisma.DbNull,
    adminExpenseAmount: expenseBreakdown ? sumSellAccountExpenseBreakdown(expenseBreakdown) : money(source.adminExpenseAmount),
  };
};

/**
 * A partner/customer changing the price of an approved listing sends it back for approval,
 * so the admin can recheck the margin. Sold listings are left alone.
 */
export const shouldResubmitListingForPriceChange = ({
  isAdmin,
  previousStatus,
  nextStatus,
  previousPrice,
  nextPrice,
}: {
  isAdmin: boolean;
  previousStatus?: string | null;
  nextStatus?: string | null;
  previousPrice: unknown;
  nextPrice: unknown;
}) => {
  if (isAdmin) return false;
  if (money(previousPrice) === money(nextPrice)) return false;
  const previous = String(previousStatus || '').toUpperCase();
  const next = String(nextStatus || '').toUpperCase();
  return ['PUBLISHED', 'PAUSED', 'RESERVED'].includes(previous) && next !== 'SOLD';
};
