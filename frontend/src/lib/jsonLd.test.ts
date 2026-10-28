import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeJsonLd } from './jsonLd';

test('user text cannot close the JSON-LD script tag', () => {
  const data = { name: '</script><script>alert(1)</script>', description: '<!-- a & b -->' };
  const output = serializeJsonLd(data);
  assert.ok(!/<|>/.test(output));
  assert.ok(!output.includes('&'));
  assert.deepEqual(JSON.parse(output), data);
});

test('line separators survive the round trip', () => {
  const lineSeparator = String.fromCharCode(0x2028);
  const data = { text: `one${lineSeparator}two${String.fromCharCode(0x2029)}three` };
  const output = serializeJsonLd(data);
  assert.ok(!output.includes(lineSeparator));
  assert.deepEqual(JSON.parse(output), data);
});
