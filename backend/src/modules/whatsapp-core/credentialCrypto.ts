import crypto from 'crypto';

const CREDENTIAL_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

const getEncryptionKey = (secret: string) => {
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) {
    throw new Error('WHATSAPP_SETTINGS_SECRET must be a 64-character hexadecimal value.');
  }
  return Buffer.from(secret, 'hex');
};

export const encryptWhatsAppCredential = (value: string, secret: string) => {
  const key = getEncryptionKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [CREDENTIAL_VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
};

export const decryptWhatsAppCredential = (encryptedValue: string, secret: string) => {
  try {
    const [version, iv, authTag, ciphertext] = encryptedValue.split('.');
    if (version !== CREDENTIAL_VERSION || !iv || !authTag || !ciphertext) throw new Error('Invalid encrypted credential format.');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.includes('WHATSAPP_SETTINGS_SECRET')) throw error;
    throw new Error('Unable to decrypt WhatsApp credential.');
  }
};
