import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAiPageContext } from './aiPageContext.mjs';

test('returns no page context instead of throwing when the matcher is unavailable', () => {
  assert.equal(resolveAiPageContext(undefined, '/employee/dashboard'), undefined);
});

test('uses the matcher result when the page-context export is available', () => {
  assert.deepEqual(
    resolveAiPageContext((pathname) => ({ moduleKey: pathname.slice(1) }), '/employee/dashboard'),
    { moduleKey: 'employee/dashboard' },
  );
});
