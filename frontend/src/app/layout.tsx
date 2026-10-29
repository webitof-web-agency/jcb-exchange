import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import AuthModal from "@/components/shared/AuthModal";
import ToastViewport from "@/components/shared/ToastViewport";
import LocaleSync from "@/components/shared/LocaleSync";
import PushNotificationManager from "@/components/shared/PushNotificationManager";
import SessionTimeoutManager from "@/components/shared/SessionTimeoutManager";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/config";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_OG_IMAGE,
  SITE_TWITTER_IMAGE,
  SITE_URL,
} from "@/lib/site";
import {
  DEFAULT_PWA_THEME_COLOR,
  getSiteBranding,
} from '@/lib/siteBranding';
import { serializeJsonLd } from '@/lib/jsonLd';
import FormSanitizer from '@/components/FormSanitizer';

export const viewport: Viewport = {
  themeColor: DEFAULT_PWA_THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
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
    keywords: SITE_KEYWORDS,
    applicationName: SITE_NAME,
    alternates: {
      canonical: '/',
    },
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: faviconUrl, type: iconType },
        { url: '/favicon.ico', type: 'image/x-icon' },
        { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
        { url: '/Favicon.png', type: 'image/png', sizes: '512x512' },
      ],
      shortcut: [{ url: '/favicon.ico', type: 'image/x-icon' }],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
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
  // Set by src/proxy.ts; inline scripts run only with this request's nonce.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
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
      <body className="min-h-screen flex flex-col bg-gray-50 text-gray-900 antialiased pb-16 lg:pb-0" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteSchema) }}
        />
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){if(typeof window==='undefined')return;document.addEventListener('gesturestart',function(e){e.preventDefault();},{passive:false});document.addEventListener('gesturechange',function(e){e.preventDefault();},{passive:false});document.addEventListener('gestureend',function(e){e.preventDefault();},{passive:false});})();`,
          }}
        />
        <LocaleSync />
        <FormSanitizer />
        <Navbar />
        <div className="h-[53px] shrink-0 lg:hidden" aria-hidden="true" />
        <main className="flex-grow flex flex-col">
          {children}
        </main>
        <Footer />
        <MobileBottomNav />
        <AuthModal />
        <ToastViewport />
        <PushNotificationManager />
        <SessionTimeoutManager />
        <ToastContainer position="bottom-right" style={{ zIndex: 999999 }} />
      </body>
    </html>
  );
}

