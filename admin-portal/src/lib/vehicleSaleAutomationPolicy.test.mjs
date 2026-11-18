import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultVehicleSaleSmsVariables,
  shouldEnableVehicleSaleAutomationAfterSelection,
  vehicleSaleWhatsAppTemplateName,
} from './vehicleSaleAutomationPolicy.mjs';

test('enables vehicle sale automation when a template or DLT message is selected', () => {
  assert.equal(shouldEnableVehicleSaleAutomationAfterSelection('VEHICLE_SALE_INVOICE', 'template-1'), true);
  assert.equal(shouldEnableVehicleSaleAutomationAfterSelection('VEHICLE_SALE_PAYMENT_RECEIPT', 'template-2'), true);
  assert.equal(shouldEnableVehicleSaleAutomationAfterSelection('LISTING_PAYMENT_APPROVED', 'template-3'), false);
  assert.equal(shouldEnableVehicleSaleAutomationAfterSelection('VEHICLE_SALE_INVOICE', ''), false);
});

test('provides exact DLT variable order for vehicle sale events', () => {
  assert.equal(
    defaultVehicleSaleSmsVariables('VEHICLE_SALE_INVOICE'),
    'customerName|vehicleTitle|registrationNumber|invoiceNumber|invoiceAmount|invoiceUrl',
  );
  assert.equal(
    defaultVehicleSaleSmsVariables('VEHICLE_SALE_PAYMENT_RECEIPT'),
    'customerName|vehicleTitle|amount|receiptNumber|balance|paymentMethod|receiptUrl',
  );
  assert.equal(defaultVehicleSaleSmsVariables('LISTING_PAYMENT_APPROVED'), '');
});

test('maps vehicle sale events to their PDF-capable WhatsApp templates', () => {
  assert.equal(vehicleSaleWhatsAppTemplateName('VEHICLE_SALE_INVOICE'), 'marketplace_vehicle_sale_invoice');
  assert.equal(vehicleSaleWhatsAppTemplateName('VEHICLE_SALE_PAYMENT_RECEIPT'), 'marketplace_vehicle_payment_receipt');
  assert.equal(vehicleSaleWhatsAppTemplateName('LISTING_PAYMENT_APPROVED'), '');
});
