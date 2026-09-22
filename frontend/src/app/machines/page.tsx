import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SITE_KEYWORDS, SITE_NAME, SITE_OG_IMAGE, SITE_URL } from '@/lib/site';
import { extractIdFromSlug, generateCategoryMachinesPath, parseMachineRouteParam, slugify } from '@/lib/seoUtils';
import MachinesPageClient from './MachinesPageClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';

type MachinesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PublicCategory = {
  id: string;
  name: string;
  slug?: string;
};

const normalizeParam = (value?: string | string[]) => {
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return value || '';
};

const fetchPublicCategories = async (): Promise<PublicCategory[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/master/public-categories`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { success?: boolean; data?: PublicCategory[] };
    return payload.success && Array.isArray(payload.data) ? payload.data : [];
  } catch {
    return [];
  }
};

const findCategoryByParam = (categories: PublicCategory[], value: string) => {
  const parsed = parseMachineRouteParam(value);
  const extractedId = extractIdFromSlug(value);
  const normalizedSlug = slugify(parsed.slug || value);

  return categories.find((category) =>
    category.id.startsWith(extractedId) ||
    slugify(category.slug || category.name) === normalizedSlug,
  ) || null;
};

export async function generateMetadata({
  searchParams,
}: MachinesPageProps): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const categoryIdOrSlug = normalizeParam(resolvedSearchParams.category).trim();
  const query = normalizeParam(resolvedSearchParams.q).trim();
  const location = normalizeParam(resolvedSearchParams.location).trim();

  const hasSearchIntent = query.length > 0 || location.length > 0;
  const categories = categoryIdOrSlug ? await fetchPublicCategories() : [];
  
  const matchedCategory = categoryIdOrSlug
    ? findCategoryByParam(categories, categoryIdOrSlug)
    : null;

  const canonical = matchedCategory && !hasSearchIntent
    ? generateCategoryMachinesPath(matchedCategory)
    : '/machines';

  const title = matchedCategory && !hasSearchIntent
    ? `${matchedCategory.name} Machines for Sale`
    : 'Used Machines for Sale';

  const description = matchedCategory && !hasSearchIntent
    ? `Browse verified ${matchedCategory.name.toLowerCase()} listings, prices, and machine details across India on JCB Exchange.`
    : 'Explore verified used JCBs, pre-owned construction machines, loaders, and heavy machinery for sale across India on JCB Exchange.';

  const shouldIndex = !hasSearchIntent;

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    keywords: [...SITE_KEYWORDS, title],
    alternates: {
      canonical,
    },
    robots: {
      index: shouldIndex,
      follow: true,
      googleBot: {
        index: shouldIndex,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      title: `${title} | JCB Exchange`,
      description,
      url: `https://jcbexchange.com${canonical}`,
      siteName: SITE_NAME,
      locale: 'en_IN',
      type: 'website',
      images: [
        {
          url: SITE_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${title} on ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | JCB Exchange`,
      description,
      images: [SITE_OG_IMAGE],
    },
    applicationName: SITE_NAME,
    category: 'marketplace',
  };
}

export default async function MachinesPage({ searchParams }: MachinesPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const categoryIdOrSlug = normalizeParam(resolvedSearchParams.category).trim();
  const query = normalizeParam(resolvedSearchParams.q).trim();
  const location = normalizeParam(resolvedSearchParams.location).trim();
  const categories = categoryIdOrSlug ? await fetchPublicCategories() : [];
  const matchedCategory = categoryIdOrSlug
    ? findCategoryByParam(categories, categoryIdOrSlug)
    : null;
  const hasSearchIntent = query.length > 0 || location.length > 0;
  const canonical = matchedCategory && !hasSearchIntent
    ? generateCategoryMachinesPath(matchedCategory)
    : '/machines';
  const pageTitle = matchedCategory && !hasSearchIntent
    ? `${matchedCategory.name} Machines for Sale`
    : 'Used Machines for Sale';
  const pageDescription = matchedCategory && !hasSearchIntent
    ? `Browse verified ${matchedCategory.name.toLowerCase()} listings, prices, and machine details across India on JCB Exchange.`
    : 'Explore verified used JCBs, pre-owned construction machines, loaders, and heavy machinery for sale across India on JCB Exchange.';

  if (matchedCategory && !hasSearchIntent && categoryIdOrSlug !== canonical.split('category=')[1]) {
    redirect(canonical);
  }

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${canonical}#collection`,
        name: `${pageTitle} | ${SITE_NAME}`,
        description: pageDescription,
        url: `${SITE_URL}${canonical}`,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        about: {
          '@type': 'Thing',
          name: matchedCategory?.name || 'Used heavy machinery marketplace',
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_URL}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: matchedCategory?.name ? `${matchedCategory.name} Machines` : 'Machines',
            item: `${SITE_URL}${canonical}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <Suspense fallback={<div className="min-h-screen bg-[#f3f4f6]" />}>
        <MachinesPageClient />
      </Suspense>
    </>
  );
}
