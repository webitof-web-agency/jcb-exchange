import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateVehicleSaleCommunicationReadiness,
  type VehicleSaleCommunicationInput,
} from './vehicleSaleCommunicationConfig.service';

const readyInput = (): VehicleSaleCommunicationInput => ({
  whatsapp: {
    enabled: true,
    credentialsConfigured: true,
    rules: {
      VEHICLE_SALE_INVOICE: { enabled: true, templateLinked: true, templateApproved: true, metaTemplateId: 'wa-invoice' },
      VEHICLE_SALE_PAYMENT_RECEIPT: { enabled: true, templateLinked: true, templateApproved: true, metaTemplateId: 'wa-receipt' },
    },
  },
  sms: {
    enabled: true,
    credentialsConfigured: true,
    rules: {
      VEHICLE_SALE_INVOICE: { enabled: true, messageId: '170716100000001', variablesTemplate: 'customerName|vehicleTitle|registrationNumber|invoiceNumber|invoiceAmount|invoiceUrl' },
      VEHICLE_SALE_PAYMENT_RECEIPT: { enabled: true, messageId: '170716100000002', variablesTemplate: 'customerName|vehicleTitle|amount|receiptNumber|balance|paymentMethod|receiptUrl' },
    },
  },
});

test('vehicle sale communication readiness passes only when both channels are fully configured', () => {
  const result = evaluateVehicleSaleCommunicationReadiness(readyInput());
  assert.deepEqual(result, {
    whatsapp: { ready: true, missing: [] },
    sms: { ready: true, missing: [] },
  });
});

test('vehicle sale communication readiness reports missing SMS DLT rules without hiding the cause', () => {
  const input = readyInput();
  input.sms.rules.VEHICLE_SALE_INVOICE = { enabled: false, messageId: null, variablesTemplate: null };
  input.sms.rules.VEHICLE_SALE_PAYMENT_RECEIPT = { enabled: false, messageId: null, variablesTemplate: null };
  const result = evaluateVehicleSaleCommunicationReadiness(input);
  assert.equal(result.sms.ready, false);
  assert.ok(result.sms.missing.some((item) => item.includes('VEHICLE_SALE_INVOICE: SMS automation rule is disabled.')));
  assert.ok(result.sms.missing.some((item) => item.includes('VEHICLE_SALE_PAYMENT_RECEIPT: approved DLT message ID is missing.')));
});

test('vehicle sale communication readiness rejects an incomplete DLT variable order', () => {
  const input = readyInput();
  input.sms.rules.VEHICLE_SALE_PAYMENT_RECEIPT!.variablesTemplate = 'customerName|amount|receiptUrl';
  const result = evaluateVehicleSaleCommunicationReadiness(input);
  assert.equal(result.sms.ready, false);
  assert.ok(result.sms.missing.some((item) => item.includes('must use this exact variable order')));
});
