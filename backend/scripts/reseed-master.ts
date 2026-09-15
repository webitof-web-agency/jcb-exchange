/**
 * reseed-master.ts
 * Safely clears and reseeds: CategoryIcons → Categories → Brands
 * Locations (countries, states, cities) are reseeded with skipDuplicates (upsert-style).
 *
 * Usage:
 *   npx tsx scripts/reseed-master.ts              # CategoryIcons + Categories + Brands only
 *   npx tsx scripts/reseed-master.ts --locations  # Also reseed countries/states/cities
 */

import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/lib/prisma';

const ARGS = process.argv.slice(2);
const WITH_LOCATIONS = ARGS.includes('--locations');

// ─── SVG icon files → DB names ───────────────────────────────────────────────
// Filenames in backend/assets/category-icons/
// We strip the parentheses style into clean names: "Container (2)" → "Container 2"
const ICON_DIR = path.join(__dirname, '../assets/category-icons');

// Category name → icon file basename (without .svg)
const CATEGORY_ICON_MAP: Record<string, string> = {
  'Backhoe Loader':         'Container 2',
  'Excavator':              'Container 4',
  'Wheel Loader':           'Container',
  'Telehandler':            'Container 8',
  'Skid Steer Loader':      'Container 3',
  'Compactor / Road Roller':'Container 7',
  'Motor Grader':           'Container 11',
  'Bulldozer':              'Container 5',
  'Dump Truck / Tipper':    'Container 1',
  'Crane':                  'Container 10',
  'Forklift':               'Container 9',
  'Paver':                  'Container 6',
  'Tractor':                'Container 12',
};

// Convert "Container 2" → "Container (2).svg" filename
function iconNameToFilename(name: string): string {
  // e.g. "Container 2" → "Container (2).svg", "Container" → "Container.svg"
  const match = name.match(/^(.+?)\s+(\d+)$/);
  if (match) return `${match[1]} (${match[2]}).svg`;
  return `${name}.svg`;
}

async function reseedCategoryIcons() {
  console.log('\n🗂  Reseeding CategoryIcons from SVG files...');

  const svgFiles = fs.readdirSync(ICON_DIR).filter((f) => f.endsWith('.svg'));
  console.log(`   Found ${svgFiles.length} SVG files in assets/category-icons/`);

  for (const filename of svgFiles) {
    // Convert filename to clean DB name: "Container (2).svg" → "Container 2"
    const nameMatch = filename.replace('.svg', '').match(/^(.+?)\s*\((\d+)\)$/);
    const dbName = nameMatch ? `${nameMatch[1]} ${nameMatch[2]}` : filename.replace('.svg', '');

    const svgData = fs.readFileSync(path.join(ICON_DIR, filename), 'utf-8').trim();

    await prisma.categoryIcon.upsert({
      where: { name: dbName },
      update: { svgData },
      create: { name: dbName, svgData },
    });
    console.log(`   ✓ Upserted icon: "${dbName}" (from ${filename})`);
  }
  console.log(`   ✅ CategoryIcons done — ${svgFiles.length} icons.`);
}

async function reseedCategories() {
  console.log('\n📦  Reseeding Categories...');

  const categoriesPath = path.join(__dirname, '../../categories.json');
  const categories: string[] = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));
  console.log(`   Found ${categories.length} categories in categories.json`);

  // Load all icons once
  const allIcons = await prisma.categoryIcon.findMany({ select: { id: true, name: true } });
  const iconByName = new Map(allIcons.map((i) => [i.name.toLowerCase(), i]));

  for (const categoryName of categories) {
    const iconKey = CATEGORY_ICON_MAP[categoryName];
    const icon = iconKey ? iconByName.get(iconKey.toLowerCase()) : null;

    if (iconKey && !icon) {
      console.warn(`   ⚠  Icon "${iconKey}" not found in DB for category "${categoryName}"`);
    }

    // Global categories have partnerProfileId = null — use findFirst + upsert pattern
    const existing = await prisma.category.findFirst({
      where: { name: categoryName, partnerProfileId: null },
      select: { id: true },
    });

    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { iconId: icon?.id ?? null },
      });
      console.log(`   ↺ Updated category: "${categoryName}"${icon ? ` → icon "${iconKey}"` : ' (no icon)'}`);
    } else {
      await prisma.category.create({
        data: { name: categoryName, iconId: icon?.id ?? null },
      });
      console.log(`   + Created category: "${categoryName}"${icon ? ` → icon "${iconKey}"` : ' (no icon)'}`);
    }
  }
  console.log(`   ✅ Categories done — ${categories.length} categories.`);
}

