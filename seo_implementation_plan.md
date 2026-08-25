# 🚀 JCB Exchange - Complete SEO & Hybrid Slug Implementation Plan

Yeh document **JCB Exchange** ke liye finalized **Auto-Generated Hybrid SEO Slug (`slug + id`)** aur **Full Next.js 16 SEO Engine** ka complete guide aur implementation blueprint hai.

---

## 📌 1. Overview & Core Strategy
* **Zero Breakage Guarantee:** Purane direct ID URLs (`/machines/clw12345`) bina kisi error ke kaam karenge.
* **Zero Database Changes:** Database me koi naya column ya migration nahi chahiye.
* **Auto-Generated Slug:** Seller ya Admin ko koi slug type karne ki zaroorat nahi hai.
* **Google Rich Snippets:** Google Search me seedhe **Price (₹), Manufacturing Year, Location, Condition, Brand (JCB, CAT, etc.)** dikhega.
* **Social Share Preview:** WhatsApp / Facebook par machine ka photo, price aur title ka card banega.

---

## 🔗 2. URL Structure & Slug Format

### Format:
```text
/machines/[clean-title]-[year]-[city]--[id]
```

### Examples:
| Machine Data | Generated SEO URL |
| :--- | :--- |
| Title: `JCB 3DX Super`, Year: `2021`, City: `Pune`, ID: `clw84920` | `/machines/jcb-3dx-super-2021-pune--clw84920` |
| Title: `Tata Hitachi EX 200`, Year: `2019`, City: `Indore`, ID: `clw99211` | `/machines/tata-hitachi-ex-200-2019-indore--clw99211` |
| Title: `CAT 320D Excavator`, Year: `2022`, City: `Raipur`, ID: `clw11024` | `/machines/cat-320d-excavator-2022-raipur--clw11024` |

---

## 🛠️ 3. Implementation Steps

### Step 1: SEO Helper Utility (`frontend/src/lib/seoUtils.ts`)
```typescript
import { API_ORIGIN } from './api';

export const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')        // Replace spaces with -
    .replace(/[^\w\-]+/g, '')    // Remove non-word chars
    .replace(/\-\-+/g, '-')      // Replace multiple - with single -
    .replace(/^-+/, '')          // Trim - from start
    .replace(/-+$/, '');         // Trim - from end
};

export interface MachineListingSlugData {
  id: string;
  title: string;
  manufacturingYear?: number | string | null;
  locationCity?: string | null;
}

export const generateMachineSlugUrl = (machine: MachineListingSlugData): string => {
  const parts: string[] = [];
  
  if (machine.title) {
    parts.push(slugify(machine.title));
  }
  if (machine.manufacturingYear) {
    parts.push(String(machine.manufacturingYear));
  }
  if (machine.locationCity) {
    parts.push(slugify(machine.locationCity));
  }

  const slugPrefix = parts.filter(Boolean).join('-');
  return slugPrefix ? `/machines/${slugPrefix}--${machine.id}` : `/machines/${machine.id}`;
};

export const extractIdFromSlug = (slugOrId: string): string => {
  if (!slugOrId) return '';
  if (slugOrId.includes('--')) {
    const segments = slugOrId.split('--');
    return segments[segments.length - 1] || slugOrId;
  }
  return slugOrId;
};
```

---

### Step 2: Machine Detail Page Metadata & JSON-LD (`frontend/src/app/machines/[id]/page.tsx`)

