import assert from 'node:assert/strict';
import test from 'node:test';
import { toListingCompletionOwnerView } from './listingCompletionOwnerView';

test('owner completion view exposes the full scoped listing form without partner internals', () => {
  const view = toListingCompletionOwnerView({
    id: 'listing-1',
    title: 'JCB 3DX',
    price: 2500000,
    address: 'Private address',
    locationState: 'Chhattisgarh',
    category: { id: 'category-1', name: 'Excavator' },
    brand: { id: 'brand-1', name: 'JCB' },
    model: { id: 'model-1', name: '3DX' },
    media: [{ id: 'media-1', url: 'https://drive.example/photo', type: 'IMAGE', slot: 'front-view', isFeatured: true }],
  });

  assert.equal(view.id, 'listing-1');
  assert.equal(view.title, 'JCB 3DX');
  assert.deepEqual(view.category, { id: 'category-1', name: 'Excavator' });
  assert.deepEqual(view.brand, { id: 'brand-1', name: 'JCB' });
  assert.deepEqual(view.model, { id: 'model-1', name: '3DX' });
  assert.deepEqual(view.media, [{ id: 'media-1', url: 'https://drive.example/photo', type: 'IMAGE', slot: 'front-view', isFeatured: true }]);
  assert.equal(view.price, 2500000);
  assert.equal(view.address, 'Private address');
  assert.equal('partnerId' in view, false);
  assert.equal('registrationNumberKey' in view, false);
});
