import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVehicleSalePaymentReceiptWhatsAppTemplateComponents,
  validateVehicleSalePaymentReceiptWhatsAppTemplate,
  VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE,
} from './vehicleSalePaymentReceiptWhatsAppTemplate';

test('defines the Meta template contract used by payment receipt delivery', () => {
  assert.deepEqual(VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE, {
    name: 'marketplace_vehicle_payment_receipt',
    language: 'en_US',
    category: 'MARKETPLACE',
    header: { type: 'DOCUMENT' },
    body: 'Hello {{1}},\n\nPayment received for your vehicle purchase.\nVehicle: {{2}}\nPaid: {{3}}\nReceipt no.: {{4}}\nBalance due: {{5}}\nPayment method: {{6}}\n\nDownload receipt: {{7}}\n\nThank you for choosing JCB Exchange.',
    footer: 'JCB Exchange',
    bodyVariableCount: 7,
  });
});

test('accepts the exact document-header and seven-variable payment receipt template', () => {
  assert.equal(validateVehicleSalePaymentReceiptWhatsAppTemplate({
    name: 'marketplace_vehicle_payment_receipt',
    components: [
      { type: 'HEADER', format: 'DOCUMENT' },
      { type: 'BODY', text: 'Hello {{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{7}}' },
    ],
  }), true);
});

test('rejects a payment receipt template that cannot carry the generated PDF', () => {
  assert.throws(
    () => validateVehicleSalePaymentReceiptWhatsAppTemplate({
      name: 'marketplace_vehicle_payment_receipt',
      components: [{ type: 'HEADER', format: 'TEXT' }, { type: 'BODY', text: 'Hello {{1}}' }],
    }),
    /DOCUMENT header/,
  );
});

test('builds registerable components when the admin enters the payment receipt template body', () => {
  const components = buildVehicleSalePaymentReceiptWhatsAppTemplateComponents(
    VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE.body,
  );
  assert.equal(validateVehicleSalePaymentReceiptWhatsAppTemplate({
    name: VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE.name,
    components,
  }), true);
  assert.deepEqual(components[0], { type: 'HEADER', format: 'DOCUMENT' });
});
