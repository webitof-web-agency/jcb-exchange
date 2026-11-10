import crypto from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

const encryptionKey = (deploymentSecret: string) => {
  const normalized = deploymentSecret.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(normalized)) {
    throw new Error('AI_SETTINGS_ENCRYPTION_KEY must be a 64-character hexadecimal value.');
  }
  return Buffer.from(normalized, 'hex');
};

export const aiSettingsEncryptionConfigured = (deploymentSecret = process.env.AI_SETTINGS_ENCRYPTION_KEY?.trim() || '') =>
  /^[a-fA-F0-9]{64}$/.test(deploymentSecret);

export const encryptAiApiKey = (value: string, deploymentSecret: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error('AI provider API key is required.');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey(deploymentSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

export const decryptAiApiKey = (encryptedValue: string, deploymentSecret: string) => {
  try {
    const [version, iv, authTag, ciphertext] = encryptedValue.split('.');
    if (version !== VERSION || !iv || !authTag || !ciphertext) throw new Error('Invalid encrypted AI provider key format.');

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey(deploymentSecret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(authTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.includes('AI_SETTINGS_ENCRYPTION_KEY')) throw error;
    throw new Error('Unable to decrypt AI provider key.');
  }
};

export const aiKeyHint = (value: string) => `****${value.slice(-4)}`;
