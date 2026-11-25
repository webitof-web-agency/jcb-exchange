import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveJwtSecret } from './jwtSecret';

const TOKEN_VERSION = 'offer1';

/**
 * How long an offer link works technically. HR decides when an offer is over (Expired / Withdrawn) by changing its
 * status; the "valid until" date on the letter is informational. A resend issues a new version, which closes the old
 * link at once, so a long technical lifetime does not keep stale links alive.
 */
export const OFFER_LINK_LIFETIME_DAYS = 180;

type OfferResponseTokenPayload = {
  offerId: string;
  version: number;
  expiresAt: number;
};

/**
 * Offer links are signed with OFFER_LINK_SECRET when it is set, so rotating the login (JWT) secret does not break
 * links already sent to candidates. Links signed earlier with the JWT secret keep verifying.
 */
export const resolveOfferLinkSecrets = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const secrets = [env.OFFER_LINK_SECRET?.trim(), resolveJwtSecret(env)].filter((value): value is string => Boolean(value));
  return [...new Set(secrets)];
};

const signatureFor = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(`${TOKEN_VERSION}.${payload}`).digest('base64url');

/** Unix seconds when a link created now stops working. */
export const offerLinkExpiryTimestamp = (now = Date.now()) => Math.floor((now + OFFER_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000) / 1000);

export const createOfferResponseToken = (
  offerId: string,
  version: number,
  expiresAt: number,
  secret: string = resolveOfferLinkSecrets()[0]!,
) => {
  const payload = Buffer.from(JSON.stringify({ offerId, version, expiresAt }), 'utf8').toString('base64url');
  return `${TOKEN_VERSION}.${payload}.${signatureFor(payload, secret)}`;
};

const signatureMatches = (payload: string, signature: string, secret: string) => {
  const expected = Buffer.from(signatureFor(payload, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
};

export const verifyOfferResponseToken = (
  token: string,
  secret: string | readonly string[] = resolveOfferLinkSecrets(),
  now = Math.floor(Date.now() / 1000),
): OfferResponseTokenPayload | null => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return null;

  try {
    const secrets = typeof secret === 'string' ? [secret] : secret;
    if (!secrets.some((candidate) => signatureMatches(parts[1]!, parts[2]!, candidate))) return null;

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

/**
 * Where candidates open their offer. OFFER_RESPONSE_BASE_URL names the site that serves the /offer-response page;
 * without it the public site address is used.
 */
export const resolveOfferResponseOrigin = (env: NodeJS.ProcessEnv = process.env) =>
  env.OFFER_RESPONSE_BASE_URL?.trim() || env.PUBLIC_SITE_URL || env.NEXT_PUBLIC_PUBLIC_SITE_URL || 'https://jcbexchange.com';

export const buildOfferResponseUrl = (
  token: string,
  publicOrigin = resolveOfferResponseOrigin(),
) => `${publicOrigin.replace(/\/+$/, '')}/offer-response/${encodeURIComponent(token)}`;
