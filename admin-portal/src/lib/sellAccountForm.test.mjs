import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateSellAccountNetProfit,
  createNextSellAccountId,
  getSellAccountValidationErrors,
  normalizeAmountInput,
  toEditableAmount,
  upsertSellAccountRecord,
} from './sellAccountForm.mjs';

test('keeps an entered zero visible without forcing zero into an empty amount field', () => {
  assert.deepEqual(normalizeAmountInput(''), { raw: '', value: 0 });
  assert.deepEqual(normalizeAmountInput('0'), { raw: '0', value: 0 });
  assert.deepEqual(normalizeAmountInput('0500'), { raw: '0500', value: 500 });
  assert.equal(toEditableAmount(0), '');
  assert.equal(toEditableAmount(1500), '1500');
});

test('calculates net profit from the three editable financial values', () => {
  assert.equal(calculateSellAccountNetProfit(530000, 500000, 15000), 15000);
  assert.equal(calculateSellAccountNetProfit(0, 0, 0), 0);
});

test('upserts sell account records without dropping uploaded document metadata', () => {
  const image = {
    fileUrl: '/documents/secure/image-1',
    originalName: 'deed.webp',
    mimeType: 'image/webp',
  };
  const existing = { id: 'SA-1', documents: { purchaseDeed: image } };
  const updated = { ...existing, noteSheet: 'Updated' };

  assert.deepEqual(upsertSellAccountRecord([existing], updated), [updated]);
});

test('creates a non-colliding sell account id when records were deleted', () => {
  assert.equal(
    createNextSellAccountId([{ id: 'SA-2026-001' }, { id: 'SA-2026-003' }], 2026),
    'SA-2026-004',
  );
});

test('does not block editing legacy records that predate the brand field', () => {
  const errors = getSellAccountValidationErrors({
    ownerName: 'Owner',
    ownerNumber: '9876543210',
    vehicleNumber: 'MH12AB1234',
    vehicleType: 'Backhoe Loader',
    brandName: '',
    vehicleModel: 'JCB 3DX',
    sellDate: '2026-10-05',
    sellerName: 'Seller',
    sellerNumber: '9876543210',
    purchaserName: 'Purchaser',
    purchaserNumber: '9876543210',
    purchaseAmount: 100,
    sellAmount: 200,
    dealStatus: 'OPEN',
    transferDetails: 'Transfer',
    noteSheet: 'Remark',
  }, { isEditing: true });

  assert.equal(errors.brandName, undefined);
});

test('requires a brand when creating a new sell account', () => {
  const errors = getSellAccountValidationErrors({ brandName: '' }, { isEditing: false });
  assert.equal(errors.brandName, 'Brand is required');
});
