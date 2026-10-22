import crypto from 'crypto';

// Connector credentials are stored encrypted (AES-256-GCM) with FINANCE_HUB_SETTINGS_SECRET
// (64 hex characters). Without the secret, credentials cannot be saved or used.

const VERSION = 'v1';

const key = () => {
  const secret = process.env.FINANCE_HUB_SETTINGS_SECRET?.trim() ?? '';
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) throw new Error('Set FINANCE_HUB_SETTINGS_SECRET (64 hex characters) on the server to store connector credentials.');
  return Buffer.from(secret, 'hex');
};

export const secretsConfigured = () => /^[a-fA-F0-9]{64}$/.test(process.env.FINANCE_HUB_SETTINGS_SECRET?.trim() ?? '');

export const encryptSecret = (value: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
};

export const decryptSecret = (value: string) => {
  const [version, iv, tag, data] = value.split('.');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Stored credential is unreadable.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
};

/** Constant-time comparison of two secrets of any length. */
export const sameSecret = (a: string, b: string) => {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
};
