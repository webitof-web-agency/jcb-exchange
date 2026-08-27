import type { Metadata } from 'next';
import ProfileListingDetailClient from './ProfileListingDetailClient';

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const metadata: Metadata = {
  title: 'My Listing',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      'max-image-preview': 'none',
      'max-snippet': 0,
      'max-video-preview': 0,
    },
  },
};

export default async function ProfileListingDetailPage({ params }: PageProps) {
  const { id } = await params;
  return <ProfileListingDetailClient listingId={id} />;
}
