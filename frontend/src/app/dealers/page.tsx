import type { Metadata } from 'next';
import DealersPageClient from './DealersPageClient';

export const metadata: Metadata = {
  title: 'Verified Dealers & Showrooms',
  description: 'Find verified heavy equipment dealers, showrooms, and marketplace partners across India on JCB Exchange.',
  alternates: {
    canonical: '/dealers',
  },
  openGraph: {
    title: 'Verified Dealers & Showrooms | JCB Exchange',
    description: 'Explore trusted heavy machinery dealers and authorized partners across India on JCB Exchange.',
    url: 'https://jcbexchange.com/dealers',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Verified Dealers & Showrooms | JCB Exchange',
    description: 'Explore trusted heavy machinery dealers and authorized partners across India on JCB Exchange.',
  },
};

export default function DealersPage() {
  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Verified Dealers & Showrooms | JCB Exchange',
    description: 'Find verified heavy equipment dealers, showrooms, and marketplace partners across India on JCB Exchange.',
    url: 'https://jcbexchange.com/dealers',
    isPartOf: {
      '@id': 'https://jcbexchange.com/#website',
    },
    about: {
      '@type': 'Thing',
      name: 'Heavy machinery dealers in India',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <DealersPageClient />
    </>
  );
}

