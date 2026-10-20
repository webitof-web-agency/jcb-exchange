import type { Request } from 'express';

/**
 * Base URL customers can reach the API on (used in invoice links sent by WhatsApp/SMS).
 * Configure PUBLIC_API_URL in production; the request host is only a fallback.
 */
export const getPublicApiBaseUrl = (req: Request) => {
  const configured = process.env.PUBLIC_API_URL?.trim() || process.env.WHATSAPP_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '').replace(/\/api$/, '');
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0]?.trim() || '';
  const host = forwardedHost || req.get('host');
  if (!host) throw new Error('Unable to determine the public API URL.');
  const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0]?.trim().toLowerCase() || '';
  const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http' ? forwardedProtocol : req.protocol;
  return `${protocol}://${host}`;
};
