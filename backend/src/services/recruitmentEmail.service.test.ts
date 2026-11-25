import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfferEmailVariables,
  classifyEmailDeliveryError,
  decideOfferEmailDelivery,
  EmailDeliveryCancelled,
  emailOutcomeUpdates,
  getEmailAttachmentMode,
  offerEmailLinkVersion,
  renderRecruitmentEmail,
  signedCopyContentType,
} from './recruitmentEmail.service';
import { getCommunicationEvent } from './communicationEventRegistry';

const offer = {
  designation: 'State Manager',
  joiningDate: new Date('2026-12-01T00:00:00.000Z'),
  offerValidUntil: null,
  candidate: { fullName: 'Asha Verma' },
  application: { applicationRef: 'JCB-JOB-2026-000042' },
  job: { title: 'State Manager - Sales' },
};

test('renders subject and HTML body with escaped recipient variables', () => {
  const rendered = renderRecruitmentEmail(
    {
      subject: 'Offer for {{candidate_name}} - {{job_title}}',
      bodyHtml: '<p>Dear {{candidate_name}}</p><p>{{joining_date}}</p>',
    },
    {
      candidate_name: '<Asha>',
      job_title: 'State Manager',
      joining_date: '21/11/2026',
    },
  );

  assert.equal(rendered.subject, 'Offer for <Asha> - State Manager');
  assert.equal(rendered.bodyHtml, '<p>Dear &lt;Asha&gt;</p><p>21/11/2026</p>');
});

test('keeps safe response links while stripping unsafe markup', () => {
  const rendered = renderRecruitmentEmail(
    { subject: 'Offer', bodyHtml: '<p><a href="{{offer_response_url}}">Respond</a><script>alert(1)</script></p>' },
    { offer_response_url: 'https://portal.example.test/offer-response/token' },
  );
  assert.match(rendered.bodyHtml, /href="https:\/\/portal\.example\.test\/offer-response\/token"/);
  assert.doesNotMatch(rendered.bodyHtml, /script|alert/);
});

test('attachment modes are restricted to supported delivery policies', () => {
  assert.equal(getEmailAttachmentMode('DYNAMIC_OFFER_PDF'), 'DYNAMIC_OFFER_PDF');
  assert.equal(getEmailAttachmentMode('NONE'), 'NONE');
  assert.equal(getEmailAttachmentMode('dummy.pdf'), 'NONE');
});

test('offer email variables carry both links, dates as YYYY-MM-DD and blank optional dates', () => {
  const variables = buildOfferEmailVariables(offer, {
    offerResponseUrl: 'https://jcbexchange.com/offer-response/offer1.abc.def',
    offerShortUrl: 'https://jcbexchange.com/o/Ab3dEf7h',
  });
  assert.equal(variables.offer_short_url, 'https://jcbexchange.com/o/Ab3dEf7h');
  assert.equal(variables.offer_response_url, 'https://jcbexchange.com/offer-response/offer1.abc.def');
  assert.equal(variables.joining_date, '2026-12-01');
  assert.equal(variables.offer_valid_until, '');
  assert.equal(variables.application_ref, 'JCB-JOB-2026-000042');
  assert.equal(variables.application_id, 'JCB-JOB-2026-000042');
  assert.equal(
    buildOfferEmailVariables({ ...offer, offerValidUntil: new Date('2026-12-10T00:00:00.000Z') }, { offerResponseUrl: 'x' }).offer_valid_until,
    '2026-12-10',
  );
});

test('without a short link, offer_short_url falls back to the long link so either variable works', () => {
  const longUrl = 'https://jcbexchange.com/offer-response/offer1.abc.def';
  assert.equal(buildOfferEmailVariables(offer, { offerResponseUrl: longUrl, offerShortUrl: '' }).offer_short_url, longUrl);
  assert.equal(buildOfferEmailVariables(offer, { offerResponseUrl: longUrl }).offer_short_url, longUrl);
  assert.equal(buildOfferEmailVariables(offer, { offerResponseUrl: longUrl, offerShortUrl: null }).offer_short_url, longUrl);
});

