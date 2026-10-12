import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizePanVerificationBaseUrl,
  resolveSurepassEnvironment,
  selectSurepassProfile,
  serializePanVerificationSettings,
} from './panVerificationSettings.service';

test('normalizes only HTTPS Surepass base URLs', () => {
  assert.equal(
    normalizePanVerificationBaseUrl('https://sandbox.surepass.app/'),
    'https://sandbox.surepass.app',
  );
  assert.throws(
    () => normalizePanVerificationBaseUrl('http://sandbox.surepass.app'),
    /HTTPS/,
  );
});

test('serializes settings without exposing encrypted credentials', () => {
  const serialized = serializePanVerificationSettings({
    id: 'default',
    enabled: true,
    baseUrl: 'https://sandbox.surepass.app',
    encryptedToken: 'v1.encrypted-token',
    encryptedCustomerId: 'v1.encrypted-customer-id',
    encryptedDataSecret: 'v1.encrypted-data-secret',
    updatedByUserId: 'admin-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  assert.deepEqual(serialized, {
    enabled: true,
    activeEnvironment: 'SANDBOX',
    sandbox: {
      baseUrl: 'https://sandbox.surepass.app',
      tokenConfigured: true,
      customerIdConfigured: true,
    },
    production: {
      baseUrl: '',
      tokenConfigured: false,
      customerIdConfigured: false,
    },
    dataEncryptionConfigured: true,
    updatedAt: '2026-01-02T00:00:00.000Z',
    updatedByUserId: 'admin-1',
  });
  assert.equal('encryptedToken' in serialized, false);
  assert.equal('encryptedDataSecret' in serialized, false);
});

test('serializes separate sandbox and production profiles without exposing credentials', () => {
  const serialized = serializePanVerificationSettings({
    id: 'default',
    enabled: true,
    activeEnvironment: 'PRODUCTION',
    baseUrl: null,
    encryptedToken: null,
    encryptedCustomerId: null,
    sandboxBaseUrl: 'https://sandbox.surepass.app',
    encryptedSandboxToken: 'sandbox-encrypted-token',
    encryptedSandboxCustomerId: null,
    productionBaseUrl: 'https://kyc-api.surepass.app',
    encryptedProductionToken: 'production-encrypted-token',
    encryptedProductionCustomerId: 'production-encrypted-customer-id',
    encryptedDataSecret: 'v1.encrypted-data-secret',
    updatedByUserId: 'admin-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  assert.deepEqual(serialized, {
    enabled: true,
    activeEnvironment: 'PRODUCTION',
    sandbox: {
      baseUrl: 'https://sandbox.surepass.app',
      tokenConfigured: true,
      customerIdConfigured: false,
    },
    production: {
      baseUrl: 'https://kyc-api.surepass.app',
      tokenConfigured: true,
      customerIdConfigured: true,
    },
    dataEncryptionConfigured: true,
    updatedAt: '2026-01-02T00:00:00.000Z',
    updatedByUserId: 'admin-1',
  });
  assert.equal('encryptedSandboxToken' in serialized, false);
  assert.equal('encryptedProductionToken' in serialized, false);
});

test('selects the configured environment profile and rejects invalid environment values', () => {
  assert.equal(resolveSurepassEnvironment('production'), 'PRODUCTION');
  assert.equal(resolveSurepassEnvironment('sandbox'), 'SANDBOX');
  assert.throws(() => resolveSurepassEnvironment('staging'), /environment/i);

  const selected = selectSurepassProfile('PRODUCTION', {
    SANDBOX: { baseUrl: 'https://sandbox.surepass.app', token: 'sandbox-token', customerId: null },
    PRODUCTION: { baseUrl: 'https://kyc-api.surepass.app', token: 'production-token', customerId: 'customer-id' },
  });
  assert.deepEqual(selected, {
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'production-token',
    customerId: 'customer-id',
  });
});
