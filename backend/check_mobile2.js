require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    // 1. Check if any user has mobile 8770489813 in any format
    const mobile = '8770489813';
    const userResult = await client.query(`
      SELECT id, mobile, email, name, role, status
      FROM "User"
      WHERE mobile IN ($1, $2, $3, $4)
    `, [mobile, `91${mobile}`, `+91${mobile}`, `0${mobile}`]);
    
    console.log('\n=== USERS MATCHING MOBILE 8770489813 ===');
    console.log(userResult.rows.length === 0 ? '❌ NO USER FOUND WITH THIS MOBILE' : JSON.stringify(userResult.rows, null, 2));

    // 2. Check all users with a mobile number (show last 10)
    const allMobilesResult = await client.query(`
      SELECT id, mobile, email, name, role
      FROM "User"
      WHERE mobile IS NOT NULL
      ORDER BY "createdAt" DESC
      LIMIT 10
    `);
    console.log('\n=== RECENTLY REGISTERED USERS WITH MOBILE ===');
    console.log(JSON.stringify(allMobilesResult.rows, null, 2));

    // 3. Check AppSettings for mobile OTP config
    const settingsResult = await client.query(`
      SELECT key, value FROM "AppSettings"
      WHERE key = 'mobileOtpSettings'
    `);
    console.log('\n=== MOBILE OTP SETTINGS IN DB ===');
    if (settingsResult.rows.length > 0) {
      const settings = JSON.parse(settingsResult.rows[0].value);
      // Mask API key
      if (settings.encryptedApiKey) settings.encryptedApiKey = '***ENCRYPTED***';
      if (settings.apiKey) settings.apiKey = settings.apiKey.substring(0, 8) + '...';
      console.log(JSON.stringify(settings, null, 2));
    } else {
      console.log('No mobile OTP settings found in DB');
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('DB Error:', e.message);
  process.exit(1);
});
