import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveJwtSecret } from './jwtSecret';

const TOKEN_VERSION = 'offer1';

type OfferResponseTokenPayload = {
  offerId: string;
  version: number;
  expiresAt: number;
};

const signatureFor = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(`${TOKEN_VERSION}.${payload}`).digest('base64url');

export const createOfferResponseToken = (
  offerId: string,
  version: number,
  expiresAt: number,
  secret = resolveJwtSecret(),
) => {
  const payload = Buffer.from(JSON.stringify({ offerId, version, expiresAt }), 'utf8').toString('base64url');
  return `${TOKEN_VERSION}.${payload}.${signatureFor(payload, secret)}`;
};

export const verifyOfferResponseToken = (
  token: string,
  secret = resolveJwtSecret(),
  now = Math.floor(Date.now() / 1000),
): OfferResponseTokenPayload | null => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return null;

  try {
    const expected = Buffer.from(signatureFor(parts[1], secret));
    const received = Buffer.from(parts[2]);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;

    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Partial<OfferResponseTokenPayload>;
    const version = decoded.version;
    const expiresAt = decoded.expiresAt;
    if (
      typeof decoded.offerId !== 'string' ||
      !/^[a-zA-Z0-9-]{8,100}$/.test(decoded.offerId) ||
      typeof version !== 'number' || !Number.isInteger(version) || version < 1 ||
      typeof expiresAt !== 'number' || !Number.isInteger(expiresAt) || expiresAt <= now
    ) return null;

    return {
      offerId: decoded.offerId,
      version,
      expiresAt,
    };
  } catch {
    return null;
  }
};

export const buildOfferResponseUrl = (
  token: string,
  publicOrigin = process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || 'https://jcbexchange.com',
) => `${publicOrigin.replace(/\/+$/, '')}/offer-response/${encodeURIComponent(token)}`;