test('the default offer email renders a working sign link and every declared value', () => {
  const event = getCommunicationEvent('RECRUITMENT_OFFER_SENT')!;
  const variables = buildOfferEmailVariables(offer, { offerResponseUrl: 'https://jcbexchange.com/offer-response/t', offerShortUrl: 'https://jcbexchange.com/o/Ab3dEf7h' });
  for (const name of event.variables) assert.ok(name in variables, `offer email must provide ${name}`);
  const rendered = renderRecruitmentEmail({ subject: event.defaultSubject, bodyHtml: event.defaultBodyHtml }, variables);
  assert.match(rendered.bodyHtml, /<a href="https:\/\/jcbexchange\.com\/o\/Ab3dEf7h"[^>]*>View &amp; sign your offer<\/a>/);
  assert.doesNotMatch(rendered.bodyHtml, /\{\{/);
  assert.equal(rendered.subject, 'Job offer for State Manager - Sales - JCB Exchange');
});

test('stale-link decision: only an open, current link is sent; the rest are skipped with a reason', () => {
  const open = decideOfferEmailDelivery({ open: true, offerResponseUrl: 'https://x/offer-response/t', offerShortUrl: 'https://x/o/Ab3dEf7h', offerShortCode: 'Ab3dEf7h' });
  assert.deepEqual(open, { send: true, links: { offerResponseUrl: 'https://x/offer-response/t', offerShortUrl: 'https://x/o/Ab3dEf7h' } });
  assert.deepEqual(decideOfferEmailDelivery({ open: false, reason: 'LINK_SUPERSEDED' }), { send: false, reason: 'Offer link superseded by a resend' });
  assert.deepEqual(decideOfferEmailDelivery({ open: false, reason: 'OFFER_NOT_OPEN' }), { send: false, reason: 'Offer is no longer open' });
  assert.deepEqual(decideOfferEmailDelivery({ open: false, reason: 'OFFER_NOT_FOUND' }), { send: false, reason: 'Offer no longer exists' });
});

test('the link version is read from new rows and from rows queued before late binding', () => {
  assert.equal(offerEmailLinkVersion({ kind: 'OFFER', offerId: 'offer-1', offerLink: { offerId: 'offer-1', tokenVersion: 3 } }), 3);
  assert.equal(offerEmailLinkVersion({ offerId: 'offer-1', templateCode: 'OFFER_SENT', offerLink: { offerId: 'offer-1', tokenVersion: 2 } }), 2);
  const legacy = { offerId: 'offer-1', responseTokenCiphertext: 'v1.cipher' };
  assert.equal(offerEmailLinkVersion(legacy, () => ({ offerId: 'offer-1', version: 4 })), 4);
  // A token for another offer, or one that no longer verifies, gives no version: such a row is never sent.
  assert.equal(offerEmailLinkVersion(legacy, () => ({ offerId: 'offer-2', version: 4 })), null);
  assert.equal(offerEmailLinkVersion(legacy, () => null), null);
  assert.equal(offerEmailLinkVersion({ offerId: 'offer-1', offerLink: { tokenVersion: 0 } }), null);
  assert.equal(offerEmailLinkVersion(null), null);
  assert.equal(offerEmailLinkVersion('offer-1'), null);
});

test('a delivery is sent, cancelled for good (log SKIPPED) or failed and retried later', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');
  assert.deepEqual(emailOutcomeUpdates({ status: 'SENT' }, 0, now), {
    outbox: { status: 'SENT', processedAt: now, lockedAt: null, lastError: null },
    log: { status: 'SENT', sentAt: now, errorMessage: null },
  });

  const cancelled = classifyEmailDeliveryError(new EmailDeliveryCancelled('Offer link superseded by a resend'));
  assert.deepEqual(cancelled, { status: 'CANCELLED', reason: 'Offer link superseded by a resend' });
  assert.deepEqual(emailOutcomeUpdates(cancelled, 1, now), {
    outbox: { status: 'CANCELLED', processedAt: now, lockedAt: null, nextAttemptAt: null, lastError: 'Offer link superseded by a resend' },
    log: { status: 'SKIPPED', errorMessage: 'Offer link superseded by a resend' },
  });

  const failed = classifyEmailDeliveryError(new Error('SMTP timeout'));
  assert.deepEqual(failed, { status: 'FAILED', error: 'SMTP timeout' });
  const failedUpdates = emailOutcomeUpdates(failed, 1, now);
  assert.equal(failedUpdates.outbox.status, 'FAILED');
  assert.equal(failedUpdates.log.status, 'FAILED');
  assert.equal((failedUpdates.outbox as { nextAttemptAt: Date }).nextAttemptAt.getTime(), now.getTime() + 4 * 60 * 1000);
  assert.deepEqual(classifyEmailDeliveryError('boom'), { status: 'FAILED', error: 'Email delivery failed.' });
});

test('the signed offer copy keeps a PDF or image type and is left out otherwise', () => {
  assert.equal(signedCopyContentType({ fileName: 'signed.pdf', mimeType: 'application/pdf' }), 'application/pdf');
  assert.equal(signedCopyContentType({ fileName: 'scan', mimeType: 'IMAGE/JPEG' }), 'image/jpeg');
  assert.equal(signedCopyContentType({ fileName: 'scan.webp', mimeType: null }), 'image/webp');
  assert.equal(signedCopyContentType({ fileName: 'scan.PNG', mimeType: 'application/octet-stream' }), 'image/png');
  assert.equal(signedCopyContentType({ fileName: 'macro.docm', mimeType: 'application/vnd.ms-word' }), null);
  assert.equal(signedCopyContentType({ fileName: 'noextension', mimeType: '' }), null);
  assert.equal(signedCopyContentType(null), null);
});
