import test from 'node:test';
import assert from 'node:assert/strict';
import { maskOfferLinks } from '../../utils/offerShortCode';
import { getRecruitmentTemplateComponents } from './recruitmentTemplatePolicy';
import {
  fillOfferLinkPlaceholders,
  hasOfferLinkPlaceholders,
  OFFER_LINK_PLACEHOLDERS,
  offerLinkSkipMessage,
  readOfferLinkRef,
  withOfferLinkPlaceholders,
} from './offerLinkBinding';

const links = {
  offerResponseUrl: 'https://jcbexchange.com/offer-response/signed.token.value',
  offerShortUrl: 'https://jcbexchange.com/o/Ab3dEf7h',
  offerShortCode: 'Ab3dEf7h',
};
const payload = {
  candidateName: 'Asha',
  applicationId: 'app-1',
  applicationRef: 'JCB-001',
  jobTitle: 'Site Engineer',
  designation: 'Senior Site Engineer',
  offerValidUntil: '2026-12-05',
  ...links,
  offerLink: { offerId: 'offer-1', tokenVersion: 3 },
};
const template = [
  { type: 'HEADER', format: 'DOCUMENT' },
  { type: 'BODY', text: '{{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{7}}' },
  { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'View offer', url: 'https://jcbexchange.com/o/{{1}}' }] },
];

test('reads the link version a message was written for', () => {
  assert.deepEqual(readOfferLinkRef(payload), { offerId: 'offer-1', tokenVersion: 3 });
  assert.equal(readOfferLinkRef({}), null);
  assert.equal(readOfferLinkRef({ offerLink: { offerId: '', tokenVersion: 1 } }), null);
  assert.equal(readOfferLinkRef({ offerLink: { offerId: 'offer-1', tokenVersion: '3' } }), null);
  assert.equal(readOfferLinkRef(null), null);
});

test('the stored message holds placeholders, not the link, the short URL or the code', () => {
  const stored = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', withOfferLinkPlaceholders(payload), template);
  const text = JSON.stringify(stored);
  assert.equal(text.includes('signed.token.value'), false);
  assert.equal(text.includes('Ab3dEf7h'), false);
  assert.equal(hasOfferLinkPlaceholders(stored), true);
  assert.deepEqual((stored[0]?.parameters as unknown[])[5], { type: 'text', text: OFFER_LINK_PLACEHOLDERS.offerShortUrl });
  assert.deepEqual(stored[1], { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: OFFER_LINK_PLACEHOLDERS.offerShortCode }] });
});

test('placeholders are set even when the short link was not made yet at dispatch', () => {
  const stored = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', withOfferLinkPlaceholders({ ...payload, offerShortUrl: '', offerShortCode: '' }), template);
  assert.deepEqual(stored[1]?.parameters, [{ type: 'text', text: OFFER_LINK_PLACEHOLDERS.offerShortCode }]);
});

test('delivery fills the current link values and leaves no placeholder', () => {
  const stored = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', withOfferLinkPlaceholders(payload), template);
  const filled = fillOfferLinkPlaceholders(stored, links);
  assert.deepEqual(filled, getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', payload, template));
  assert.equal(hasOfferLinkPlaceholders(filled), false);
  // The stored copy is not changed.
  assert.equal(hasOfferLinkPlaceholders(stored), true);
});

test('the masked log copy of an offer payload has no link in clear', () => {
  const logged = maskOfferLinks({
    ...payload,
    templateComponents: getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', withOfferLinkPlaceholders(payload), template),
  });
  const text = JSON.stringify(logged);
  assert.equal(text.includes('signed.token.value'), false);
  assert.equal(text.includes('Ab3dEf7h'), false);
  assert.deepEqual(logged.offerLink, { offerId: 'offer-1', tokenVersion: 3 });
});

test('skip reasons match the log text agreed for every channel', () => {
  assert.equal(offerLinkSkipMessage('LINK_SUPERSEDED'), 'Offer link superseded by a resend');
  assert.equal(offerLinkSkipMessage('OFFER_NOT_OPEN'), 'Offer is no longer open');
  assert.equal(offerLinkSkipMessage('OFFER_NOT_FOUND'), 'Offer is no longer open');
});
