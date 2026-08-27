import type { Metadata } from 'next';
import { Suspense } from 'react';
import MachinesPageClient from './MachinesPageClient';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api';

type MachinesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PublicCategory = {
  id: string;
  name: string;
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

export async function generateMetadata({
  searchParams,
}: MachinesPageProps): Promise<Metadata> {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const categoryId = normalizeParam(resolvedSearchParams.category).trim();
  const query = normalizeParam(resolvedSearchParams.q).trim();
  const location = normalizeParam(resolvedSearchParams.location).trim();

  const hasSearchIntent = query.length > 0 || location.length > 0;
  const categories = categoryId ? await fetchPublicCategories() : [];
  const matchedCategory = categoryId
    ? categories.find((category) => category.id === categoryId)
    : null;

  const canonical = matchedCategory && !hasSearchIntent
    ? `/machines?category=${encodeURIComponent(categoryId)}`
    : '/machines';

  const title = matchedCategory && !hasSearchIntent
    ? `${matchedCategory.name} Machines for Sale`
    : 'Used Machines for Sale';

  const description = matchedCategory && !hasSearchIntent
    ? `Browse verified ${matchedCategory.name.toLowerCase()} listings, prices, and machine details across India on JCB Exchange.`
    : 'Explore verified used JCBs, excavators, loaders, and heavy machinery for sale across India on JCB Exchange.';

  const shouldIndex = !hasSearchIntent;

  return {
    title,
    description,
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
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | JCB Exchange`,
      description,
    },
  };
}

export default function MachinesPage() {
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Used Machines for Sale | JCB Exchange',
    description: 'Explore verified used JCBs, excavators, loaders, and heavy machinery for sale across India on JCB Exchange.',
    url: 'https://jcbexchange.com/machines',
    isPartOf: {
      '@id': 'https://jcbexchange.com/#website',
    },
    about: {
      '@type': 'Thing',
      name: 'Used heavy machinery marketplace',
    },
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