async function reseedBrands() {
  console.log('\n🏷   Reseeding Brands...');

  const brandsPath = path.join(__dirname, '../../brands.json');
  const brands: string[] = JSON.parse(fs.readFileSync(brandsPath, 'utf-8'));
  console.log(`   Found ${brands.length} brands in brands.json`);

  for (const brandName of brands) {
    await prisma.brand.upsert({
      where: { name: brandName },
      update: {},
      create: { name: brandName },
    });
    console.log(`   ✓ Upserted brand: "${brandName}"`);
  }
  console.log(`   ✅ Brands done — ${brands.length} brands.`);
}

async function reseedLocations() {
  console.log('\n🌍  Reseeding Locations (countries → states → cities)...');
  const rootDir = path.join(__dirname, '../..');

  // Countries
  console.log('   Reading countries...');
  const rawCountries = JSON.parse(fs.readFileSync(path.join(rootDir, 'nsc.countries.json'), 'utf-8'));
  const mappedCountries = rawCountries.map((c: any) => ({
    id: c._id,
    name: String(c.name),
    iso3: c.iso3 ? String(c.iso3) : null,
    iso2: c.iso2 ? String(c.iso2) : null,
    numericCode: c.numeric_code ? String(c.numeric_code) : null,
    phonecode: c.phonecode ? String(c.phonecode) : null,
    capital: c.capital ? String(c.capital) : null,
    currency: c.currency ? String(c.currency) : null,
    currencyName: c.currency_name ? String(c.currency_name) : null,
    currencySymbol: c.currency_symbol ? String(c.currency_symbol) : null,
    tld: c.tld ? String(c.tld) : null,
    native: c.native ? String(c.native) : null,
    region: c.region ? String(c.region) : null,
    subregion: c.subregion ? String(c.subregion) : null,
    nationality: c.nationality ? String(c.nationality) : null,
    latitude: c.latitude ? String(c.latitude) : null,
    longitude: c.longitude ? String(c.longitude) : null,
    emoji: c.emoji ? String(c.emoji) : null,
    emojiU: c.emojiU ? String(c.emojiU) : null,
  }));
  await chunkedUpsert(prisma.country, mappedCountries, 'id');
  console.log(`   ✅ Countries: ${mappedCountries.length}`);

  // States
  console.log('   Reading states...');
  const rawStates = JSON.parse(fs.readFileSync(path.join(rootDir, 'nsc.states.json'), 'utf-8'));
  const mappedStates = rawStates.map((s: any) => ({
    id: s._id,
    name: String(s.name),
    countryId: s.country_id,
    countryCode: s.country_code ? String(s.country_code) : null,
    stateCode: s.state_code ? String(s.state_code) : null,
    latitude: s.latitude ? String(s.latitude) : null,
    longitude: s.longitude ? String(s.longitude) : null,
  }));
  await chunkedUpsert(prisma.state, mappedStates, 'id');
  console.log(`   ✅ States: ${mappedStates.length}`);

  // Cities
  console.log('   Reading cities (large file, may take a few minutes)...');
  const rawCities = JSON.parse(fs.readFileSync(path.join(rootDir, 'nsc.cities.json'), 'utf-8'));
  const mappedCities = rawCities.map((c: any) => ({
    id: c._id,
    name: String(c.name),
    stateId: c.state_id,
    stateCode: c.state_code ? String(c.state_code) : null,
    countryId: c.country_id,
    countryCode: c.country_code ? String(c.country_code) : null,
    latitude: c.latitude ? String(c.latitude) : null,
    longitude: c.longitude ? String(c.longitude) : null,
  }));
  await chunkedUpsert(prisma.city, mappedCities, 'id');
  console.log(`   ✅ Cities: ${mappedCities.length}`);
}

async function chunkedUpsert(model: any, data: any[], idField: string, chunkSize = 1000) {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await model.createMany({ data: chunk, skipDuplicates: true });
    if (i % 50000 === 0 && i > 0) {
      console.log(`     … ${i}/${data.length} inserted`);
    }
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║      JCB Exchange — Master Reseed    ║');
  console.log('╚══════════════════════════════════════╝');
  if (WITH_LOCATIONS) {
    console.log('Mode: CategoryIcons + Categories + Brands + Locations');
  } else {
    console.log('Mode: CategoryIcons + Categories + Brands only');
    console.log('Tip : Add --locations flag to also reseed countries/states/cities');
  }

  try {
    await reseedCategoryIcons();
    await reseedCategories();
    await reseedBrands();
    if (WITH_LOCATIONS) {
      await reseedLocations();
    }
    console.log('\n🎉 All done!\n');
  } catch (err) {
    console.error('\n❌ Error during reseed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
