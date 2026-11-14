import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_SENSITIVE_FIELD_PERMISSIONS,
  canReadAiSensitiveField,
  buildAiSecurityAuditPayload,
  sanitizeAiToolData,
} from './aiFieldSecurity.service';

test('masks PII and removes document secrets from provider-safe tool data', () => {
  const result = sanitizeAiToolData({
    ownerName: 'Ramesh Kumar',
    mobileNumber: '9876543210',
    email: 'ramesh@example.com',
    documentUrl: 'https://files.example.com/rc.pdf?token=secret',
    accessToken: 'provider-secret',
    listingCount: 4,
    nested: { buyerPhone: '9123456789' },
  }, { role: 'EMPLOYEE', permissions: ['ai.use'] });
  const data = result.data as Record<string, unknown>;

  assert.equal(data.ownerName, '[REDACTED_PII]');
  assert.equal(data.mobileNumber, '[REDACTED_MOBILE]');
  assert.equal(data.email, '[REDACTED_EMAIL]');
  assert.equal(data.documentUrl, '[REDACTED_DOCUMENT_URL]');
  assert.equal(data.accessToken, '[REDACTED_SECRET]');
  assert.equal(data.listingCount, 4);
  assert.equal((data.nested as Record<string, unknown>).buyerPhone, '[REDACTED_MOBILE]');
  assert.ok(result.maskedFields.includes('ownerName'));
  assert.ok(result.maskedFields.includes('nested.buyerPhone'));
});

test('requires an explicit sensitive-field permission and never relaxes provider-safe masking', () => {
  assert.deepEqual(AI_SENSITIVE_FIELD_PERMISSIONS, ['ai.sensitive.read', 'identity.sensitive.read']);
  assert.equal(canReadAiSensitiveField({ role: 'EMPLOYEE', permissions: [] }, 'mobileNumber'), false);
  assert.equal(canReadAiSensitiveField({ role: 'EMPLOYEE', permissions: ['identity.sensitive.read'] }, 'mobileNumber'), true);

  const result = sanitizeAiToolData({ mobileNumber: '9876543210' }, {
    role: 'ADMIN',
    permissions: ['ALL_ACCESS', 'ai.sensitive.read'],
  });
  assert.equal((result.data as Record<string, unknown>).mobileNumber, '[REDACTED_MOBILE]');
});

test('security audit payload contains metadata only and no sensitive values', () => {
  const payload = buildAiSecurityAuditPayload({
    action: 'AI_SENSITIVE_DATA_MASKED',
    actorUserId: 'operator-1',
    role: 'EMPLOYEE',
    toolName: 'listing.detail',
    maskedFields: ['ownerName', 'documentUrl'],
    rawValue: '9876543210',
  });

  assert.deepEqual(payload, {
    action: 'AI_SENSITIVE_DATA_MASKED',
    actorRole: 'EMPLOYEE',
    toolName: 'listing.detail',
    maskedFields: ['ownerName', 'documentUrl'],
  });
  assert.equal(JSON.stringify(payload).includes('9876543210'), false);
});

test('preserves safe configuration flags while masking the underlying credential fields', () => {
  const result = sanitizeAiToolData({
    phoneNumberConfigured: true,
    accessTokenConfigured: true,
    documentsUploaded: 3,
    accessToken: 'provider-secret',
    phoneNumber: '9876543210',
  }, { role: 'EMPLOYEE', permissions: [] });
  const data = result.data as Record<string, unknown>;

  assert.equal(data.phoneNumberConfigured, true);
  assert.equal(data.accessTokenConfigured, true);
  assert.equal(data.documentsUploaded, 3);
  assert.equal(data.accessToken, '[REDACTED_SECRET]');
  assert.equal(data.phoneNumber, '[REDACTED_MOBILE]');
});

test('removes internal database identifiers from every nested provider-safe tool result', () => {
  const result = sanitizeAiToolData({
    leadId: '32e28d69-5b6e-41b8-a1dd-850528f6ad09',
    nested: {
      listingId: '507f1f77bcf86cd799439011',
      recordId: 'another-internal-id',
      title: 'JCB 3DX',
    },
    items: [{ id: '32e28d69-5b6e-41b8-a1dd-850528f6ad09', name: 'Lead' }],
  }, { role: 'EMPLOYEE', permissions: [] });
  const data = result.data as Record<string, unknown>;
  const nested = data.nested as Record<string, unknown>;
  const item = (data.items as Array<Record<string, unknown>>)[0]!;

  assert.equal('leadId' in data, false);
  assert.equal('listingId' in nested, false);
  assert.equal('recordId' in nested, false);
  assert.equal('id' in item, false);
  assert.equal(nested.title, 'JCB 3DX');
  assert.ok(result.maskedFields.includes('leadId'));
  assert.ok(result.maskedFields.includes('nested.listingId'));
  assert.ok(result.maskedFields.includes('items.0.id'));
});
