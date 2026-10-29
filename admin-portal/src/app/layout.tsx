import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import LocaleSync from "@/components/LocaleSync";
import FormSanitizer from "@/components/FormSanitizer";
import ToastProvider from "@/components/ToastProvider";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/config";
import {
  DEFAULT_PWA_THEME_COLOR,
  getPortalBranding,
} from '@/lib/siteBranding';
import { SiteLogoProvider } from '@/hooks/useSiteLogo';

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
  const branding = await getPortalBranding();
  const faviconUrl = branding.faviconUrl || '/Favicon.png';
  const iconType = getIconType(faviconUrl);

  return {
    title: "JCB Exchange Portal",
    description: "Internal operations and partner management portal for JCB Exchange.",
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
        noimageindex: true,
      },
    },
    manifest: "/manifest.webmanifest",
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
  };
}

export const viewport: Viewport = {
  themeColor: DEFAULT_PWA_THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const branding = await getPortalBranding();
  // Set by src/proxy.ts; inline scripts run only with this request's nonce.
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html
      lang={locale}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="h-full min-h-full flex flex-col" suppressHydrationWarning>
        {(branding.darkLogoUrl || branding.logoUrl) && (
          <link rel="preload" as="image" href={branding.logoUrl || branding.darkLogoUrl || undefined} />
        )}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `window.__JCB_PORTAL_LOGO__=${JSON.stringify({
              logoUrl: branding.logoUrl,
              darkLogoUrl: branding.darkLogoUrl,
            }).replace(/</g, '\\u003c')};`,
          }}
        />
        <SiteLogoProvider value={{ logoUrl: branding.logoUrl, darkLogoUrl: branding.darkLogoUrl }}>
          <LocaleSync />
          <FormSanitizer />
          <ToastProvider>
            {children}
          </ToastProvider>
        </SiteLogoProvider>
      </body>
    </html>
  );
}
