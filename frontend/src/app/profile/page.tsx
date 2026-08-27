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

export default function ProfilePage() {
  return <ProfilePageClient />;
}
