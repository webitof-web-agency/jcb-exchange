require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Get recent media - column is "url" not "fileUrl"
    const mediaResult = await client.query(`
      SELECT 
        m.id,
        m.url,
        m.type,
        m."isFeatured",
        m.slot,
        l.title as listing_title,
        l.id as listing_id
      FROM "Media" m
      LEFT JOIN "Listing" l ON l.id = m."listingId"
      ORDER BY m."createdAt" DESC
      LIMIT 15
    `);
    console.log('\n=== RECENT MEDIA (last 15) ===');
    console.log(JSON.stringify(mediaResult.rows, null, 2));

    // Check the specific listing from URL
    const specificListingMedia = await client.query(`
      SELECT m.id, m.url, m.type, m."isFeatured", l.title
      FROM "Media" m
      JOIN "Listing" l ON l.id = m."listingId"
      WHERE l.id LIKE '%3d0bbcec%' OR l.slug LIKE '%sdf%'
      ORDER BY m."createdAt" DESC
    `);
    console.log('\n=== SDF LISTING MEDIA ===');
    console.log(JSON.stringify(specificListingMedia.rows, null, 2));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
