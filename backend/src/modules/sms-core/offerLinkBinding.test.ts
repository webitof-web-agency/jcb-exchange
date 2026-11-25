import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySmsOfferLinkResolution,
  buildSmsOutboxSnapshot,
  maskSentOfferLinkValues,
  readSmsOfferLinkRef,
  smsOfferLinkSkipReason,
} from './offerLinkBinding';
import { getMissingSmsTemplateVariables, renderSmsVariables } from './templatePolicy';

const longLink = 'https://jcbexchange.com/offer-response/offer1.eyJvZmZlcklkIjoib2ZmZXItMSJ9.c2lnbmF0dXJl';
const offerPayload = () => ({
  candidateName: 'Asha Verma',
  applicationRef: 'APP-1042',
  jobTitle: 'Service Engineer',
  designation: 'Engineer',
  offerLetterUrl: 'https://drive.google.com/file/d/abc123/view',
  offerResponseUrl: longLink,
  offerShortUrl: 'https://jcbexchange.com/o/Ab3dEf7h',
  offerShortCode: 'Ab3dEf7h',
  offerValidUntil: '2026-12-05',
  joiningDate: '2027-01-04',
  offerLink: { offerId: 'offer-1234', tokenVersion: 2 },
});

test('reads the offer link version a message was written for', () => {
  assert.deepEqual(readSmsOfferLinkRef(offerPayload()), { offerId: 'offer-1234', tokenVersion: 2 });
  assert.equal(readSmsOfferLinkRef({ candidateName: 'Asha' }), null);
  assert.equal(readSmsOfferLinkRef(null), null);
  assert.equal(readSmsOfferLinkRef({ offerLink: { offerId: '', tokenVersion: 2 } }), null);
  assert.equal(readSmsOfferLinkRef({ offerLink: { offerId: 'offer-1234', tokenVersion: '2' } }), null);
  assert.equal(readSmsOfferLinkRef({ offerLink: { offerId: 'offer-1234', tokenVersion: 1.5 } }), null);
  assert.equal(readSmsOfferLinkRef({ offerLink: ['offer-1234', 2] }), null);
});

test('the outbox copy of an offer SMS keeps the link version but no link in clear', () => {
  const payload = offerPayload();
  const stored = buildSmsOutboxSnapshot(payload);
  const text = JSON.stringify(stored);
  assert.equal(text.includes('Ab3dEf7h'), false);
  assert.equal(text.includes('/offer-response/offer1.'), false);
  assert.deepEqual(stored.offerLink, { offerId: 'offer-1234', tokenVersion: 2 });
  assert.equal(stored.offerShortCode, '****');
  assert.equal(stored.candidateName, 'Asha Verma');
  assert.equal(stored.offerValidUntil, '2026-12-05');
  // The caller's payload (shared with the WhatsApp and email channels) is not changed.
  assert.equal(payload.offerShortCode, 'Ab3dEf7h');
});

test('a message without an offer link is stored unchanged', () => {
  const payload = { customerName: 'Aman', invoiceUrl: 'https://drive.google.com/file/d/xyz/view' };
  assert.deepEqual(buildSmsOutboxSnapshot(payload), payload);
});

test('an open offer is sent with the link values built at delivery time', () => {
  const stored = buildSmsOutboxSnapshot(offerPayload());
  const decision = applySmsOfferLinkResolution(stored, {
    open: true,
    offerResponseUrl: `${longLink}-fresh`,
    offerShortUrl: 'https://jcbexchange.com/o/Zx9kLm2p',
    offerShortCode: 'Zx9kLm2p',
  });
  assert.equal(decision.send, true);
  if (!decision.send) return;
  assert.equal(renderSmsVariables('candidateName|jobTitle|offerShortCode', decision.payload), 'Asha Verma|Service Engineer|Zx9kLm2p');
  assert.equal(renderSmsVariables('offerShortUrl', decision.payload), 'https://jcbexchange.com/o/Zx9kLm2p');
  assert.equal(renderSmsVariables('offerResponseUrl', decision.payload), `${longLink}-fresh`);
  assert.deepEqual(getMissingSmsTemplateVariables('candidateName|offerShortCode', decision.payload), []);
  // The stored snapshot stays masked.
  assert.equal(stored.offerShortCode, '****');
});

test('a superseded or closed offer link is not sent and gets a short reason', () => {
  const stored = buildSmsOutboxSnapshot(offerPayload());
  assert.deepEqual(applySmsOfferLinkResolution(stored, { open: false, reason: 'LINK_SUPERSEDED' }), {
    send: false,
    reason: 'Offer link superseded by a resend',
  });
  assert.deepEqual(applySmsOfferLinkResolution(stored, { open: false, reason: 'OFFER_NOT_OPEN' }), {
    send: false,
    reason: 'Offer is no longer open',
  });
  assert.equal(smsOfferLinkSkipReason('OFFER_NOT_FOUND'), 'Offer no longer exists');
});

test('outbox snapshot fails closed and stored error text never carries the sent link values', () => {
  // Link values but no valid offerLink: still masked, never stored in clear.
  const snapshot = buildSmsOutboxSnapshot({ candidateName: 'Asha', offerShortCode: 'Ab3dEf7h', offerLink: { offerId: 'x', tokenVersion: '2' } });
  assert.equal(snapshot.offerShortCode, '****');
  // Non-offer payloads are untouched (invoice / receipt links are sent as stored).
  assert.deepEqual(buildSmsOutboxSnapshot({ invoiceUrl: 'https://x/inv.pdf' }), { invoiceUrl: 'https://x/inv.pdf' });
  const text = maskSentOfferLinkValues('Invalid variables_values: Asha|Engineer|Ab3dEf7h', { offerShortCode: 'Ab3dEf7h' });
  assert.equal(text, 'Invalid variables_values: Asha|Engineer|****');
});
