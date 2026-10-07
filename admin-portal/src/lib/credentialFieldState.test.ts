import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getWhatsAppCredentialFieldState,
  mergeRevealedWhatsAppCredentials,
  preserveWhatsAppCredentialsAfterSave,
} from './credentialFieldState';

test('shows configured status without exposing a saved secret', () => {
  assert.deepEqual(getWhatsAppCredentialFieldState('', true), {
    showConfigured: true,
    showToggle: false,
  });
});

test('enables show and hide only while a replacement secret is typed', () => {
  assert.deepEqual(getWhatsAppCredentialFieldState('new-secret', true), {
    showConfigured: false,
    showToggle: true,
  });
  assert.deepEqual(getWhatsAppCredentialFieldState('', false), {
    showConfigured: false,
    showToggle: false,
  });
});

test('retains just-entered credentials after save while clearing the transient phone field', () => {
  const form = preserveWhatsAppCredentialsAfterSave({
    accessToken: 'access-token',
    webhookVerifyToken: 'verify-token',
    appSecret: 'app-secret',
    testRecipientPhone: '919876543210',
  });

  assert.deepEqual(form, {
    accessToken: 'access-token',
    webhookVerifyToken: 'verify-token',
    appSecret: 'app-secret',
    testRecipientPhone: '',
  });
});

test('merges revealed saved credentials into the form without changing other fields', () => {
  assert.deepEqual(
    mergeRevealedWhatsAppCredentials(
      {
        accessToken: '',
        webhookVerifyToken: 'typed-verify-token',
        appSecret: '',
        testRecipientPhone: '919876543210',
      },
      {
        accessToken: 'saved-access-token',
        appSecret: 'saved-app-secret',
      },
    ),
    {
      accessToken: 'saved-access-token',
      webhookVerifyToken: 'typed-verify-token',
      appSecret: 'saved-app-secret',
      testRecipientPhone: '919876543210',
    },
  );
});