```typescript
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MachineDetailClient from './MachineDetailClient';
import { getMachineListing } from './data';
import { extractIdFromSlug, generateMachineSlugUrl } from '@/lib/seoUtils';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';

export const dynamic = 'force-dynamic';

type MachineDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: MachineDetailPageProps): Promise<Metadata> {
  const { id: rawSlugOrId } = await params;
  const id = extractIdFromSlug(rawSlugOrId);
  const listing = await getMachineListing(id);

  if (!listing) {
    return {
      title: 'Machine Not Found | JCB Exchange',
      description: 'The requested heavy machinery listing could not be found on JCB Exchange.',
    };
  }

  const location = [listing.locationCity, listing.locationState].filter(Boolean).join(', ');
  const title = `${listing.title} ${listing.manufacturingYear ? `(${listing.manufacturingYear})` : ''}${location ? ` in ${location}` : ''} - ₹${listing.price ? Number(listing.price).toLocaleString('en-IN') : 'Best Price'} | JCB Exchange`;
  const description = listing.description || `Buy used ${listing.title} in ${location || 'India'}. Verified seller, inspected machine with complete details on JCB Exchange.`;
  const canonicalUrl = `https://jcbexchange.com${generateMachineSlugUrl(listing)}`;
  const imageUrl = listing.images?.[0]?.url ? getAbsoluteFileUrl(listing.images[0].url) : 'https://jcbexchange.com/images/og-default.jpg';

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'JCB Exchange',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: listing.title,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function MachineDetailPage({
  params,
}: MachineDetailPageProps) {
  const { id: rawSlugOrId } = await params;
  const id = extractIdFromSlug(rawSlugOrId);
  const listing = await getMachineListing(id);

  if (!listing) {
    notFound();
  }

  // Google Product / Vehicle Structured Data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    description: listing.description || `${listing.title} heavy machinery available on JCB Exchange.`,
    image: listing.images?.map((img: { url: string }) => getAbsoluteFileUrl(img.url)) || [],
    brand: {
      '@type': 'Brand',
      name: listing.brand?.name || 'JCB',
    },
    offers: {
      '@type': 'Offer',
      price: listing.price || '0',
      priceCurrency: 'INR',
      availability: listing.status === 'SOLD' ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/UsedCondition',
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
```

---

### Step 3: Update Links Across Public Listing Cards
Machine cards par direct `/machines/${machine.id}` ke badle `generateMachineSlugUrl(machine)` use karein:
* `frontend/src/app/machines/MachinesPageClient.tsx`
* `frontend/src/app/page.tsx` (Homepage Recent / Featured Listings)
* `frontend/src/app/dealers/page.tsx`

---

### Step 4: Dynamic XML Sitemap (`frontend/src/app/sitemap.ts`)
```typescript
import { MetadataRoute } from 'next';
import api from '@/lib/api';
import { generateMachineSlugUrl } from '@/lib/seoUtils';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://jcbexchange.com';

  // 1. Static Pages
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/machines`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/dealers`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/categories`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/sell`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  try {
    // 2. Dynamic Machine Listings
    const response = await api.get('/public/listings?limit=500');
    const machines = response.data?.listings || response.data || [];

    const machineRoutes: MetadataRoute.Sitemap = machines.map((machine: any) => ({
      url: `${baseUrl}${generateMachineSlugUrl(machine)}`,
      lastModified: machine.updatedAt ? new Date(machine.updatedAt) : new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    return [...staticRoutes, ...machineRoutes];
  } catch (error) {
    return staticRoutes;
  }
}
```

---

### Step 5: Robots.txt Engine (`frontend/src/app/robots.ts`)
```typescript
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/profile', '/api/', '/_next/'],
    },
    sitemap: 'https://jcbexchange.com/sitemap.xml',
  };
}
```

---

### Step 6: Admin Portal Privacy (`admin-portal/src/app/layout.tsx`)
Admin aur Partner portals ko search engines se protect karne ke liye metadata me yeh lagayein:
```typescript
export const metadata: Metadata = {
  title: 'JCB Exchange Portal',
  robots: {
    index: false,
    follow: false,
  },
};
```

---

## 🧪 4. Testing & Verification Checklist
1. **Old ID Compatibility:** Open `http://localhost:3000/machines/[any-id]` ➔ Page must load smoothly.
2. **Hybrid Slug Compatibility:** Open `http://localhost:3000/machines/used-jcb-3dx-super-2021-pune--[id]` ➔ Page must load identically.
3. **Sitemap Validation:** Open `http://localhost:3000/sitemap.xml` ➔ Must output clean XML list of all machines and static pages.
4. **Robots Validation:** Open `http://localhost:3000/robots.txt` ➔ Must output rules and sitemap link.
5. **Rich Snippet Test:** Inspect Page Source ➔ `<script type="application/ld+json">` with valid `Product` schema must be present.
