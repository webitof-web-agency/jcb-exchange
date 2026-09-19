import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SITE_DESCRIPTION, SITE_NAME, SITE_OG_IMAGE, SITE_TWITTER_IMAGE } from '@/lib/site';

export const metadata: Metadata = {
  title: `Application Status | My Profile`,
  description: `Track your job application status, interview progress, and submitted information on ${SITE_NAME}.`,
  applicationName: SITE_NAME,
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false, 'max-image-preview': 'none', 'max-snippet': 0, 'max-video-preview': 0 },
  },
  openGraph: {
    title: `Application Status | My Profile | ${SITE_NAME}`,
    description: `Track your job application status and interview progress on ${SITE_NAME}.`,
    siteName: SITE_NAME,
    type: 'website',
    images: [{ url: SITE_OG_IMAGE, alt: `${SITE_NAME} application status` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Application Status | My Profile | ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    images: [SITE_TWITTER_IMAGE],
  },
};

export default function ApplicationDetailsLayout({ children }: { children: ReactNode }) {
  return children;
}
