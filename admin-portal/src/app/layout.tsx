import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import LocaleSync from "@/components/LocaleSync";
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
  const faviconUrl = branding.faviconUrl || '/icon.png';
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
      icon: [{ url: faviconUrl, type: iconType }],
      apple: [{ url: faviconUrl, type: iconType }],
      shortcut: [{ url: faviconUrl, type: iconType }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: DEFAULT_PWA_THEME_COLOR,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const branding = await getPortalBranding();

  return (
    <html
      lang={locale}
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {(branding.darkLogoUrl || branding.logoUrl) && (
          <link rel="preload" as="image" href={branding.darkLogoUrl || branding.logoUrl || undefined} />
        )}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__JCB_PORTAL_LOGO__=${JSON.stringify({
              logoUrl: branding.logoUrl,
              darkLogoUrl: branding.darkLogoUrl,
            }).replace(/</g, '\\u003c')};`,
          }}
        />
        <SiteLogoProvider value={{ logoUrl: branding.logoUrl, darkLogoUrl: branding.darkLogoUrl }}>
          <LocaleSync />
          <ToastProvider>
            {children}
          </ToastProvider>
        </SiteLogoProvider>
      </body>
    </html>
  );
}
