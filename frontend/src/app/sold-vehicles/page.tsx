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
      <section className="bg-[#F8FAFC] px-4 pb-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
            <div className="max-w-4xl space-y-4 text-sm leading-7 text-slate-600">
              <h2 className="text-2xl font-extrabold text-slate-900">Use sold listings to understand pricing and demand</h2>
              <p>
                Sold equipment history gives buyers and sellers useful context around market movement, machine popularity,
                and realistic price expectations before they shortlist live inventory.
              </p>
              <p>
                Return to the <Link href="/machines" className="font-bold text-[#c69200] hover:text-amber-600">live machines marketplace</Link>,
                browse <Link href="/dealers" className="font-bold text-[#c69200] hover:text-amber-600">verified dealers</Link>, or
                explore <Link href="/categories" className="font-bold text-[#c69200] hover:text-amber-600">equipment categories</Link> for a more focused search.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
