import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import SoldVehiclesPageClient from './SoldVehiclesPageClient';

export const metadata: Metadata = {
  title: 'Sold Vehicles & Equipment',
  description: 'Explore verified heavy machinery and JCB equipment successfully sold through JCB Exchange across India.',
  alternates: {
    canonical: '/sold-vehicles',
  },
  openGraph: {
    title: 'Sold Vehicles & Equipment | JCB Exchange',
    description: 'Explore verified heavy machinery and JCB equipment successfully sold through JCB Exchange across India.',
    url: 'https://jcbexchange.com/sold-vehicles',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sold Vehicles & Equipment | JCB Exchange',
    description: 'Explore verified heavy machinery and JCB equipment successfully sold through JCB Exchange across India.',
  },
};

export default function SoldVehiclesPage() {
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Sold Vehicles & Equipment | JCB Exchange',
    description: 'Explore verified heavy machinery and JCB equipment successfully sold through JCB Exchange across India.',
    url: 'https://jcbexchange.com/sold-vehicles',
    isPartOf: {
      '@id': 'https://jcbexchange.com/#website',
    },
    about: {
      '@type': 'Thing',
      name: 'Sold heavy machinery listings',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
        <SoldVehiclesPageClient />
      </Suspense>
      </>
    );
}
