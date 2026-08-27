import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { extractIdFromSlug, generateMachineSlugPath } from '@/lib/seoUtils';
import { resolvePublicMachineListingId } from '@/lib/publicRouteResolvers';
import MachineDetailClient from './MachineDetailClient';
import { getAbsoluteMediaUrl, getMachineListing } from './data';

export const dynamic = 'force-dynamic';

type MachineDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: MachineDetailPageProps): Promise<Metadata> {
  const { id: rawSlugOrId } = await params;
  const id = (await resolvePublicMachineListingId(rawSlugOrId)) || extractIdFromSlug(rawSlugOrId);
  const listing = await getMachineListing(id);

  if (!listing) {
    return {
      title: 'Machine Not Found | JCB Exchange',
      description: 'The requested machine listing could not be found on JCB Exchange.',
    };
  }

  const location = [listing.locationCity, listing.locationState].filter(Boolean).join(', ');
  const titleSegments = [
    listing.title,
    listing.manufacturingYear ? String(listing.manufacturingYear) : null,
    location || null,
  ].filter(Boolean);
  const description =
    listing.description ||
    `${listing.title} available on JCB Exchange${location ? ` in ${location}` : ''}. Explore price, seller details, machine specifications, and availability.`;
  const canonicalUrl = generateMachineSlugPath(listing);
  const primaryImage = listing.featuredImage || listing.media.find((media) => media.type === 'IMAGE')?.url || '';
  const imageUrl = primaryImage ? getAbsoluteMediaUrl(primaryImage) : undefined;

  return {
    title: titleSegments.join(' | '),
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: titleSegments.join(' | '),
      description,
      url: canonicalUrl,
      siteName: 'JCB Exchange',
      type: 'website',
      ...(imageUrl
        ? {
            images: [
              {
                url: imageUrl,
                alt: listing.title,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title: titleSegments.join(' | '),
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function MachineDetailPage({
  params,
}: MachineDetailPageProps) {
  const { id: rawSlugOrId } = await params;
  const id = (await resolvePublicMachineListingId(rawSlugOrId)) || extractIdFromSlug(rawSlugOrId);
  const listing = await getMachineListing(id);

  if (!listing) {
    notFound();
  }

  const canonicalPath = generateMachineSlugPath(listing);
  if (canonicalPath !== `/machines/${rawSlugOrId}`) {
    redirect(canonicalPath);
  }

  const location = [listing.locationCity, listing.locationState].filter(Boolean).join(', ');
  const primaryImage = listing.featuredImage || listing.media.find((media) => media.type === 'IMAGE')?.url || '';
  const imageUrls = listing.media
    .filter((media) => media.type === 'IMAGE')
    .map((media) => getAbsoluteMediaUrl(media.url))
    .filter(Boolean);
  const structuredImages = imageUrls.length > 0
    ? imageUrls
    : primaryImage
      ? [getAbsoluteMediaUrl(primaryImage)]
      : [];
  const offerPrice =
    listing.status === 'SOLD' && typeof listing.saleRecord?.soldPrice === 'number' && listing.saleRecord.soldPrice > 0
      ? listing.saleRecord.soldPrice
      : listing.price;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `https://jcbexchange.com${generateMachineSlugPath(listing)}#product`,
    name: listing.title,
    description:
      listing.description ||
      `${listing.title} available on JCB Exchange${location ? ` in ${location}` : ''}.`,
    mainEntityOfPage: `https://jcbexchange.com${generateMachineSlugPath(listing)}`,
    image: structuredImages,
    brand: listing.brand?.name
      ? {
          '@type': 'Brand',
          name: listing.brand.name,
        }
      : undefined,
    category: listing.category?.name || undefined,
    model: listing.model?.name || undefined,
    productionDate: listing.manufacturingYear ? String(listing.manufacturingYear) : undefined,
    itemCondition: listing.status === 'SOLD' || listing.condition
      ? 'https://schema.org/UsedCondition'
      : undefined,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: offerPrice > 0 ? String(offerPrice) : undefined,
      availability:
        listing.status === 'SOLD'
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
      url: `https://jcbexchange.com${generateMachineSlugPath(listing)}`,
      seller: listing.partner?.name
        ? {
            '@type': 'Organization',
            name: listing.partner.name,
          }
        : undefined,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MachineDetailClient listing={listing} />
    </>
  );
}
