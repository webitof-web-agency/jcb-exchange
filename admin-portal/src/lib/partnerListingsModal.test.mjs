import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const listingsPage = readFileSync(
  new URL('../app/(partner)/partner/listings/page.tsx', import.meta.url),
  'utf8',
);

test('renders the partner listing form when the modal is opened', () => {
  assert.doesNotMatch(listingsPage, /\{false\s*&&\s*isModalOpen\s*\?\s*\(/);
  assert.match(listingsPage, /\{isModalOpen\s*\?\s*\(/);
});
