// Fills Listing.registrationNumberKey / chassisNumberKey for listings saved before the duplicate check
// (migration 20261102_0002_listing_vehicle_identity_keys) and reports vehicles that already have more
// than one open listing. Nothing is deleted or unpublished; duplicates are left for an admin to resolve.
//
//   npx tsx scripts/backfill-listing-vehicle-keys.ts            dry run: only reads and reports
//   npx tsx scripts/backfill-listing-vehicle-keys.ts --apply    writes the keys (needs the migration)
//
// Keys come from the same places the listing forms use, in this order: the latest RTO record, the
// "Registration no:" / "Chassis/serial:" lines of the description, then the API-verified numbers.
import prismaModule from '../src/lib/prisma';
import {
  isBlockingListingStatus,
  parseListingDescriptionChassis,
  parseListingDescriptionRegistration,
  resolveListingVehicleKeys,
} from '../src/services/listingVehicleIdentity';

const prisma = prismaModule as any;
const apply = process.argv.includes('--apply');

const main = async () => {
  const listings: any[] = await prisma.listing.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      description: true,
      createdAt: true,
      partner: { select: { name: true } },
      rtoRecords: { orderBy: { updatedAt: 'desc' }, take: 1, select: { vehicleNumber: true } },
      vehicleVerification: { select: { verifiedRegistrationNumber: true, verifiedChassisNumber: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const rows = listings.map((listing) => ({
    listing,
    keys: resolveListingVehicleKeys({
      registration: [
        listing.rtoRecords?.[0]?.vehicleNumber,
        parseListingDescriptionRegistration(listing.description || ''),
        listing.vehicleVerification?.verifiedRegistrationNumber,
      ],
      chassis: [
        parseListingDescriptionChassis(listing.description || ''),
        listing.vehicleVerification?.verifiedChassisNumber,
      ],
    }),
  }));

  const withRegistration = rows.filter((row) => row.keys.registrationNumberKey).length;
  const withChassis = rows.filter((row) => row.keys.chassisNumberKey).length;
  console.log(`Listings: ${rows.length} | with vehicle number: ${withRegistration} | with chassis number: ${withChassis}`);

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!isBlockingListingStatus(row.listing.status)) continue;
    const groupKeys = [
      row.keys.registrationNumberKey ? `Vehicle number ${row.keys.registrationNumberKey}` : '',
      row.keys.chassisNumberKey ? `Chassis number ${row.keys.chassisNumberKey}` : '',
    ].filter(Boolean);
    for (const key of groupKeys) groups.set(key, [...(groups.get(key) || []), row]);
  }
  const duplicates = Array.from(groups.entries()).filter(([, items]) => items.length > 1);
  console.log(`\nVehicles with more than one open listing: ${duplicates.length}`);
  for (const [key, items] of duplicates) {
    console.log(`\n${key}`);
    for (const { listing } of items) {
      console.log(`  ${listing.id}  ${String(listing.status).padEnd(17)} ${listing.createdAt.toISOString().slice(0, 10)}  ${listing.title}  (${listing.partner?.name || 'unknown seller'})`);
    }
  }

  if (!apply) {
    console.log('\nDry run: nothing was written. Re-run with --apply after the migration is deployed.');
    return;
  }

  let updated = 0;
  for (const { listing, keys } of rows) {
    // Raw SQL so "updatedAt" (used for sorting and "last updated" labels) is left alone.
    await prisma.$executeRaw`
      UPDATE "Listing"
      SET "registrationNumberKey" = ${keys.registrationNumberKey}, "chassisNumberKey" = ${keys.chassisNumberKey}
      WHERE id = ${listing.id}`;
    updated += 1;
  }
  console.log(`\nKeys written for ${updated} listings.`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
