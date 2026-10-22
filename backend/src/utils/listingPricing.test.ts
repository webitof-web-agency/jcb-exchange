import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getListingPricing,
  getPublicListingPricing,
  parseListingPricingInput,
  shouldResubmitListingForPriceChange,
} from './listingPricing';

test('final price is seller price + margin + expenses', () => {
  const pricing = getListingPricing({
    price: '1000000',
    adminMarginAmount: '50000',
    adminExpenseBreakdown: { transport: 15000, paperwork: 0, rtoWork: 5000, other: 0, otherLabel: '' },
  });
  assert.equal(pricing.sellerPrice, 1000000);
  assert.equal(pricing.expenseAmount, 20000);
  assert.equal(pricing.finalPrice, 1070000);
});

test('listings without admin pricing keep the seller price', () => {
  assert.equal(getListingPricing({ price: 750000 }).finalPrice, 750000);
});

test('public pricing hides the seller price and margin', () => {
  const pricing = getPublicListingPricing({ price: 100, adminMarginAmount: 10, adminExpenseAmount: 5 });
  assert.deepEqual(Object.keys(pricing).sort(), ['expenseAmount', 'expenseBreakdown', 'finalPrice']);
  assert.equal(pricing.finalPrice, 115);
});

test('parses admin pricing input and rejects negative amounts', () => {
  assert.equal(parseListingPricingInput({ status: 'PUBLISHED' }), null);
  assert.deepEqual(parseListingPricingInput({ adminMarginAmount: '-1' }), {
    error: 'Margin and expenses must be zero or a positive amount.',
  });
  const parsed = parseListingPricingInput({
    adminMarginAmount: '25000',
    adminExpenseBreakdown: { transport: '1000', rtoWork: 500, other: 0, otherLabel: ' ' },
  });
  assert.deepEqual(parsed, {
    adminMarginAmount: 25000,
    adminExpenseBreakdown: { transport: 1000, paperwork: 0, rtoWork: 500, other: 0, otherLabel: '' },
    adminExpenseAmount: 1500,
  });
});

test('a seller price change on an approved listing goes back for approval', () => {
  const base = { isAdmin: false, previousPrice: 100, nextPrice: 120, nextStatus: 'PUBLISHED' };
  assert.equal(shouldResubmitListingForPriceChange({ ...base, previousStatus: 'PUBLISHED' }), true);
  assert.equal(shouldResubmitListingForPriceChange({ ...base, previousStatus: 'PENDING_APPROVAL' }), false);
  assert.equal(shouldResubmitListingForPriceChange({ ...base, previousStatus: 'PUBLISHED', nextPrice: 100 }), false);
  assert.equal(shouldResubmitListingForPriceChange({ ...base, previousStatus: 'PUBLISHED', isAdmin: true }), false);
  assert.equal(shouldResubmitListingForPriceChange({ ...base, previousStatus: 'PUBLISHED', nextStatus: 'SOLD' }), false);
});
