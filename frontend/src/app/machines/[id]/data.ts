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
  address?: string | null;
  locationCity: string | null;
  locationState: string | null;
  condition: string | null;
  description: string | null;
  additionalDescription: string | null;
  grossPower: string | null;
  fuelType?: string | null;
  transmission?: string | null;
  currentAvailability?: string | null;
  variant?: string | null;
  registrationYear?: string | null;
  registrationNo?: string | null;
  chassisOrSerialNo?: string | null;
  previousOwners?: string | null;
  pinCode?: string | null;
  nearbyLandmark?: string | null;
  insuranceExpiry?: string | null;
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
  buyNowPaymentAvailable?: boolean;
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
  vehicleCompliance?: {
    vehicleNumber: string | null;
    hirePurchaseStatus: string | null;
    taxStatus: string | null;
    taxValidUntil: string | null;
    fitnessStatus: string | null;
    fitnessValidUntil: string | null;
    insuranceStatus: string | null;
    insuranceValidUntil: string | null;
    pucStatus: string | null;
    pucValidUntil: string | null;
    hsrpStatus: string | null;
    rtoOffice: string | null;
    rtoAgentName: string | null;
    vehicleMaintenanceCost: number | null;
    rtoExpenses: number | null;
  } | null;
};

export const getAbsoluteMediaUrl = (url?: string | null) => {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl || /^\/?(?:api\/)?uploads(?:\/|$)/i.test(normalizedUrl)) return '';

  if (/^https?:\/\//i.test(normalizedUrl)) {
    try {
      if (/^\/uploads(?:\/|$)/i.test(new URL(normalizedUrl).pathname)) {
        return '';
      }
    } catch {
      return '';
    }

    return normalizedUrl;
  }

  return `${API_ORIGIN}${normalizedUrl.startsWith('/') ? '' : '/'}${normalizedUrl}`;
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
