import fs from 'fs';
import path from 'path';
import prisma from '../src/lib/prisma';

async function chunkedInsert(model: any, data: any[], chunkSize = 1000) {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    console.log(`Inserting chunk ${i} to ${i + chunk.length} of ${data.length}...`);
    try {
        await model.createMany({
          data: chunk,
          skipDuplicates: true,
        });
    } catch (err: any) {
        console.error(`Error inserting chunk ${i} to ${i + chunk.length}:`, err.message);
    }
  }
}

async function main() {
  console.log('Starting seed...');
  
  const rootDir = path.join(__dirname, '..', '..');
  
  const countriesPath = path.join(rootDir, 'nsc.countries.json');
  const statesPath = path.join(rootDir, 'nsc.states.json');
  const citiesPath = path.join(rootDir, 'nsc.cities.json');

  console.log('Reading countries...');
  const rawCountries = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));
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
    emojiU: c.emojiU ? String(c.emojiU) : null
  }));

  console.log('Reading states...');
  const rawStates = JSON.parse(fs.readFileSync(statesPath, 'utf8'));
  const mappedStates = rawStates.map((s: any) => ({
    id: s._id,
    name: String(s.name),
    countryId: s.country_id,
    countryCode: s.country_code ? String(s.country_code) : null,
    stateCode: s.state_code ? String(s.state_code) : null,
    latitude: s.latitude ? String(s.latitude) : null,
    longitude: s.longitude ? String(s.longitude) : null,
  }));

  console.log('Reading cities... (This might take a few seconds due to size)');
  const rawCities = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));
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

  console.log('Seeding countries...');
  await chunkedInsert(prisma.country, mappedCountries);

  console.log('Seeding states...');
  await chunkedInsert(prisma.state, mappedStates);

  console.log('Seeding cities... (This will take a few minutes)');
  await chunkedInsert(prisma.city, mappedCities);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
