import { cache } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

type ApiResponse<T> = {
  success: boolean;
  data?: T | null;
  error?: string;
};

export type ListingMedia = {
  id: string;
  type: string;
  url: string;
  isFeatured?: boolean;
  createdAt?: string;
};

export type ListingPartner = {
  id?: string;
  name?: string | null;
  partnerType?: string | null;
  district?: string | null;
  address?: string | null;
  mobile?: string | null;
  whatsapp?: string | null;
  alternateMobile?: string | null;
  logo?: string | null;
  description?: string | null;
  workingHours?: string | null;
};

export type MachineListingDetail = {
  id: string;
  title: string;
  price: number;
  isNegotiable: boolean;
  manufacturingYear: number | null;
  operatingHours: number | null;
  locationCity: string | null;
  locationState: string | null;
  condition: string | null;
  description: string | null;
  additionalDescription: string | null;
  grossPower: string | null;
  status: string;
  views?: number;
  category: {
    id: string;
    name: string;
  } | null;
  brand: {
    id: string;
    name: string;
  } | null;
  model: {
    id: string;
    name: string;
  } | null;
  partner: ListingPartner | null;
  publicContact: {
    callNumber: string | null;
    whatsappNumber: string | null;
    routingMode: 'SUPER_ADMIN' | 'SELLER';
    fallbackApplied: boolean;
  };
  media: ListingMedia[];
  featuredImage: string | null;
  mediaCount: number;
  createdAt: string;
  updatedAt: string;
  saleRecord?: {
    buyerName: string;
    buyerCity: string | null;
    buyerState: string | null;
    soldAt: string;
    soldPrice: number;
  } | null;
};

export const getAbsoluteMediaUrl = (url?: string | null) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const getMachineListing = cache(async (id: string): Promise<MachineListingDetail | null> => {
  if (!id) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/master/public-listings/${id}`, {
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch listing ${id}.`);
  }

  const payload = (await response.json()) as ApiResponse<MachineListingDetail>;
  if (!payload.success || !payload.data) {
    return null;
  }

  return payload.data;
});
