import assert from 'node:assert/strict';
import test from 'node:test';
import { financialYearLabel, nextVehicleSaleInvoiceNumber, renderVehicleSaleInvoicePdf } from './vehicleSaleInvoice';

test('labels the Indian financial year from April', () => {
  assert.equal(financialYearLabel(new Date('2026-03-31T10:00:00')), '2025-26');
  assert.equal(financialYearLabel(new Date('2026-04-01T10:00:00')), '2026-27');
});

test('continues the invoice sequence within the financial year', () => {
  const date = new Date('2026-10-20T10:00:00');
  assert.equal(nextVehicleSaleInvoiceNumber(date, []), 'JCBX/SV/2026-27/0001');
  assert.equal(
    nextVehicleSaleInvoiceNumber(date, ['JCBX/SV/2026-27/0007', 'JCBX/SV/2025-26/0042']),
    'JCBX/SV/2026-27/0008',
  );
});

test('renders a PDF invoice', async () => {
  const buffer = await renderVehicleSaleInvoicePdf({
    company: { companyName: 'JCB Exchange', gstin: '22ABCDE1234F1Z5', address: 'Raipur', city: 'Raipur', state: 'Chhattisgarh', termsAndConditions: null },
    invoiceNumber: 'JCBX/SV/2026-27/0001',
    invoiceDate: new Date('2026-10-20T10:00:00'),
    recordNumber: 'SA-2026-001',
    customer: { name: 'Buyer', mobile: '9876543210', city: 'Raipur', state: 'Chhattisgarh' },
    vehicle: { title: 'JCB 3DX', brand: 'JCB', model: '3DX', category: 'Backhoe Loader', registrationNumber: 'CG04AB1234', chassisNumber: 'CH123' },
    saleType: 'EXCHANGE',
    saleAmount: 1200000,
    exchangeVehicle: 'Old JCB 2DX',
    exchangeValue: 300000,
    amountReceived: 900000,
  });
  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
  assert.match(buffer.toString('latin1'), /\/Count 1\b/);
});
