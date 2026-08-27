import type { MetadataRoute } from "next";
import { generateDealerSlugPath, generateMachineSlugPath } from "@/lib/seoUtils";

const SITE_URL = "https://jcbexchange.com";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002/api";

type PublicListing = {
  id: string;
  title?: string | null;
  manufacturingYear?: number | string | null;
  locationCity?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type PublicDealer = {
  id: string;
  businessName?: string | null;
  district?: string | null;
};

const staticRoutes = (): MetadataRoute.Sitemap => [
  {
    url: `${SITE_URL}/`,
    changeFrequency: "daily",
    priority: 1,
    lastModified: new Date(),
  },
  {
    url: `${SITE_URL}/machines`,
    changeFrequency: "daily",
    priority: 0.9,
    lastModified: new Date(),
  },
  {
    url: `${SITE_URL}/dealers`,
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: new Date(),
  },
  {
    url: `${SITE_URL}/categories`,
    changeFrequency: "weekly",
    priority: 0.8,
    lastModified: new Date(),
  },
  {
    url: `${SITE_URL}/sold-vehicles`,
    changeFrequency: "weekly",
    priority: 0.7,
    lastModified: new Date(),
  },
];

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listingPayload, dealerPayload] = await Promise.all([
    fetchJson<{ success: boolean; data?: PublicListing[] }>("/master/public-listings"),
    fetchJson<{ success: boolean; data?: PublicDealer[] }>("/master/dealers"),
  ]);

  const listings = listingPayload?.success ? listingPayload.data || [] : [];
  const dealers = dealerPayload?.success ? dealerPayload.data || [] : [];

  const listingRoutes: MetadataRoute.Sitemap = listings.map((listing) => ({
    url: `${SITE_URL}${generateMachineSlugPath(listing)}`,
    changeFrequency: "daily",
    priority: 0.8,
    lastModified: listing.updatedAt
      ? new Date(listing.updatedAt)
      : listing.createdAt
        ? new Date(listing.createdAt)
        : new Date(),
  }));

  const dealerRoutes: MetadataRoute.Sitemap = dealers.map((dealer) => ({
    url: `${SITE_URL}${generateDealerSlugPath(dealer)}`,
    changeFrequency: "weekly",
    priority: 0.7,
    lastModified: new Date(),
  }));

  return [...staticRoutes(), ...listingRoutes, ...dealerRoutes];
}
