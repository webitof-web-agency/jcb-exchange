import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCustomerPrimeWhatsAppDispatch } from './customerPrimeWhatsApp';

test('builds the approved Prime WhatsApp event for an active subscription', () => {
  assert.deepEqual(
    buildCustomerPrimeWhatsAppDispatch({
      subscriptionId: 'subscription-1',
      status: 'ACTIVE',
      customerName: 'Test Customer',
      whatsappNumber: '8109912840',
      mobile: '3242342342',
    }),
    {
      eventCode: 'CUSTOMER_PRIME_APPROVED',
      relatedEntityType: 'CUSTOMER_PRIME_SUBSCRIPTION',
      relatedEntityId: 'subscription-1',
      recipientType: 'CUSTOMER',
      recipientPhone: '8109912840',
      payloadSnapshot: {
        subscriptionId: 'subscription-1',
        status: 'ACTIVE',
        customerName: 'Test Customer',
      },
      templateComponents: [{
        type: 'body',
        parameters: [
          { type: 'text', text: 'subscription-1' },
          { type: 'text', text: 'ACTIVE' },
          { type: 'text', text: 'Test Customer' },
        ],
      }],
    },
  );
});

test('does not build an event for an inactive subscription or missing contact', () => {
  assert.equal(buildCustomerPrimeWhatsAppDispatch({ subscriptionId: 'subscription-2', status: 'PENDING', mobile: '3242342342' }), null);
  assert.equal(buildCustomerPrimeWhatsAppDispatch({ subscriptionId: 'subscription-3', status: 'ACTIVE' }), null);
});
