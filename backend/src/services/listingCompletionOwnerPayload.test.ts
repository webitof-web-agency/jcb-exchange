import assert from 'node:assert/strict';
import test from 'node:test';
import { listingCompletionOwnerPayloadSchema } from './listingCompletionOwnerPayload';

test('owner completion accepts an empty payload because media is uploaded separately', () => {
  assert.deepEqual(listingCompletionOwnerPayloadSchema.parse({}), {});
});

test('owner completion accepts listing fields from the scoped completion form', () => {
  assert.deepEqual(
    listingCompletionOwnerPayloadSchema.parse({ title: 'Updated vehicle title', price: 2500000 }),
    { title: 'Updated vehicle title', price: 2500000 },
  );
});

test('owner completion treats blank optional form fields as missing', () => {
  assert.doesNotThrow(() => listingCompletionOwnerPayloadSchema.parse({
    title: '',
    price: '',
    locationState: '',
    locationCity: '',
    address: '',
  }));
});

test('owner completion rejects fields outside the scoped listing form', () => {
  assert.throws(
    () => listingCompletionOwnerPayloadSchema.parse({ financeAccountId: 'not-allowed' }),
    /Unrecognized key|unrecognized key/i,
  );
});
