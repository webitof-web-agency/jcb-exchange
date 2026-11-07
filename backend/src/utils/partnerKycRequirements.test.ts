import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  arePartnerRequiredDocumentsComplete,
  getPartnerAllowedDocumentTypes,
  getPartnerRequiredDocumentTypes,
  isLegacyPartnerDocumentType,
} from './partnerKycRequirements';

test('managed partner KYC requires only the verified GST certificate', () => {
  assert.deepEqual(getPartnerRequiredDocumentTypes('SHOWROOM'), ['GST_CERTIFICATE']);
  assert.deepEqual(getPartnerRequiredDocumentTypes('BROKER'), ['GST_CERTIFICATE']);
});

test('legacy identity documents remain allowed for preservation but are not required', () => {
  const allowed = getPartnerAllowedDocumentTypes('SHOWROOM');

  assert.ok(allowed.includes('GST_CERTIFICATE'));
  assert.ok(allowed.includes('PAN_CARD'));
  assert.ok(allowed.includes('AADHAAR_CARD'));
  assert.ok(allowed.includes('PASSPORT_PHOTO'));
  assert.equal(isLegacyPartnerDocumentType('PAN_CARD'), true);
  assert.equal(isLegacyPartnerDocumentType('GST_CERTIFICATE'), false);
});

test('verified GST template completes KYC without legacy identity documents', () => {
  assert.equal(
    arePartnerRequiredDocumentsComplete(
      [{ documentType: 'GST_CERTIFICATE', verificationTemplateId: 'gst-template-1' }],
      'AUTHORIZED_PLACE',
    ),
    true,
  );
  assert.equal(
    arePartnerRequiredDocumentsComplete(
      [{ documentType: 'PAN_CARD', fileUrl: '/legacy-pan.pdf' }],
      'AUTHORIZED_PLACE',
    ),
    false,
  );
});
