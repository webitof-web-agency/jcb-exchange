import assert from 'node:assert/strict';
import test from 'node:test';
import { getGstPreviewFields } from './gstVerificationPreview';

test('builds advanced GST preview fields from normalized provider data without dummy values', () => {
  assert.deepEqual(
    getGstPreviewFields({
      legalName: 'LEGAL NAME',
      businessName: 'TRADE NAME',
      gstinStatus: 'Active',
      annualTurnover: 'Slab: Rs. 1 Cr. to 5 Cr.',
      einvoiceStatus: true,
      filingStatus: [],
      hsnInfo: {},
      providerData: {
        promoters: ['Director One'],
        date_of_registration: '2021-10-20',
      },
    }),
    [
      ['Legal name', 'LEGAL NAME'],
      ['Trade name', 'TRADE NAME'],
      ['GST status', 'Active'],
      ['Registration date', '2021-10-20'],
      ['Annual turnover', 'Slab: Rs. 1 Cr. to 5 Cr.'],
      ['E-invoice eligible', true],
      ['Promoters', ['Director One']],
    ],
  );
});
