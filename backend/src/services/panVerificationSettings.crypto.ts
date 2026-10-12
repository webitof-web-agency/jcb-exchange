import crypto from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

const getKey = (masterSecret: string) => {
  const normalized = masterSecret.trim();
  if (!normalized) {
    throw new Error('Application master secret is required for PAN settings.');
  }

  return crypto.createHash('sha256').update(`jcb-pan-settings:${normalized}`, 'utf8').digest();
};

export const encryptPanSetting = (value: string, masterSecret: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(masterSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

export const decryptPanSetting = (encryptedValue: string, masterSecret: string) => {
  try {
    const [version, iv, authTag, ciphertext] = encryptedValue.split('.');
    if (version !== VERSION || !iv || !authTag || !ciphertext) {
      throw new Error('Invalid encrypted PAN setting format.');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(masterSecret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Application master secret')) {
      throw error;
    }
    throw new Error('Unable to decrypt PAN setting.');
  }
};
