import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfferCommunicationPayload, parseOfferChannels } from './recruitmentOfferCommunication.service';
import { resolveOfferResponseOrigin, verifyOfferResponseToken } from '../utils/offerResponseToken';

const offer = {
  id: 'offer-1234',
  responseTokenVersion: 3,
  offerValidUntil: new Date('2026-12-31T00:00:00.000Z'),
  joiningDate: new Date('2027-01-04T00:00:00.000Z'),
  offerLetterUrl: 'https://api.example.test/documents/secure/drive-file-1',
  offerLetterFileName: 'Offer_Letter.pdf',
  candidate: { fullName: 'Asha Candidate' },
  application: { id: 'application-1234', applicationRef: 'JCB-001' },
  job: { title: 'Site Engineer' },
  designation: 'Senior Site Engineer',
};

test('offer communication payload contains the live PDF URL and secure response URL', () => {
  const payload = buildOfferCommunicationPayload(offer);
  const origin = resolveOfferResponseOrigin().replace(/\/+$/, '');
  assert.equal(payload.offerLetterUrl, 'https://api.example.test/documents/secure/drive-file-1');
  assert.equal(payload.offerLetterFileName, 'Offer_Letter.pdf');
  assert.equal(payload.candidateName, 'Asha Candidate');
  assert.equal(payload.offerResponseUrl.startsWith(`${origin}/offer-response/offer1.`), true);
  // Without a short link the short fields are empty, the long link still works.
  assert.equal(payload.offerShortUrl, '');
  assert.equal(payload.offerShortCode, '');
  assert.equal(payload.offerValidUntil, '2026-12-31');
  assert.equal(payload.joiningDate, '2027-01-04');
  assert.deepEqual(payload.offerLink, { offerId: 'offer-1234', tokenVersion: 3 });
});

test('with a short link both links share its expiry and the short URL ends in the code', () => {
  const expiresAt = new Date('2027-06-01T00:00:00.000Z');
  const payload = buildOfferCommunicationPayload(offer, { code: 'Ab3dEf7h', expiresAt });
  assert.equal(payload.offerShortCode, 'Ab3dEf7h');
  assert.equal(payload.offerShortUrl, `${resolveOfferResponseOrigin().replace(/\/+$/, '')}/o/Ab3dEf7h`);
  const token = decodeURIComponent(payload.offerResponseUrl.split('/offer-response/')[1]!);
  const verified = verifyOfferResponseToken(token, undefined, Math.floor(Date.parse('2027-01-01T00:00:00.000Z') / 1000));
  assert.equal(verified?.offerId, 'offer-1234');
  assert.equal(verified?.version, 3);
  assert.equal(verified?.expiresAt, Math.floor(expiresAt.getTime() / 1000));
});

test('resend channel choice', () => {
  assert.equal(parseOfferChannels(undefined), undefined);
  assert.deepEqual(parseOfferChannels(['SMS', 'email', 'fax']), ['email', 'sms']);
  assert.deepEqual(parseOfferChannels('whatsapp, sms'), ['whatsapp', 'sms']);
  assert.deepEqual(parseOfferChannels([]), []);
});
