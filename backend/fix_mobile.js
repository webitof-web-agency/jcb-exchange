require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Find the correct settings table name
    const tableResult = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename ILIKE '%setting%' OR tablename ILIKE '%config%' OR tablename ILIKE '%app%'
    `);
    console.log('\n=== SETTINGS-LIKE TABLES ===');
    console.log(tableResult.rows.map(r => r.tablename));

    // Also update Arjun Gupta's mobile number
    console.log('\n=== UPDATING ARJUN GUPTA MOBILE TO 8770489813 ===');
    const updateResult = await client.query(`
      UPDATE "User"
      SET mobile = '8770489813'
      WHERE email = 'arjungupta@gmail.com' AND role = 'SUPER_ADMIN'
      RETURNING id, mobile, email, name
    `);
    console.log(updateResult.rows.length > 0 
      ? '✅ Updated: ' + JSON.stringify(updateResult.rows[0]) 
      : '❌ User not found to update');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
