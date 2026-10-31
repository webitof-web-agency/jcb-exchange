import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveJwtSecret } from './jwtSecret';

const TOKEN_VERSION = 'rc1';

const signatureFor = (recordId: string, secret: string) =>
  createHmac('sha256', secret).update(`${TOKEN_VERSION}.${recordId}`).digest('base64url');

export const createRcPublicVerificationToken = (recordId: string, secret = resolveJwtSecret()) => {
  const payload = Buffer.from(recordId, 'utf8').toString('base64url');
  return `${TOKEN_VERSION}.${payload}.${signatureFor(recordId, secret)}`;
};

export const verifyRcPublicVerificationToken = (token: string, secret = resolveJwtSecret()) => {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return null;
  try {
    const recordId = Buffer.from(parts[1], 'base64url').toString('utf8');
    if (!recordId || !/^[a-zA-Z0-9-]{8,100}$/.test(recordId)) return null;
    const expected = Buffer.from(signatureFor(recordId, secret));
    const received = Buffer.from(parts[2]);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    return recordId;
  } catch {
    return null;
  }
};

export const buildRcPublicVerificationUrl = (recordId: string) => {
  const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://jcbexchange.com').replace(/\/+$/, '');
  return `${siteUrl}/rc-verification/${createRcPublicVerificationToken(recordId)}`;
};
