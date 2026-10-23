import test from 'node:test';
import assert from 'node:assert/strict';
import { getDialHref, getWhatsAppHref } from './supportContact';

test('builds a dial link from the configured footer phone number', () => {
  assert.equal(getDialHref('+91 93030 30044'), 'tel:+919303030044');
});

test('builds an India WhatsApp link from a ten digit Super Admin number', () => {
  assert.equal(getWhatsAppHref('93030 30044'), 'https://wa.me/919303030044');
});

test('does not create contact links for an empty setting', () => {
  assert.equal(getDialHref(''), null);
  assert.equal(getWhatsAppHref(null), null);
});
