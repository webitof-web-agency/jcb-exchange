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

test('formats an RTO dossier as readable operational text without stored file URLs', () => {
  const answer = buildSoldVehicleOperatorAnswer({
    message: 'RTO status batao',
    toolName: 'rto.work.detail',
    operatorData: {
      found: true,
      rto: { office: 'Raipur RTO', status: 'RTO_WORK_IN_PROGRESS', expenses: { total: 5000, advance: 2000, balance: 3000 } },
      vehicle: { registrationNumber: 'CG04NX2753', chassisNumber: 'CHASSIS-1', engineNumber: 'ENGINE-1', brand: 'JCB', model: '3DX' },
      parties: { customer: { name: 'Customer' }, seller: { name: 'Seller' }, purchaser: { name: 'Purchaser' } },
      compliance: { tax: { status: 'VALID' }, fitness: { status: 'VALID' }, insurance: { status: 'VALID' }, puc: { status: 'VALID' } },
      tasks: { total: 1, completed: 0, items: [{ label: 'RC Transfer', status: 'PENDING', remark: 'Need RC', id: 'task-1', documents: [] }] },
      documents: { total: 0, availableCount: 0 },
    },
  });
  assert.match(answer || '', /CG04NX2753/);
  assert.match(answer || '', /Raipur RTO/);
  assert.match(answer || '', /Balance due: ₹3,000/);
  assert.doesNotMatch(answer || '', /fileUrl|https?:\/\//iu);
});

test('includes the complete RTO answer sections for an operational question', () => {
  const answer = buildSoldVehicleOperatorAnswer({
    message: 'RTO ka complete status batao',
    toolName: 'rto.work.detail',
    operatorData: {
      found: true,
      rto: { office: 'Raipur RTO', status: 'RTO_WORK_IN_PROGRESS', agent: { name: 'Agent One', city: 'Raipur', number: '9999999999' }, expenses: { total: 5000, advance: 2000, balance: 3000 } },
      vehicle: { registrationNumber: 'CG04NX2753', chassisNumber: 'CHASSIS-1', engineNumber: 'ENGINE-1', brand: 'JCB', model: '3DX' },
      parties: { customer: { name: 'Customer' }, seller: { name: 'Seller' }, purchaser: { name: 'Purchaser' } },
      compliance: { tax: { status: 'VALID' }, fitness: { status: 'VALID' }, insurance: { status: 'VALID' }, puc: { status: 'VALID' }, hsrp: { status: 'AVAILABLE', number: 'HSRP-1' } },
      tasks: { total: 2, completed: 1, pending: 1, items: [{ label: 'RC Transfer', status: 'COMPLETED', remark: '', id: 'task-1', documents: [] }, { label: 'NOC', status: 'PENDING', remark: 'NOC required', id: 'task-2', documents: [] }] },
      documents: { total: 2, availableCount: 1 },
      soldVehicle: { recordNumber: 'SA-2026-001', invoiceNumber: 'INV-001', status: 'COMPLETED', purchaseAmount: 100000, sellAmount: 125000, expenses: 5000, netProfit: 20000, paymentCount: 2, refundCount: 0 },
      missingFields: [],
    },
  });
  assert.match(answer || '', /Agent details/);
  assert.match(answer || '', /Invoice\/finance status/);
  assert.match(answer || '', /INV-001/);
  assert.match(answer || '', /Next action/);
  assert.match(answer || '', /NOC required/);
});
