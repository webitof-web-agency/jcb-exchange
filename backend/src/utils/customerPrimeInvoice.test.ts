import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCustomerPrimeInvoiceData, renderCustomerPrimeInvoicePdf } from './customerPrimeInvoice';

test('builds the Prime invoice with the same number and GST split as the profile invoice', () => {
  const invoice = buildCustomerPrimeInvoiceData({
    settings: {
      companyName: 'JCB Exchange',
      gstin: '27ABCDE1234F1Z5',
      address: 'Mumbai address',
      state: 'Maharashtra',
      city: 'Mumbai',
      defaultGstRate: 18,
      termsAndConditions: 'Computer generated invoice.',
    },
    payment: {
      id: '12345678-90ab-cdef-1234-567890abcdef',
      memberName: 'Rahul Sharma',
      planName: 'JCB Exchange Prime - 30 days',
      amount: 1180,
      submittedAt: '2026-10-12T10:00:00.000Z',
      transactionRef: 'UPI123',
      customerEmail: 'rahul@example.com',
      customerMobile: '9876543210',
      customerCity: 'Pune',
      customerState: 'Maharashtra',
    },
  });

  assert.equal(invoice.invoiceNumber, 'INV-1234567890');
  assert.equal(invoice.totalAmount, 1180);
  assert.equal(invoice.taxableValue, 1000);
  assert.equal(invoice.totalTax, 180);
  assert.equal(invoice.cgstAmount, 90);
  assert.equal(invoice.sgstAmount, 90);
  assert.equal(invoice.igstAmount, 0);
  assert.match(invoice.formattedDate, /12\/10\/2026/);
});

test('uses IGST when the customer state differs from the supplier state', () => {
  const invoice = buildCustomerPrimeInvoiceData({
    settings: {
      companyName: 'JCB Exchange',
      gstin: null,
      address: null,
      state: 'Maharashtra',
      city: 'Mumbai',
      defaultGstRate: 18,
      termsAndConditions: null,
    },
    payment: {
      id: 'abcdef1234567890',
      memberName: 'Customer',
      planName: 'Prime Membership',
      amount: 1180,
      submittedAt: '2026-10-12T10:00:00.000Z',
      customerState: 'Delhi',
    },
  });

  assert.equal(invoice.cgstAmount, 0);
  assert.equal(invoice.sgstAmount, 0);
  assert.equal(invoice.igstAmount, 180);
});

test('renders a valid PDF from the invoice data', async () => {
  const invoice = buildCustomerPrimeInvoiceData({
    settings: {
      companyName: 'JCB Exchange',
      gstin: null,
      address: null,
      state: 'Maharashtra',
      city: 'Mumbai',
      defaultGstRate: 18,
      termsAndConditions: null,
    },
    payment: {
      id: 'abcdef1234567890',
      memberName: 'Customer',
      planName: 'Prime Membership',
      amount: 1180,
      submittedAt: '2026-10-12T10:00:00.000Z',
    },
  });

  const pdf = await renderCustomerPrimeInvoicePdf(invoice);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 1000);
});
