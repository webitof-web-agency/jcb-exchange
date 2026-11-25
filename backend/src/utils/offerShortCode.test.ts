import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfferShortUrl, generateOfferShortCode, isOfferShortCode, maskOfferLinks, OFFER_SHORT_CODE_ALPHABET } from './offerShortCode';

test('short codes are 8 characters from the unambiguous alphabet', () => {
  for (let index = 0; index < 200; index += 1) {
    const code = generateOfferShortCode();
    assert.equal(code.length, 8);
    assert.ok(isOfferShortCode(code), code);
    assert.ok([...code].every((char) => OFFER_SHORT_CODE_ALPHABET.includes(char)));
  }
  assert.equal(isOfferShortCode('abc'), false);
  assert.equal(isOfferShortCode('abcdefg0'), false, 'zero is not in the alphabet');
  assert.equal(isOfferShortCode(undefined), false);
});

test('biased bytes are skipped (rejection sampling)', () => {
  // 255 is above the unbiased limit for a 55-character alphabet, so it never becomes a character.
  let calls = 0;
  const code = generateOfferShortCode((size) => { calls += 1; return Buffer.alloc(size, calls === 1 ? 255 : 0); });
  assert.equal(code, OFFER_SHORT_CODE_ALPHABET[0]!.repeat(8));
});

test('short URL and log masking', () => {
  assert.equal(buildOfferShortUrl('https://jcbexchange.com/', 'Ab3dEf7h'), 'https://jcbexchange.com/o/Ab3dEf7h');
  const masked = maskOfferLinks({
    candidateName: 'Asha',
    offerShortCode: 'Ab3dEf7h',
    offerResponseUrl: 'https://jcbexchange.com/offer-response/offer1.abc.def',
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Open https://jcbexchange.com/o/Ab3dEf7h now' }, { type: 'text', text: 'https://x.in/offer-response/offer1.a.b?x=1' }] }],
  });
  assert.equal(masked.candidateName, 'Asha');
  assert.equal(masked.offerShortCode, '****');
  assert.equal(masked.offerResponseUrl, '****');
  assert.equal(masked.components[0]!.parameters[0]!.text, 'Open https://jcbexchange.com/o/**** now');
  assert.equal(masked.components[0]!.parameters[1]!.text, 'https://x.in/offer-response/****?x=1');
});
