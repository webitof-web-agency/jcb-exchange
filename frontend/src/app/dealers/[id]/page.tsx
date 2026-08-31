import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { generateDealerSlugPath } from '@/lib/seoUtils';
import DealerDetailPageClient from './DealerDetailPageClient';
import { getAbsoluteDealerAssetUrl, getDealerDetail, getDealerListings } from './data';

type DealerDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: DealerDetailPageProps): Promise<Metadata> {
  const { id: rawDealerId } = await params;
  const dealer = await getDealerDetail(rawDealerId);

  if (!dealer) {
    return {
      title: 'Dealer Not Found',
      description: 'The requested dealer profile could not be found on JCB Exchange.',
    };
  }

  const location = [dealer.businessAddress, dealer.district].filter(Boolean).join(', ');
  const title = dealer.businessName
    ? `${dealer.businessName}${location ? ` in ${location}` : ''}`
    : 'Verified Dealer Profile';
  const description = dealer.businessDescription
    || `Explore ${dealer.businessName || 'this dealer'} on JCB Exchange${location ? ` in ${location}` : ''}. View available machines, business details, and contact options.`;

  return {
    title,
    description,
    alternates: {
      canonical: generateDealerSlugPath(dealer),
    },
    openGraph: {
      title: `${title} | JCB Exchange`,
      description,
      url: `https://jcbexchange.com${generateDealerSlugPath(dealer)}`,
      type: 'website',
      ...(dealer.businessLogoUrl
        ? {
            images: [
              {
                url: dealer.businessLogoUrl,
                alt: dealer.businessName || 'Dealer logo',
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: dealer.businessLogoUrl ? 'summary_large_image' : 'summary',
      title: `${title} | JCB Exchange`,
      description,
      ...(dealer.businessLogoUrl ? { images: [dealer.businessLogoUrl] } : {}),
    },
  };
}

export default async function DealerDetailPage({ params }: DealerDetailPageProps) {
  const { id: rawDealerId } = await params;
  const dealer = await getDealerDetail(rawDealerId);
  const dealerLookupId = dealer?.userId || dealer?.id || rawDealerId;
  const listings = dealer ? await getDealerListings(dealerLookupId) : [];

  if (dealer) {
    const canonicalPath = generateDealerSlugPath(dealer);
    if (canonicalPath !== `/dealers/${rawDealerId}`) {
      redirect(canonicalPath);
    }
  }

  const canonicalUrl = dealer
    ? `https://jcbexchange.com${generateDealerSlugPath(dealer)}`
    : `https://jcbexchange.com/dealers/${rawDealerId}`;
  const logoUrl = getAbsoluteDealerAssetUrl(dealer?.businessLogoUrl);
  const localBusinessSchema = dealer
    ? {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: dealer.businessName || 'JCB Exchange Dealer',
        description:
          dealer.businessDescription ||
          `Verified heavy machinery dealer profile on JCB Exchange${dealer.district ? ` in ${dealer.district}` : ''}.`,
        url: canonicalUrl,
        image: logoUrl || undefined,
        telephone: dealer.publicContact?.callNumber || undefined,
        areaServed: dealer.district || undefined,
        address:
          dealer.businessAddress || dealer.district
            ? {
                '@type': 'PostalAddress',
                streetAddress: dealer.businessAddress || undefined,
                addressLocality: dealer.district || undefined,
                addressCountry: 'IN',
              }
            : undefined,
        sameAs: dealer.websiteUrl
          ? [dealer.websiteUrl.startsWith('http') ? dealer.websiteUrl : `https://${dealer.websiteUrl}`]
          : undefined,
      }
    : null;

  return (
    <>
      {localBusinessSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
      ) : null}
      <DealerDetailPageClient dealerId={dealerLookupId} initialDealer={dealer} initialListings={listings} />
    </>
  );
}
