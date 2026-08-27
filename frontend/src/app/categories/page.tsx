import type { Metadata } from 'next';
import Link from 'next/link';
import CategoriesPageClient from './CategoriesPageClient';

export const metadata: Metadata = {
  title: 'Machine Categories',
  description: 'Browse heavy equipment categories including JCBs, excavators, loaders, and more available across India on JCB Exchange.',
  alternates: {
    canonical: '/categories',
  },
  openGraph: {
    title: 'Machine Categories | JCB Exchange',
    description: 'Browse heavy equipment categories and discover machines listed across India on JCB Exchange.',
    url: 'https://jcbexchange.com/categories',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Machine Categories | JCB Exchange',
    description: 'Browse heavy equipment categories and discover machines listed across India on JCB Exchange.',
  },
};

export default function CategoriesPage() {
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Machine Categories | JCB Exchange',
    description: 'Browse heavy equipment categories and discover machines listed across India on JCB Exchange.',
    url: 'https://jcbexchange.com/categories',
    isPartOf: {
      '@id': 'https://jcbexchange.com/#website',
    },
    about: {
      '@type': 'Thing',
      name: 'Heavy equipment categories',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <CategoriesPageClient />
      <section className="bg-[#f6f4ef] pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="max-w-4xl space-y-4 text-sm leading-7 text-gray-600">
              <h2 className="text-2xl font-extrabold text-gray-900">Explore equipment categories with real market demand</h2>
              <p>
                Browse machine categories to quickly narrow down verified listings for backhoe loaders, excavators,
                telehandlers, compact equipment, and other heavy machinery commonly searched across India.
              </p>
              <p>
                Continue to the <Link href="/machines" className="font-bold text-jcb-yellow hover:text-yellow-600">full machines marketplace</Link> for live inventory,
                or compare <Link href="/dealers" className="font-bold text-jcb-yellow hover:text-yellow-600">verified dealers</Link> before making contact.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
