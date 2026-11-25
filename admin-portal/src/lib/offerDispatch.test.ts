import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

import api from './api';
import {
  chosenOfferChannels,
  describeOfferChannelReason,
  describeOfferDispatch,
  describeOfferStatusAction,
  offerHrmApi,
} from './offerHrm';

const sent = (channel: 'email' | 'whatsapp' | 'sms') => ({ channel, ok: true, result: { queued: true } });

test('all channels sent: success, and allSucceeded (a boolean) is not read as a channel', () => {
  const dispatch = describeOfferDispatch({ email: sent('email'), whatsapp: sent('whatsapp'), sms: sent('sms'), allSucceeded: true });
  assert.deepEqual(dispatch.sent, ['email', 'whatsapp', 'sms']);
  assert.deepEqual(dispatch.failed, []);
  assert.deepEqual(dispatch.notConfigured, []);
  assert.equal(dispatch.tone, 'success');
  assert.equal(dispatch.summary, 'Sent by Email, WhatsApp and SMS.');
});

test('a channel that is switched off is "not set up", not a failure', () => {
  const dispatch = describeOfferDispatch({
    email: sent('email'),
    whatsapp: sent('whatsapp'),
    sms: { channel: 'sms', ok: false, reason: 'INTEGRATION_DISABLED', result: { queued: false, reason: 'INTEGRATION_DISABLED' } },
    allSucceeded: false,
  });
  assert.deepEqual(dispatch.notConfigured, [{ channel: 'sms', reason: 'INTEGRATION_DISABLED' }]);
  assert.deepEqual(dispatch.failed, []);
  assert.equal(dispatch.tone, 'warning');
  assert.equal(dispatch.summary, 'Sent by Email and WhatsApp. SMS is not set up (switch it on in Settings > SMS).');
});

test('not chosen, no recipient, already sent and template problems', () => {
  const dispatch = describeOfferDispatch({
    email: { channel: 'email', ok: false, reason: 'RECIPIENT_MISSING' },
    // WhatsApp / SMS answer { queued: false, duplicate: true } with no reason.
    whatsapp: { channel: 'whatsapp', ok: false, result: { queued: false, duplicate: true, messageLogId: 'm1' } },
    sms: { channel: 'sms', ok: false, skipped: true, reason: 'NOT_SELECTED' },
    allSucceeded: false,
  });
  assert.deepEqual(dispatch.skipped, ['sms']);
  assert.deepEqual(dispatch.notConfigured, [{ channel: 'email', reason: 'RECIPIENT_MISSING' }, { channel: 'whatsapp', reason: 'DUPLICATE' }]);
  assert.match(dispatch.summary, /^Nothing was sent\. Email was not sent: the candidate has no valid email address\. WhatsApp was already sent/);
  assert.doesNotMatch(dispatch.summary, /SMS/, 'a channel HR did not choose is not mentioned');
  for (const reason of ['TEMPLATE_DISABLED', 'AUTOMATION_DISABLED', 'MESSAGE_ID_REQUIRED', 'APPROVED_TEMPLATE_REQUIRED', 'RULE_DISABLED', 'SETTINGS_DISABLED', 'ALREADY_QUEUED', 'NOTIFICATION_PREFERENCE_DISABLED', 'INVALID_TEMPLATE_CONFIGURATION', 'DOCUMENT_UNAVAILABLE', 'RECIPIENT_PHONE_REQUIRED', 'RECIPIENT_PHONE_INVALID']) {
    const one = describeOfferDispatch({ email: sent('email'), whatsapp: { channel: 'whatsapp', ok: false, reason, error: 'details' }, sms: sent('sms') });
    assert.deepEqual(one.failed, [], `${reason} is not a delivery failure`);
    assert.equal(one.notConfigured[0]?.reason, reason);
  }
  assert.match(describeOfferChannelReason('whatsapp', 'INVALID_TEMPLATE_CONFIGURATION'), /template in Settings > WhatsApp/);
  assert.match(describeOfferChannelReason('sms', 'RECIPIENT_PHONE_INVALID'), /no valid mobile number/);
});

test('real failures keep the provider error; the same error on several channels is said once', () => {
  const dispatch = describeOfferDispatch({
    email: sent('email'),
    whatsapp: { channel: 'whatsapp', ok: false, reason: 'DISPATCH_ERROR' },
    sms: { channel: 'sms', ok: false, error: 'Provider rejected the number', result: { queued: true, sent: false } },
  });
  assert.deepEqual(dispatch.failed, [{ channel: 'whatsapp', error: 'it could not be sent.' }, { channel: 'sms', error: 'Provider rejected the number.' }]);
  assert.equal(dispatch.tone, 'warning');
  assert.equal(dispatch.summary, 'Sent by Email. WhatsApp failed: it could not be sent. SMS failed: Provider rejected the number. Check the message logs, and resend if needed.');

  const pdfMissing = { ok: false, error: 'The offer letter PDF is unavailable.' };
  const all = describeOfferDispatch({ email: { channel: 'email', ...pdfMissing }, whatsapp: { channel: 'whatsapp', ...pdfMissing }, sms: { channel: 'sms', ...pdfMissing }, allSucceeded: false });
  assert.equal(all.summary, 'Nothing was sent. Email, WhatsApp and SMS failed: The offer letter PDF is unavailable. Check the message logs, and resend if needed.');
});

test('a missing or malformed answer never throws', () => {
  for (const value of [undefined, null, 'x', 42, [], {}, { allSucceeded: true }]) {
    const dispatch = describeOfferDispatch(value);
    assert.deepEqual(dispatch.sent, []);
    assert.equal(dispatch.tone, 'warning');
    assert.match(dispatch.summary, /did not say which messages went out/);
  }
  const partial = describeOfferDispatch({ email: sent('email'), whatsapp: true, sms: null });
  assert.deepEqual(partial.sent, ['email']);
  assert.deepEqual(partial.failed.map((item) => item.channel), ['whatsapp', 'sms']);
  assert.match(partial.summary, /WhatsApp and SMS failed: no result came back\./);
});

test('resend: the ticked channels are posted, and the dialog no longer promises every channel', async () => {
  assert.deepEqual(chosenOfferChannels({ sms: true, email: true, whatsapp: false }), ['email', 'sms']);
  assert.deepEqual(chosenOfferChannels({}), []);

  const post = mock.method(api, 'post', async () => ({ data: { success: true } }));
  try {
    await offerHrmApi.resend('offer/1', ['whatsapp']);
    assert.equal(post.mock.callCount(), 1);
    assert.deepEqual(post.mock.calls[0]?.arguments, ['/recruitment/admin/offers/offer%2F1/resend', { channels: ['whatsapp'] }]);
  } finally {
    post.mock.restore();
  }

  const resend = describeOfferStatusAction('SENT', 'Asha', 'SENT');
  assert.match(resend, /old link stops working/);
  assert.doesNotMatch(resend, /WhatsApp and SMS/);
  assert.match(describeOfferStatusAction('SENT', 'Asha', 'EXPIRED'), /Re-open this expired offer/);
});
