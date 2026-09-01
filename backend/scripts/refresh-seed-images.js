const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const seedFilePath = path.join(__dirname, 'listing-seed-data.json');
const seedData = JSON.parse(fs.readFileSync(seedFilePath, 'utf8'));

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

const categoryQueries = {
  'Backhoe Loader': ['backhoe loader', 'construction loader'],
  'Wheel Loader': ['wheel loader', 'construction loader machine'],
  Excavator: ['excavator construction', 'crawler excavator'],
  'Motor Grader': ['motor grader road construction', 'road grader machine'],
  Telehandler: ['telehandler construction', 'material handler machine'],
  Forklift: ['forklift warehouse', 'industrial forklift'],
  'Compactor / Road Roller': ['road roller compactor', 'soil compactor machine'],
  Bulldozer: ['bulldozer construction', 'crawler bulldozer'],
  'Dump Truck / Tipper': ['dump truck construction', 'tipper truck site'],
  Paver: ['asphalt paver machine', 'road paver construction'],
};

const imageSlots = [
  'front-view',
  'rear-view',
  'left-side',
  'right-side',
  'front-left-angle',
  'front-right-angle',
  'rear-left-angle',
  'rear-right-angle',
  'chassis-number',
  'meter-reading',
  'dashboard-front',
  'dashboard-left',
  'dashboard-right',
];

const categorySlug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const detectProvider = (url) => {
  if (url.includes('images.unsplash.com')) return 'unsplash';
  if (url.includes('images.pexels.com')) return 'pexels';
  return 'external';
};

const uniqueByUrl = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
};

async function fetchUnsplashImages(query) {
  if (!UNSPLASH_ACCESS_KEY) return [];

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '30');
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');

  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      'Accept-Version': 'v1',
    },
  });

  if (!response.ok) {
    throw new Error(`Unsplash ${response.status}`);
  }

  const payload = await response.json();
  return (payload.results || [])
    .map((item) => ({
      url: item.urls?.regular || item.urls?.full || null,
      caption: item.alt_description || item.description || `${query} image`,
      sourceProvider: 'unsplash',
    }))
    .filter((item) => item.url);
}

async function fetchPexelsImages(query) {
  if (!PEXELS_API_KEY) return [];

  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '40');
  url.searchParams.set('orientation', 'landscape');

  const response = await fetch(url, {
    headers: {
      Authorization: PEXELS_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Pexels ${response.status}`);
  }

  const payload = await response.json();
  return (payload.photos || [])
    .map((item) => ({
      url: item.src?.large2x || item.src?.large || item.src?.original || null,
      caption: item.alt || `${query} image`,
      sourceProvider: 'pexels',
    }))
    .filter((item) => item.url);
}

async function buildCategoryPool(categoryName) {
  const queries = categoryQueries[categoryName] || [categoryName];
  const results = [];

  for (const query of queries) {
    try {
      const unsplash = await fetchUnsplashImages(query);
      results.push(...unsplash);
    } catch (error) {
      console.warn(`[warn] Unsplash fetch failed for ${categoryName}: ${error.message}`);
    }

    try {
      const pexels = await fetchPexelsImages(query);
      results.push(...pexels);
    } catch (error) {
      console.warn(`[warn] Pexels fetch failed for ${categoryName}: ${error.message}`);
    }
  }

  return uniqueByUrl(results);
}

function getFallbackPool(categoryName, listings) {
  return uniqueByUrl(
    listings
      .filter((listing) => listing.formData.categoryName === categoryName)
      .flatMap((listing) => listing.media || [])
      .filter((media) => media.kind === 'image' && media.sourceUrl)
      .map((media) => ({
        url: media.sourceUrl,
        caption: media.caption || `${categoryName} image`,
        sourceProvider: detectProvider(media.sourceUrl),
      }))
  );
}

function assignImagesToListing(listing, pool, assetKeyMap, listingOffset) {
  let imageIndex = 0;

  listing.media = listing.media.map((media) => {
    if (media.kind !== 'image' || !imageSlots.includes(media.slot)) {
      return media;
    }

    const poolItem = pool[(listingOffset + imageIndex) % pool.length];
    imageIndex += 1;

    return {
      ...media,
      assetKey: assetKeyMap.get(poolItem.url),
      sourceProvider: poolItem.sourceProvider,
      sourceUrl: poolItem.url,
      uploadedFileUrl: poolItem.url,
      caption: poolItem.caption || media.caption,
    };
  });
}

async function main() {
  const allListings = seedData.listings;
  const addedListings = allListings.filter((listing) => /-(002|003|004|005|006)$/.test(listing.seedKey));
  const categories = [...new Set(addedListings.map((listing) => listing.formData.categoryName))];
  const generatedAssets = {};
  const summary = [];

  for (const categoryName of categories) {
    const fetchedPool = await buildCategoryPool(categoryName);
    const fallbackPool = getFallbackPool(categoryName, allListings);
    const mergedPool = uniqueByUrl([...fetchedPool, ...fallbackPool]);

    if (!mergedPool.length) {
      throw new Error(`No image pool available for category ${categoryName}`);
    }

    const assetKeyMap = new Map();
    mergedPool.forEach((item, index) => {
      const assetKey = `generated-${categorySlug(categoryName)}-${String(index + 1).padStart(2, '0')}`;
      assetKeyMap.set(item.url, assetKey);
      generatedAssets[assetKey] = {
        kind: 'image',
        sourceProvider: item.sourceProvider,
        sourceUrl: item.url,
        uploadedFileUrl: item.url,
        caption: item.caption,
      };
    });

    const categoryListings = addedListings.filter((listing) => listing.formData.categoryName === categoryName);
    categoryListings.forEach((listing, listingIndex) => {
      assignImagesToListing(listing, mergedPool, assetKeyMap, listingIndex * imageSlots.length);
    });

    summary.push({
      categoryName,
      fetchedFreshImages: fetchedPool.length,
      fallbackImages: fallbackPool.length,
      finalPoolSize: mergedPool.length,
      listingsUpdated: categoryListings.length,
    });
  }

  seedData.assetLibrary = {
    ...seedData.assetLibrary,
    ...generatedAssets,
  };

  const note = 'Added category variants prefer API-fetched images from Unsplash and Pexels, with fallback reuse when provider quota or availability is limited.';
  if (!seedData.meta.notes.includes(note)) {
    seedData.meta.notes.push(note);
  }

  fs.writeFileSync(seedFilePath, `${JSON.stringify(seedData, null, 2)}\n`);
  console.log(JSON.stringify({ updatedListings: addedListings.length, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
