const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';
const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

type DealerDetailApiResponse = {
  success: boolean;
  data?: {
    id: string;
    userId?: string | null;
    businessName: string | null;
    businessLogoUrl?: string | null;
    district: string | null;
    businessAddress: string | null;
    alternateMobile?: string | null;
    user?: {
      mobile: string | null;
      name: string | null;
    } | null;
    partnerType: string | null;
    workingHours?: string | null;
    businessDescription: string | null;
    contactPreference?: string | null;
    yearsInBusiness: number | null;
    websiteUrl?: string | null;
    createdAt?: string;
    publicContact?: {
      callNumber: string | null;
      whatsappNumber: string | null;
      routingMode?: 'SUPER_ADMIN' | 'SELLER';
      fallbackApplied?: boolean;
    } | null;
  } | null;
};

type DealerListingsApiResponse = {
  success: boolean;
  data?: Array<{
    id: string;
    title: string;
    price: number;
    isNegotiable: boolean;
    manufacturingYear: number;
    operatingHours: number | null;
    locationCity: string;
    locationState: string;
    condition: string | null;
    status: string;
    brandName: string;
    modelName: string;
    categoryName: string;
    sellerName: string;
    sellerType: string;
    thumbnailUrl: string | null;
  }>;
};

export const getAbsoluteDealerAssetUrl = (url?: string | null) => {
  if (!url) {
    return '';
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${API_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const getDealerDetail = async (dealerId: string) => {
  if (!dealerId) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/master/dealers/${dealerId}`, {
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch dealer ${dealerId}.`);
  }

  const payload = (await response.json()) as DealerDetailApiResponse;
  if (!payload.success || !payload.data) {
    return null;
  }

  return payload.data;
};

export const getDealerListings = async (dealerId: string) => {
  if (!dealerId) {
    return [];
  }

  const response = await fetch(`${API_BASE_URL}/master/dealers/${dealerId}/listings`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as DealerListingsApiResponse;
  return payload.success && Array.isArray(payload.data) ? payload.data : [];
};
