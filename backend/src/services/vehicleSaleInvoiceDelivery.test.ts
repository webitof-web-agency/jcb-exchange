import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVehicleSaleInvoiceDeliveryMessage,
  isVehicleSaleInvoiceResendable,
} from './vehicleSaleInvoiceDelivery';

test('builds the shared invoice message payload with the public URL in both channels', () => {
  const message = buildVehicleSaleInvoiceDeliveryMessage({
    customerName: 'Asha Gupta',
    vehicleTitle: 'JCB 3DX 2019',
    registrationNumber: 'CG10BR3769',
    invoiceNumber: 'JCBX/SV/2026-27/0003',
    invoiceAmount: 'Rs. 12,00,000',
    invoiceUrl: 'https://api.jcbexchange.com/api/public/sale-invoices/secure-token',
  });

  assert.deepEqual(message.payloadSnapshot, {
    customerName: 'Asha Gupta',
    vehicleTitle: 'JCB 3DX 2019',
    registrationNumber: 'CG10BR3769',
    invoiceNumber: 'JCBX/SV/2026-27/0003',
    invoiceAmount: 'Rs. 12,00,000',
    invoiceUrl: 'https://api.jcbexchange.com/api/public/sale-invoices/secure-token',
  });
  assert.deepEqual(message.whatsappTemplateComponents, [{
    type: 'body',
    parameters: [
      { type: 'text', text: 'Asha Gupta' },
      { type: 'text', text: 'JCB 3DX 2019' },
      { type: 'text', text: 'CG10BR3769' },
      { type: 'text', text: 'JCBX/SV/2026-27/0003' },
      { type: 'text', text: 'Rs. 12,00,000' },
      { type: 'text', text: 'https://api.jcbexchange.com/api/public/sale-invoices/secure-token' },
    ],
  }]);
});

test('allows resend for any generated invoice, including invoices issued before sale completion', () => {
  assert.equal(isVehicleSaleInvoiceResendable({ invoiceNumber: 'JCBX/SV/2026-27/0003' }), true);
  assert.equal(isVehicleSaleInvoiceResendable({ invoiceNumber: null }), false);
});
