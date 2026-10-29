// Browsers may call the API only from these sites. Requests without an Origin header (the mobile app,
// server-to-server calls, payment and WhatsApp webhooks) are not affected by CORS and stay allowed.
// Override with CORS_ORIGINS="https://a.example,https://b.example" when the sites move.
export const DEFAULT_CORS_ORIGINS = [
  'https://jcbexchange.com',
  'https://www.jcbexchange.com',
  'https://admin.jcbexchange.com',
];

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '').toLowerCase();

export const resolveCorsOrigins = (env: NodeJS.ProcessEnv = process.env) => {
  const configured = (env.CORS_ORIGINS || '').split(',').map(normalizeOrigin).filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_CORS_ORIGINS);
};

export const isAllowedOrigin = (origin: string | undefined, allowed: Set<string>, env: NodeJS.ProcessEnv = process.env) => {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowed.has(normalized)) return true;
  // Local development (admin portal on :3001, website on :3000) never reaches a production server.
  return env.NODE_ENV !== 'production' && LOCAL_ORIGIN.test(normalized);
};
