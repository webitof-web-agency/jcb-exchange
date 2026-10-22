import assert from 'node:assert/strict';
import test from 'node:test';
import { getGstPreviewFields, getGstVerificationTemplateFields } from './gstVerificationPreview';

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

test('keeps the supplied GST template key order and uses normalized values', () => {
  assert.deepEqual(
    getGstVerificationTemplateFields({
      gstin: '22AAHCJ5752E1ZR',
      maskedGstin: 'AA********1ZR',
      providerClientId: 'corporate_gstin_YtEi',
      panNumber: 'AAHCJ5752E',
      annualTurnoverFy: '2026-27',
      businessName: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
      legalName: 'JCB EXCHANGE (OPC) PRIVATE LIMITED',
      gstinStatus: 'Active',
      dateOfRegistration: '2026-10-02',
      natureOfBusinessActivities: [],
      einvoiceStatus: false,
    }),
    [
      ['Einvoice Status', false],
      ['Client Id', 'corporate_gstin_YtEi'],
      ['Gstin', '22AAHCJ5752E1ZR'],
      ['Pan Number', 'AAHCJ5752E'],
      ['Fy', '2026-27'],
      ['Business Name', 'JCB EXCHANGE (OPC) PRIVATE LIMITED'],
      ['Legal Name', 'JCB EXCHANGE (OPC) PRIVATE LIMITED'],
      ['Date Of Registration', '2026-10-02'],
      ['Gstin Status', 'Active'],
      ['Nature Bus Activities', []],
    ],
  );
});
