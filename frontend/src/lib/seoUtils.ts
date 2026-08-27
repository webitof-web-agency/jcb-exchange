import {
  buildSlugSegments,
  buildSlugWithShortSuffix,
  parseRouteParam,
  slugify,
} from './routeSlug';

export { slugify };

export interface MachineListingSlugData {
  id: string;
  title?: string | null;
  manufacturingYear?: number | string | null;
  locationCity?: string | null;
}

export interface DealerSlugData {
  id: string;
  userId?: string | null;
  businessName?: string | null;
  district?: string | null;
}

export const generateMachineSlugPath = (machine: MachineListingSlugData): string => {
  const slug = buildSlugSegments(machine.title, machine.manufacturingYear, machine.locationCity);
  return `/machines/${buildSlugWithShortSuffix(slug || 'machine', machine.id)}`;
};

export const generateMachineShortSlugPath = (machine: MachineListingSlugData): string => {
  const slug = buildSlugSegments(machine.title, machine.manufacturingYear, machine.locationCity);
  return `/machines/${buildSlugWithShortSuffix(slug || 'machine', machine.id)}`;
};

export const generateDealerSlugPath = (dealer: DealerSlugData): string => {
  const slug = buildSlugSegments(dealer.businessName, dealer.district);
  return `/dealers/${buildSlugWithShortSuffix(slug || 'dealer', dealer.userId || dealer.id)}`;
};

export const extractIdFromSlug = (slugOrId: string): string => {
  return parseRouteParam(slugOrId).id || slugOrId;
};

export const parseMachineRouteParam = (slugOrId: string) => parseRouteParam(slugOrId);
