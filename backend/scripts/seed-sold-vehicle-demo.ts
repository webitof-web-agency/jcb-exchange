// Demo Sold Vehicle deals covering the whole flow: draft → real money receipts, Bill of Supply,
// RTO and deal done, a bounced cheque, an excess-payment refund and a cancelled sale with a credit
// note and a refund that keeps a cancellation charge. Everything goes through the real services.
//
//   npm run seed:sold-vehicle-demo            create the demo deals (skips if they exist)
//   npm run seed:sold-vehicle-demo -- --reset delete the demo deals and create them again
//   npm run seed:sold-vehicle-demo -- --remove delete the demo deals only
//
// Refuses to run against a production database: demo deals would take real Bill of Supply and
// receipt numbers and the Finance Hub posting worker would put them in the books.
// Nothing is sent on WhatsApp/SMS.
import prismaModule from '../src/lib/prisma';
import {
  addSellAccountPayment,
  cancelSellAccountReceipt,
  cancelSellAccountSale,
  createSellAccount,
  getSellAccount,
  issueSellAccountReceipt,
  startRtoWork,
} from '../src/services/sellAccount.service';
import {
  approveSellAccountRefund,
  paySellAccountRefund,
  requestSellAccountRefund,
} from '../src/services/sellAccountRefund.service';
import { completeVehicleSale } from '../src/services/vehicleSaleCompletion.service';
import { issueInvoiceToken, nextVehicleSaleInvoiceNumberFor } from '../src/services/vehicleSaleInvoice.service';

const prisma = ((prismaModule as any).default ?? prismaModule) as any;

const DEMO_MARK = 'DEMO DATA - Sold Vehicle receipts & refunds flow. Safe to delete.';
const DEMO_VEHICLES = ['CG04DM0001', 'CG04DM0002', 'CG04DM0003', 'CG04DM0004'];
const MAKER_EMAIL = 'demo.accounts.maker@example.invalid';
const CHECKER_EMAIL = 'demo.accounts.checker@example.invalid';
const args = new Set(process.argv.slice(2));

