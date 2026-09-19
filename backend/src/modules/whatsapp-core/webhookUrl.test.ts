import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWhatsAppWebhookUrl } from './webhookUrl';

test('builds the WhatsApp webhook from a public API base URL', () => {
  assert.equal(
    buildWhatsAppWebhookUrl('https://api.jcbexchange.in'),
    'https://api.jcbexchange.in/api/whatsapp/webhook',
  );
});

test('does not duplicate the API prefix when the public URL already contains it', () => {
  assert.equal(
    buildWhatsAppWebhookUrl('https://api.jcbexchange.in/api/'),
    'https://api.jcbexchange.in/api/whatsapp/webhook',
  );
});
