import assert from 'node:assert/strict';
import test from 'node:test';
import {
  areRequiredPartnerAgreementsAccepted,
  buildPartnerAgreementContentHash,
  bumpPartnerAgreementVersion,
  normalizePartnerAgreementInput,
} from './partnerAgreement.service';

test('normalizes partner agreement input for a safe draft', () => {
  assert.deepEqual(
    normalizePartnerAgreementInput({
      agreementType: 'PARTNER_TERMS',
      title: '  Partner Terms  ',
      summary: '  Short summary ',
      content: '<p>Full agreement</p>',
      version: ' v1.2 ',
      applicablePartnerTypes: ['SHOWROOM', 'SHOWROOM', ' BROKER '],
      isRequired: true,
      displayOrder: '4',
      status: 'PUBLISHED',
    }),
    {
      agreementType: 'PARTNER_TERMS',
      title: 'Partner Terms',
      summary: 'Short summary',
      content: '<p>Full agreement</p>',
      version: 'v1.2',
      applicablePartnerTypes: ['SHOWROOM', 'BROKER'],
      isRequired: true,
      displayOrder: 4,
      status: 'PUBLISHED',
    },
  );
});

test('publishes an agreement when status is omitted by the simplified editor', () => {
  assert.equal(
    normalizePartnerAgreementInput({
      agreementType: 'PARTNER_TERMS',
      title: 'Partner Terms',
      content: 'Terms',
    }).status,
    'PUBLISHED',
  );
});

test('increments the patch version for published agreement edits', () => {
  assert.equal(bumpPartnerAgreementVersion('v1.0'), 'v1.1');
  assert.equal(bumpPartnerAgreementVersion('v2.9'), 'v2.10');
});

test('requires every required current-version agreement to be accepted', () => {
  const definitions = [
    { agreementType: 'PARTNER_TERMS', version: 'v1.2', isRequired: true },
    { agreementType: 'MARKETPLACE_TERMS', version: 'v1.0', isRequired: true },
    { agreementType: 'COMMISSION_POLICY', version: 'v1.0', isRequired: false },
  ];

  assert.equal(
    areRequiredPartnerAgreementsAccepted(definitions, [
      { agreementType: 'PARTNER_TERMS', version: 'v1.2' },
      { agreementType: 'MARKETPLACE_TERMS', version: 'v0.9' },
    ]),
    false,
  );
  assert.equal(
    areRequiredPartnerAgreementsAccepted(definitions, [
      { agreementType: 'PARTNER_TERMS', version: 'v1.2' },
      { agreementType: 'MARKETPLACE_TERMS', version: 'v1.0' },
    ]),
    true,
  );
});

test('hashes exact agreement content for audit evidence', () => {
  const firstHash = buildPartnerAgreementContentHash('<p>Terms</p>');
  const secondHash = buildPartnerAgreementContentHash('<p>Terms changed</p>');

  assert.match(firstHash, /^[a-f0-9]{64}$/);
  assert.notEqual(firstHash, secondHash);
});
