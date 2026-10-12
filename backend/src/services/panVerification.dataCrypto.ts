import crypto from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

const getKey = (secret: string) => {
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) {
    throw new Error('SUREPASS_DATA_SECRET must be a 64-character hexadecimal value.');
  }

  return Buffer.from(secret, 'hex');
};

export const encryptPanData = (value: string, secret: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

export const decryptPanData = (encryptedValue: string, secret: string) => {
  try {
    const [version, iv, authTag, ciphertext] = encryptedValue.split('.');
    if (version !== VERSION || !iv || !authTag || !ciphertext) {
      throw new Error('Invalid encrypted PAN data format.');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.includes('SUREPASS_DATA_SECRET')) {
      throw error;
    }

    throw new Error('Unable to decrypt PAN verification data.');
  }
};
