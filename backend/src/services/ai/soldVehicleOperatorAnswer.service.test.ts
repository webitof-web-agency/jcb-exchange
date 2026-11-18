import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoldVehicleOperatorAnswer } from './soldVehicleOperatorAnswer.service';

const detail = {
  parties: {
    seller: { name: 'Harishchand', number: '9876543210' },
    purchaser: { name: 'Buyer One' },
    owner: { name: 'Owner One' },
  },
};

test('returns the raw authorized seller name for an exact Sold Vehicle question', () => {
  assert.equal(buildSoldVehicleOperatorAnswer({
    message: 'sold vehicles module me seller name kya hai btao',
    toolName: 'sold.vehicle.detail',
    operatorData: detail,
  }), 'Seller name: Harishchand');
});

test('does not answer a party field from an unrelated tool', () => {
  assert.equal(buildSoldVehicleOperatorAnswer({
    message: 'seller name batao',
    toolName: 'sell.accounts.summary',
    operatorData: detail,
  }), null);
});

test('answers seller name and contact number for sold vehicle module summary with single item', () => {
  const summaryData = {
    total: 1,
    items: [
      {
        recordNumber: 'JCBX/SV/2026-27/0001',
        vehicleNumber: 'CG11BN7867',
        sellerName: 'Ramesh Patel',
        sellerNumber: '9876543210',
        purchaserName: 'Suresh Sharma',
        purchaserNumber: '9123456789',
      },
    ],
  };

  const sellerAns = buildSoldVehicleOperatorAnswer({
    message: 'is module me seller name btao',
    toolName: 'sell.accounts.summary',
    operatorData: summaryData,
  });
  assert.match(sellerAns ?? '', /Ramesh Patel/);
  assert.match(sellerAns ?? '', /9876543210/);

  const buyerAns = buildSoldVehicleOperatorAnswer({
    message: 'purchaser name aur number batao',
    toolName: 'sell.accounts.summary',
    operatorData: summaryData,
  });
  assert.match(buyerAns ?? '', /Suresh Sharma/);
  assert.match(buyerAns ?? '', /9123456789/);

  const phoneFollowUp = buildSoldVehicleOperatorAnswer({
    message: 'and uska phone number btao',
    toolName: 'sell.accounts.summary',
    operatorData: summaryData,
  });
  assert.match(phoneFollowUp ?? '', /9876543210/);
  assert.match(phoneFollowUp ?? '', /Ramesh Patel/);
});

test('answers profit questions accurately from sell.accounts.summary data', () => {
  const summaryWithProfit = {
    summary: {
      purchaseAmount: 2300000,
      sellAmount: 2400000,
      expenses: 16000,
      netProfitAfterGst: 71186.44,
    },
    items: [],
  };

  const profitAns = buildSoldVehicleOperatorAnswer({
    message: 'kitne ka profit hai btao',
    toolName: 'sell.accounts.summary',
    operatorData: summaryWithProfit,
  });
  assert.match(profitAns ?? '', /71,186\.44/);
  assert.match(profitAns ?? '', /23,00,000/);
  assert.match(profitAns ?? '', /24,00,000/);
});

test('answers contact numbers and vehicle number from detail projection', () => {
  const fullDetail = {
    parties: {
      seller: { name: 'Harishchand', number: '9876543210' },
      purchaser: { name: 'Buyer One', number: '9123456789' },
      owner: { name: 'Owner One', number: '9988776655' },
    },
    vehicle: { number: 'CG11BN7867' },
  };

  const sellerPhone = buildSoldVehicleOperatorAnswer({
    message: 'seller contact number btao',
    toolName: 'sold.vehicle.detail',
    operatorData: fullDetail,
  });
  assert.equal(sellerPhone, 'Seller contact number: 9876543210');

  const buyerPhone = buildSoldVehicleOperatorAnswer({
    message: 'buyer contact number btao',
    toolName: 'sold.vehicle.detail',
    operatorData: fullDetail,
  });
  assert.equal(buyerPhone, 'Buyer/purchaser contact number: 9123456789');

  const vehNum = buildSoldVehicleOperatorAnswer({
    message: 'vehicle number btao',
    toolName: 'sold.vehicle.detail',
    operatorData: fullDetail,
  });
  assert.equal(vehNum, 'Vehicle registration number: CG11BN7867');
});
