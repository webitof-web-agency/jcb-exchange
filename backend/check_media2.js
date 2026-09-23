require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Check Media table structure
    const colResult = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Media'
      ORDER BY ordinal_position
    `);
    console.log('\n=== Media TABLE COLUMNS ===');
    console.log(JSON.stringify(colResult.rows, null, 2));

    // Get recent media with their listing titles
    const mediaResult = await client.query(`
      SELECT 
        m.id,
        m."fileUrl",
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

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
