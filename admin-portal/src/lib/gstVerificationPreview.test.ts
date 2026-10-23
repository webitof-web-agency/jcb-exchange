import assert from 'node:assert/strict';
import test from 'node:test';
import { getGstPreviewFields, getUnmaskedGstPreviewResult, removeMaskedGstFields } from './gstVerificationPreview';

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

test('keeps every GST response field while removing only masked keys from preview data', () => {
  const result = getUnmaskedGstPreviewResult(
    {
      maskedGstin: '22AA********1ZR',
      legalName: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
      providerData: {
        gstin: '22AAHCJ5752E1ZR',
        masked_gstin: '22AA********1ZR',
        filingStatus: [{ returnType: 'GSTR3B', status: 'Filed' }],
      },
      nested: { maskedValue: 'hidden', retainedValue: 'visible' },
    },
    '22AAHCJ5752E1ZR',
  );

  assert.deepEqual(result, {
    gstin: '22AAHCJ5752E1ZR',
    legalName: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
    providerData: {
      gstin: '22AAHCJ5752E1ZR',
      filingStatus: [{ returnType: 'GSTR3B', status: 'Filed' }],
    },
    nested: { retainedValue: 'visible' },
  });
  assert.deepEqual(removeMaskedGstFields({ maskedGstin: '22AA********1ZR', gstin: '22AAHCJ5752E1ZR' }), {
    gstin: '22AAHCJ5752E1ZR',
  });
});
