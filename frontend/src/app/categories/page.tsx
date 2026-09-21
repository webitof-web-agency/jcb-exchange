import type { Metadata } from 'next';
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
    </>
  );
}