const assertSafeDatabase = () => {
  const url = process.env.DATABASE_URL || '';
  let database = '';
  try {
    database = decodeURIComponent(new URL(url.replace(/^['"]|['"]$/g, '')).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL.');
  }
  if (/prod/i.test(database) && !args.has('--allow-production')) {
    throw new Error(`Refusing to add demo deals to "${database}". Point DATABASE_URL at a development or staging database.`);
  }
  return database;
};

const demoUser = async (email: string, name: string, mobile: string) =>
  (await prisma.user.findUnique({ where: { email } }))
  ?? prisma.user.create({ data: { email, name, mobile, role: 'ADMIN' } });

const removeDemo = async () => {
  const deals: Array<{ id: string }> = await prisma.sellAccount.findMany({ where: { remarks: DEMO_MARK }, select: { id: true } });
  const ids = deals.map((deal) => deal.id);
  if (ids.length) {
    // Direct deletes: the app blocks deleting deals that have real receipts or a Bill of Supply.
    await prisma.vehicleRtoRecord.deleteMany({ where: { sellAccountId: { in: ids } } });
    await prisma.sellAccount.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: [MAKER_EMAIL, CHECKER_EMAIL] } } });
  return ids.length;
};

/** Same as issuing the Bill of Supply after full payment, without sending WhatsApp/SMS. */
const issueBillOfSupply = async (id: string, at: Date) => prisma.$transaction(async (tx: any) => {
  const issued = issueInvoiceToken(at);
  await tx.sellAccount.update({
    where: { id },
    data: {
      invoiceNumber: await nextVehicleSaleInvoiceNumberFor(tx, at),
      invoiceGeneratedAt: at,
      invoiceTokenHash: issued.tokenHash,
      invoiceTokenExpiresAt: issued.expiresAt,
    },
  });
});

const baseDeal = (vehicleNumber: string, overrides: Record<string, unknown>) => ({
  ownerNumber: '9000000100', sellerNumber: '9000000200', purchaserNumber: '9000000300',
  sellerState: 'Chhattisgarh', purchaserState: 'Chhattisgarh', sellerCity: 'Bilaspur', purchaserCity: 'Raipur',
  vehicleType: 'Backhoe Loader', brandName: 'JCB', sourceType: 'DIRECT_CUSTOMER',
  transferDetails: 'RC transfer to purchaser after full payment.',
  remarks: DEMO_MARK,
  vehicleNumber,
  ...overrides,
});

const pay = async (dealId: string, actorId: string, payment: Record<string, unknown>, issue = true) => {
  const added = await addSellAccountPayment(dealId, payment, actorId);
  if (!added) throw new Error('Payment could not be added.');
  if (issue && payment.side !== 'SELLER_PAYMENT') await issueSellAccountReceipt(dealId, added.paymentId, actorId);
  return added.paymentId;
};

const run = async () => {
  const database = assertSafeDatabase();
  const reset = args.has('--reset');
  if (args.has('--remove') || reset) {
    const removed = await removeDemo();
    console.log(`Removed ${removed} demo deal(s) from ${database}.`);
    if (args.has('--remove')) return;
  }
  if (await prisma.sellAccount.count({ where: { remarks: DEMO_MARK } })) {
    console.log('Demo deals already exist. Use --reset to create them again.');
    return;
  }

  const maker = await demoUser(MAKER_EMAIL, 'Demo Accounts Maker', '9000000901');
  const checker = await demoUser(CHECKER_EMAIL, 'Demo Accounts Checker', '9000000902');
  const created: string[] = [];

  // 1. Complete deal: seller paid, two real receipts, Bill of Supply, RTO done, deal done & locked.
  {
    const deal = await createSellAccount(baseDeal(DEMO_VEHICLES[0]!, {
      ownerName: 'Ramesh Sahu', sellerName: 'Ramesh Sahu', purchaserName: 'Arjun Kumar Gupta',
      vehicleModel: '3DX', listingTitle: 'JCB 3DX Backhoe Loader 2019', chassisNumber: '1820747',
      sellDate: '2026-10-01', sellerDate: '2026-10-01', purchaserDate: '2026-10-08',
      purchaseAmount: 350000, sellAmount: 400000,
      expenseBreakdown: { transport: 5000, paperwork: 2000, rtoWork: 3000, other: 0, otherLabel: '' },
    }), maker.id);
    created.push(deal.id);
    await pay(deal.id, maker.id, { side: 'SELLER_PAYMENT', amount: 350000, method: 'BANK_TRANSFER', reference: 'NEFT00921', paymentDate: '2026-10-02' });
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 100000, method: 'UPI', reference: 'UPI618273', paymentDate: '2026-10-03', note: 'Booking amount' });
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 300000, method: 'BANK_TRANSFER', reference: '244043', drawnOn: 'AXIS 3943', paymentDate: '2026-10-08', note: 'RTGS balance payment' });
    await issueBillOfSupply(deal.id, new Date('2026-10-08T10:00:00+05:30'));
    const rto = await startRtoWork(deal.id, maker.id);
    if (rto?.rtoRecord) {
      await prisma.rtoTransferTask.updateMany({ where: { rtoRecordId: rto.rtoRecord.id }, data: { status: 'TRANSFERRED' } });
    }
    await completeVehicleSale(deal.id, { remark: 'Demo: RC transferred to the purchaser, deal closed.' }, maker.id, 'http://localhost:5000');
  }

  // 2. Partial payment: one real receipt, a bounced cheque (cancelled receipt) and a draft.
  {
    const deal = await createSellAccount(baseDeal(DEMO_VEHICLES[1]!, {
      ownerName: 'Sunil Verma', sellerName: 'Sunil Verma', purchaserName: 'Mahesh Patel',
      brandName: 'Hyundai', vehicleType: 'Excavator', vehicleModel: 'R140W', listingTitle: 'Hyundai R140W Excavator 2018', chassisNumber: 'HY140W5521',
      sellDate: '2026-10-10', sellerDate: '2026-10-10', purchaserDate: '2026-10-12',
      purchaseAmount: 550000, sellAmount: 650000,
    }), maker.id);
    created.push(deal.id);
    await pay(deal.id, maker.id, { side: 'SELLER_PAYMENT', amount: 300000, method: 'BANK_TRANSFER', reference: 'NEFT00977', paymentDate: '2026-10-11' });
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 200000, method: 'BANK_TRANSFER', reference: '558120', drawnOn: 'SBI 1120', paymentDate: '2026-10-12' });
    const cheque = await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 150000, method: 'CHEQUE', reference: '000431', drawnOn: 'HDFC 0431', paymentDate: '2026-10-14' });
    await cancelSellAccountReceipt(deal.id, cheque, { reason: 'Demo: cheque 000431 bounced (insufficient funds).' }, maker.id);
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 100000, method: 'UPI', reference: 'UPI771902', paymentDate: '2026-10-20', note: 'Awaiting bank confirmation' }, false);
  }

  // 3. Customer paid 25,000 too much: Bill of Supply at full payment, excess refunded (maker-checker).
  {
    const deal = await createSellAccount(baseDeal(DEMO_VEHICLES[2]!, {
      ownerName: 'Anil Dewangan', sellerName: 'Anil Dewangan', purchaserName: 'Kiran Construction',
      brandName: 'CAT', vehicleType: 'Backhoe Loader', vehicleModel: '424B', listingTitle: 'CAT 424B Backhoe Loader 2017', chassisNumber: 'CAT424B9921',
      sellDate: '2026-10-05', sellerDate: '2026-10-05', purchaserDate: '2026-10-09',
      purchaseAmount: 250000, sellAmount: 300000,
    }), maker.id);
    created.push(deal.id);
    await pay(deal.id, maker.id, { side: 'SELLER_PAYMENT', amount: 250000, method: 'BANK_TRANSFER', reference: 'NEFT01010', paymentDate: '2026-10-06' });
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 300000, method: 'BANK_TRANSFER', reference: '661245', drawnOn: 'ICICI 2210', paymentDate: '2026-10-09' });
    await issueBillOfSupply(deal.id, new Date('2026-10-09T12:00:00+05:30'));
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 25000, method: 'UPI', reference: 'UPI902211', paymentDate: '2026-10-10', note: 'Paid twice by mistake' });
    const requested = await requestSellAccountRefund(deal.id, { reason: 'EXCESS_PAYMENT', amount: 25000, method: 'UPI', note: 'Demo: excess UPI payment returned' }, maker.id);
    const refundId = requested?.refunds?.[0]?.id;
    await approveSellAccountRefund(deal.id, refundId, { id: checker.id, role: 'ADMIN' });
    await paySellAccountRefund(deal.id, refundId, { refundDate: '2026-10-11', method: 'UPI', reference: 'UPIRF3301', drawnOn: 'HDFC Current' }, checker.id);
  }

  // 4. Vehicle returned after the Bill of Supply: sale cancelled (credit note), refund keeps a
  //    20,000 cancellation charge.
  {
    const deal = await createSellAccount(baseDeal(DEMO_VEHICLES[3]!, {
      ownerName: 'Vijay Yadav', sellerName: 'Vijay Yadav', purchaserName: 'Rohit Sharma',
      vehicleModel: '3DX Super', listingTitle: 'JCB 3DX Super 2020', chassisNumber: 'JCB3DXS7781',
      sellDate: '2026-10-03', sellerDate: '2026-10-03', purchaserDate: '2026-10-07',
      purchaseAmount: 430000, sellAmount: 500000,
    }), maker.id);
    created.push(deal.id);
    await pay(deal.id, maker.id, { side: 'SELLER_PAYMENT', amount: 430000, method: 'BANK_TRANSFER', reference: 'NEFT00888', paymentDate: '2026-10-04' });
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 150000, method: 'CASH', paymentDate: '2026-10-05', note: 'Advance' });
    await pay(deal.id, maker.id, { side: 'PURCHASER_RECEIPT', amount: 350000, method: 'BANK_TRANSFER', reference: '771234', drawnOn: 'PNB 0098', paymentDate: '2026-10-07' });
    await issueBillOfSupply(deal.id, new Date('2026-10-07T11:00:00+05:30'));
    await cancelSellAccountSale(deal.id, { reason: 'Demo: customer returned the machine (hydraulic issue).' }, maker.id);
    const requested = await requestSellAccountRefund(deal.id, { reason: 'VEHICLE_RETURN', amount: 480000, forfeitAmount: 20000, method: 'BANK_TRANSFER', note: 'Demo: refund less cancellation charge' }, maker.id);
    const refundId = requested?.refunds?.[0]?.id;
    await approveSellAccountRefund(deal.id, refundId, { id: checker.id, role: 'ADMIN' });
    await paySellAccountRefund(deal.id, refundId, { refundDate: '2026-10-16', method: 'BANK_TRANSFER', reference: 'NEFTRF8812', drawnOn: 'HDFC Current' }, checker.id);
  }

  console.log(`Demo deals created in ${database}:`);
  for (const id of created) {
    const deal: any = await getSellAccount(id);
    const receipts = deal.payments.filter((payment: any) => payment.side === 'PURCHASER_RECEIPT')
      .map((payment: any) => `${payment.receiptStatus}${payment.receiptNumber ? ` ${payment.receiptNumber}` : ''}`);
    console.log([
      `- ${deal.recordNumber} ${deal.vehicleNumber} [${deal.dealStatus}${deal.isLocked ? ', locked' : ''}]`,
      `  received ${deal.finance.payments.purchaserReceived} / ${deal.finance.payments.customerCashReceivable}, balance ${deal.finance.payments.purchaserBalance}`,
      `  receipts: ${receipts.join(' | ') || '-'}`,
      `  bill of supply: ${deal.invoiceNumber || '-'}${deal.creditNoteNumber ? `, credit note ${deal.creditNoteNumber}` : ''}`,
      `  refunds: ${deal.refunds.map((refund: any) => `${refund.status} ${refund.amount}${refund.forfeitAmount ? ` (+${refund.forfeitAmount} kept)` : ''} ${refund.refundNumber || ''}`.trim()).join(' | ') || '-'}`,
    ].join('\n'));
  }
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
