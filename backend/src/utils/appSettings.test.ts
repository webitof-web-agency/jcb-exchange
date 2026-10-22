import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCompanyInvoiceSettings } from './appSettings';

test('normalizes the company CIN for invoice documents', () => {
  const settings = normalizeCompanyInvoiceSettings({
    cin: ' u46594ct2026opc020990 ',
    country: ' India ',
    authorisedSignatoryName: ' Mitali Sharma ',
    authorisedSignatoryDesignation: ' Director ',
  });

  assert.equal(settings.cin, 'U46594CT2026OPC020990');
  assert.equal(settings.country, 'India');
  assert.equal(settings.authorisedSignatoryName, 'Mitali Sharma');
  assert.equal(settings.authorisedSignatoryDesignation, 'Director');
});
