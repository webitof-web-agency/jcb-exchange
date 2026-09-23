require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Find the specific listing from the URL
    const listingResult = await client.query(`
      SELECT l.id, l.title, l.status
      FROM "Listing" l
      WHERE l.id LIKE '3d0bbcec%' OR l.id = '3d0bbcec-fd55-4a4e-8f8a-0e22a8abcdef'
      LIMIT 5
    `);
    console.log('\n=== LISTING SEARCH ===');
    console.log(JSON.stringify(listingResult.rows, null, 2));

    // Get ALL listings with media to check formats
    const mediaResult = await client.query(`
      SELECT 
        lm.id as media_id,
        lm."listingId",
        lm."fileUrl",
        lm."type",
        lm."isFeatured",
        l.title as listing_title
      FROM "ListingMedia" lm
      JOIN "Listing" l ON l.id = lm."listingId"
      ORDER BY lm."createdAt" DESC
      LIMIT 10
    `);
    console.log('\n=== RECENT LISTING MEDIA (last 10) ===');
    console.log(JSON.stringify(mediaResult.rows, null, 2));

    // Also check table structure
    const columnResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ListingMedia'
      ORDER BY ordinal_position
    `);
    console.log('\n=== ListingMedia TABLE COLUMNS ===');
    console.log(JSON.stringify(columnResult.rows, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
