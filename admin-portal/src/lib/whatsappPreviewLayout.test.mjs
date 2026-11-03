import assert from 'node:assert/strict';
import test from 'node:test';
import { whatsappPreviewLayout } from './whatsappPreviewLayout.mjs';

test('keeps the WhatsApp live preview compact and properly proportioned', () => {
  assert.equal(whatsappPreviewLayout.contentMaxWidth, 1536);
  assert.equal(whatsappPreviewLayout.panelWidth, 315);
  assert.equal(whatsappPreviewLayout.phoneWidth, 285);
  assert.equal(whatsappPreviewLayout.screenMinHeight, 480);
});
