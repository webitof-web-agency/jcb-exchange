import https from 'https';
import http from 'http';

export function startKeepAlive(port: string | number) {
  // Render's free tier spins down after 15 mins of inactivity.
  // We'll ping the server every 14 minutes (840000 milliseconds).
  const PING_INTERVAL = 14 * 60 * 1000;

  setInterval(() => {
    // If you have your live Render URL, you should add it to your Render Environment Variables
    // as RENDER_EXTERNAL_URL (e.g., https://jcb-exchange-xxx.onrender.com)
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
    
    const client = url.startsWith('https') ? https : http;

    client.get(url, (res) => {
      console.log(`[Keep-Alive] Pinged ${url}. Status Code: ${res.statusCode}`);
    }).on('error', (err) => {
      console.error(`[Keep-Alive] Error pinging ${url}:`, err.message);
    });
  }, PING_INTERVAL);

  console.log(`[Keep-Alive] Service started. Pinging every 14 minutes.`);
}
