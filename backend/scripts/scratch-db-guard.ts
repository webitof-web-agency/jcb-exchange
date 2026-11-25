/**
 * Imported FIRST by verification scripts that create and delete data. It aborts unless DATABASE_URL points at a
 * throw-away database on this machine (localhost, not the SSH-tunnelled live port, and a name containing
 * "scratch"), so such a script can never run against the live database by accident.
 */
const raw = (process.env.DATABASE_URL ?? '').trim().replace(/^['"]|['"]$/g, '');
let ok = false;
try {
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  ok = ['localhost', '127.0.0.1'].includes(url.hostname) && url.port !== '15432' && /scratch/i.test(database) && !/prod/i.test(database);
} catch {
  ok = false;
}
if (!ok) {
  console.error('REFUSED: set DATABASE_URL to a local scratch database (localhost, name containing "scratch", never the tunnelled live port 15432).');
  process.exit(2);
}
