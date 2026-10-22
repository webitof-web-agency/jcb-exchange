import crypto from 'node:crypto';
import { resolveJwtSecret } from './jwtSecret';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

const encryptionKey = () => crypto.createHash('sha256').update(resolveJwtSecret()).digest();

export const encryptDocumentLinkToken = (token: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
};

export const decryptDocumentLinkToken = (encryptedValue: string) => {
  try {
    const [version, iv, authTag, ciphertext] = encryptedValue.split('.');
    if (version !== VERSION || !iv || !authTag || !ciphertext) throw new Error('Invalid document token format.');
    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};
