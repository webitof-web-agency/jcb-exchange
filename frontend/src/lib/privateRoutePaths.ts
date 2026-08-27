import { buildSlugSegments, buildSlugWithShortSuffix } from '@/lib/routeSlug';

type ProfileListingRouteInput = {
  id: string;
  title?: string | null;
  manufacturingYear?: number | string | null;
  locationCity?: string | null;
};

export const generateProfileListingDetailPath = (listing: ProfileListingRouteInput): string => {
  const slug = buildSlugSegments(listing.title, listing.manufacturingYear, listing.locationCity);
  return `/profile/listings/${buildSlugWithShortSuffix(slug || 'listing', listing.id)}`;
};
