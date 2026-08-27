import { buildSlugSegments, buildSlugWithShortSuffix } from '@/lib/routeSlug';

type ListingRouteInput = {
  id: string;
  title?: string | null;
  manufacturingYear?: number | string | null;
  locationCity?: string | null;
};

type PartnerRouteInput = {
  id: string;
  name?: string | null;
  businessName?: string | null;
  district?: string | null;
};

type VisitorRouteInput = {
  id: string;
  fullName?: string | null;
  name?: string | null;
  city?: string | null;
};

type LeadRouteInput = {
  id: string;
  customerName?: string | null;
  listingTitle?: string | null;
};

const joinDetailPath = (basePath: string, slugValue: string) => `${basePath}/${slugValue}`;

export const generateAdminListingDetailPath = (basePath: string, listing: ListingRouteInput): string => {
  const slug = buildSlugSegments(listing.title, listing.manufacturingYear, listing.locationCity);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'listing', listing.id));
};

export const generateAdminPartnerDetailPath = (basePath: string, partner: PartnerRouteInput): string => {
  const slug = buildSlugSegments(partner.businessName || partner.name, partner.district);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'partner', partner.id));
};

export const generateAdminPartnerEditPath = (basePath: string, partner: PartnerRouteInput): string => {
  return `${generateAdminPartnerDetailPath(basePath, partner)}/edit`;
};

export const generateAdminVisitorDetailPath = (basePath: string, visitor: VisitorRouteInput): string => {
  const slug = buildSlugSegments(visitor.fullName || visitor.name, visitor.city);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'visitor', visitor.id));
};

export const generateAdminLeadDetailPath = (basePath: string, lead: LeadRouteInput): string => {
  const slug = buildSlugSegments(lead.customerName, lead.listingTitle);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'enquiry', lead.id));
};
