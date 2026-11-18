import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE,
  validateVehicleSaleInvoiceWhatsAppTemplate,
} from './vehicleSaleInvoiceWhatsAppTemplate';

test('defines the Meta template contract used by vehicle sale invoice delivery', () => {
  assert.deepEqual(VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE, {
    name: 'marketplace_vehicle_sale_invoice',
    language: 'en_US',
    category: 'MARKETPLACE',
    header: { type: 'DOCUMENT' },
    body: 'Hello {{1}},\n\nYour vehicle sale invoice is ready.\nVehicle: {{2}}\nRegistration: {{3}}\nInvoice no.: {{4}}\nAmount: {{5}}\n\nDownload invoice: {{6}}\n\nThank you for choosing JCB Exchange.',
    footer: 'JCB Exchange',
    bodyVariableCount: 6,
  });
});

test('accepts the required DOCUMENT header and six invoice variables', () => {
  assert.equal(
    validateVehicleSaleInvoiceWhatsAppTemplate({
      name: VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.name,
      components: [
        { type: 'HEADER', format: 'DOCUMENT' },
        {
          type: 'BODY',
          text: VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.body,
          example: { body_text: [['Aman', 'JCB 3DX', 'CG04AB1234', 'INV-1', '₹1,00,000', 'https://example.test/invoice']] },
        },
        { type: 'FOOTER', text: VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.footer },
      ],
    }),
    true,
  );
});

test('rejects invoice templates without a DOCUMENT header', () => {
  assert.throws(
    () => validateVehicleSaleInvoiceWhatsAppTemplate({
      name: VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.name,
      components: [{ type: 'HEADER', format: 'TEXT' }, { type: 'BODY', text: VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.body }],
    }),
    /DOCUMENT header/,
  );
});
