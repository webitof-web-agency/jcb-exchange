import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionsPolicy } from './securityHeaders';

test('allows microphone for the top-level admin portal document', () => {
  assert.match(permissionsPolicy, /microphone=\(self\)/u);
  assert.doesNotMatch(permissionsPolicy, /microphone=\(\)/u);
});
