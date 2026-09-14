import type { Metadata } from 'next';
import ProfilePageClient from './ProfilePageClient';

export const metadata: Metadata = {
  title: 'My Profile',
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

import { Suspense } from 'react';

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center bg-gray-50"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent"></div></div>}>
      <ProfilePageClient />
    </Suspense>
  );
}
