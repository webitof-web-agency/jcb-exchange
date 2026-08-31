import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import AuthModal from "@/components/shared/AuthModal";
import ToastViewport from "@/components/shared/ToastViewport";
import LocaleSync from "@/components/shared/LocaleSync";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/config";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_TWITTER_IMAGE,
  SITE_URL,
} from "@/lib/site";
import { getSiteBranding } from '@/lib/siteBranding';

export const viewport: Viewport = {
  themeColor: "#FFC107",
};

const getIconType = (url: string) => {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith('.ico')) return 'image/x-icon';
  if (lowerUrl.endsWith('.svg')) return 'image/svg+xml';
  if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerUrl.endsWith('.webp')) return 'image/webp';
  return 'image/png'; // default fallback
};

export async function generateMetadata(): Promise<Metadata> {
  // Force dynamic evaluation at request time to fetch latest branding settings
  await cookies();
  const branding = await getSiteBranding();
  const faviconUrl = branding.faviconUrl || '/icon.png';
  const iconType = getIconType(faviconUrl);

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${SITE_NAME} | Find the Right Machine`,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    alternates: {
      canonical: '/',
    },
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [{ url: faviconUrl, type: iconType }],
      apple: [{ url: faviconUrl, type: iconType }],
      shortcut: [{ url: faviconUrl, type: iconType }],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      title: `${SITE_NAME} | Find the Right Machine`,
      description: SITE_DESCRIPTION,
      url: `${SITE_URL}/`,
      siteName: SITE_NAME,
      locale: 'en_IN',
      type: 'website',
      images: [
        {
          url: SITE_OG_IMAGE,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} marketplace preview`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${SITE_NAME} | Find the Right Machine`,
      description: SITE_DESCRIPTION,
      images: [SITE_TWITTER_IMAGE],
    },
    category: 'marketplace',
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const branding = await getSiteBranding();
  const siteSchema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        logo: branding.logoUrl,
        description: SITE_DESCRIPTION,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/machines?q={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
    ],
  };

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen flex flex-col bg-gray-50 text-gray-900 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteSchema) }}
        />
        <LocaleSync />
        <Navbar />
        <main className="flex-grow flex flex-col">
          {children}
        </main>
        <Footer />
        <AuthModal />
        <ToastViewport />
        <ToastContainer position="bottom-right" />
      </body>
    </html>
  );
}

