import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildGstDisplayGroups,
  hasGstTemplateContent,
  shouldRenderCanonicalGstTemplate,
  type PartnerGstVerificationResponse,
} from './partnerGstVerification';

test('builds read-only GST groups with normalized and additional verified data', () => {
  const groups = buildGstDisplayGroups({
    gstin: '08AKWPJ1234H1ZN',
    legalName: 'JCB Legal Name',
    businessName: 'JCB Exchange',
    gstinStatus: 'Active',
    address: 'Jaipur, Rajasthan',
    filingStatus: [{ returnType: 'GSTR1', status: 'Filed' }],
    providerData: { taxpayer_type: 'Regular', custom_field: 'Retained value' },
  });

  assert.equal(groups.find((group) => group.key === 'business')?.fields.some((field) => field.key === 'legalName'), true);
  assert.equal(groups.find((group) => group.key === 'registration')?.fields.some((field) => field.key === 'gstinStatus'), true);
  assert.equal(groups.some((group) => group.key === 'additional'), true);
});

test('treats a saved GST template as available even when the retained result is null', () => {
  const savedTemplateResponse = {
    available: true,
    result: null,
    template: null,
    record: { template: { id: 'template-1' } },
  } as unknown as PartnerGstVerificationResponse;

  assert.equal(hasGstTemplateContent(savedTemplateResponse), true);
});

test('uses the canonical KYC certificate when the retained GST result exists', () => {
  assert.equal(shouldRenderCanonicalGstTemplate({ result: { gstin: '08AKWPJ1234H1ZN' } }), true);
  assert.equal(shouldRenderCanonicalGstTemplate({ result: null }), false);
});

test('keeps the Auth page wired to the same KYC template modal', () => {
  const pageSource = readFileSync(
    new URL('../app/(partner)/partner/auth/page.tsx', import.meta.url),
    'utf8',
  );

  assert.match(pageSource, /PartnerKycTemplateModal/);
});
