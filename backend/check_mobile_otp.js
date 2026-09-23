require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const res = await pool.query("SELECT value FROM platform_runtime_settings WHERE key = 'appSettings'");
  if(res.rows.length) {
    const s = res.rows[0].value;
    console.log(JSON.stringify(s.mobileOtp, null, 2));
  } else {
    console.log('No settings found');
  }
  pool.end();
}
main();
