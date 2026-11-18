import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoldVehicleDetail, SoldVehicleDetailError } from './soldVehicleDetailAi.service';

const date = (value: string) => new Date(value);
const decimal = (value: number) => ({ toNumber: () => value });

const db = {
  sellAccount: {
    findFirst: async () => ({
      id: 'deal-id-1',
      recordNumber: 'SA-2026-0001',
      listingId: 'listing-id-1',
      listingTitle: 'JCB 3DX',
      ownerName: 'Owner Name',
      ownerNumber: '9999999999',
      vehicleNumber: 'CG04AB1234',
      chassisNumber: 'CHASSIS-123',
      sellDate: date('2026-11-10T00:00:00.000Z'),
      purchaserDate: date('2026-11-10T00:00:00.000Z'),
      sellerDate: date('2026-11-09T00:00:00.000Z'),
      vehicleType: 'JCB',
      brandName: 'JCB',
      vehicleModel: '3DX',
      sellerName: 'Seller Name',
      sellerNumber: '8888888888',
      purchaserName: 'Buyer Name',
      purchaserNumber: '7777777777',
      sellerState: 'CG',
      purchaserState: 'CG',
      sellerCity: 'Raipur',
      purchaserCity: 'Durg',
      sourceType: 'PARTNER',
      purchaseType: 'PURCHASE',
      saleType: 'SELL',
      purchaseExchangeValue: decimal(0),
      purchaseExchangeVehicle: null,
      saleExchangeValue: decimal(0),
      saleExchangeVehicle: null,
      brokerName: null,
      brokerNumber: null,
      expenseBreakdown: { transport: 2500 },
      purchaseAmount: decimal(1000000),
      sellAmount: decimal(1250000),
      expenses: decimal(2500),
      balanceAmount: decimal(250000),
      netProfit: decimal(247500),
      netProfitAfterGst: decimal(210000),
      gstRatePercent: decimal(18),
      taxMode: 'INCLUSIVE',
      marginBasis: 'AFTER_EXPENSES',
      transferDetails: 'RTO pending',
      remarks: 'Test deal',
      documents: [{ name: 'invoice.pdf', url: '/private/invoice.pdf' }],
      isDraft: false,
      draftSavedAt: null,
      isLocked: true,
      lockedAt: date('2026-11-10T01:00:00.000Z'),
      lockedById: 'user-lock-1',
      dealStatus: 'PARTIAL_PAYMENT_RECEIVED',
      rtoStatusSnapshot: 'PENDING',
      completedAt: null,
      invoiceNumber: 'JCBX/SV/26-27/0001',
      invoiceGeneratedAt: date('2026-11-10T02:00:00.000Z'),
      invoiceTokenHash: 'secret-hash',
      invoiceTokenExpiresAt: date('2027-01-01T00:00:00.000Z'),
      invoiceSentAt: null,
      invoiceDelivery: { whatsapp: 'SENT' },
      cancelledAt: null,
      cancelledById: null,
      cancelReason: null,
      creditNoteNumber: null,
      creditNoteDate: null,
      releasedListingId: null,
      createdById: 'user-1',
      updatedById: 'user-1',
      createdAt: date('2026-11-01T00:00:00.000Z'),
      updatedAt: date('2026-11-10T02:00:00.000Z'),
      deletedAt: null,
      payments: [{
        id: 'payment-1', side: 'PURCHASER_RECEIPT', amount: decimal(1000000),
        paymentDate: date('2026-11-10T00:00:00.000Z'), method: 'BANK_TRANSFER',
        reference: 'UTR-1', drawnOn: 'Bank', note: 'advance', receiptStatus: 'ISSUED',
        issuedAt: date('2026-11-10T00:00:00.000Z'), issuedById: 'user-1', cancelledAt: null,
        cancelledById: null, cancelReason: null, receiptNumber: 'REC-1', receiptTokenHash: 'secret',
        listingPaymentId: null, receiptTokenCiphertext: 'secret', receiptTokenExpiresAt: null,
        receiptGeneratedAt: date('2026-11-10T00:00:00.000Z'), receiptDelivery: { whatsapp: 'SENT' },
        createdById: 'user-1', createdAt: date('2026-11-10T00:00:00.000Z'),
      }],
      refunds: [{
        id: 'refund-1', refundNumber: 'REF-1', status: 'REQUESTED', reason: 'OTHER',
        amount: decimal(1000), forfeitAmount: decimal(0), method: 'BANK_TRANSFER', reference: 'REF-UTR',
        drawnOn: 'Bank', refundDate: null, note: 'refund note', requestedById: 'user-1', approvedById: null,
        approvedAt: null, rejectedById: null, rejectedAt: null, rejectReason: null, paidById: null,
        paidAt: null, createdAt: date('2026-11-10T00:00:00.000Z'), updatedAt: date('2026-11-10T00:00:00.000Z'),
      }],
      statusHistory: [{ id: 'history-1', oldStatus: 'OPEN', newStatus: 'PARTIAL_PAYMENT_RECEIVED', reason: 'Payment', changedById: 'user-1', createdAt: date('2026-11-10T00:00:00.000Z') }],
      deedWorkflows: [{
        id: 'deed-1', side: 'SALE', status: 'SIGNED', sourceDocument: { name: 'deed.pdf' },
        sourceLinkTokenHash: 'secret', sourceLinkExpiresAt: null, executionStateCode: 'CG', executionStateName: 'Chhattisgarh',
        articleId: 1, stampDuty: 500, considerationAmount: 1250000, signerName: 'Buyer Name', signerMobile: '7777777777', signerEmail: 'buyer@example.com',
        signature: { raw: 'secret' }, providerEnvironment: 'PRODUCTION', esignClientId: 'secret', providerStatus: 'SIGNED', signingUrlCiphertext: 'secret',
        signedDocument: { url: '/private/deed.pdf' }, auditTrail: { secret: true }, providerChargeStatus: 'PAID', providerChargedAmountPaise: 100,
        providerChargeReference: 'secret', lastErrorCode: null, lastErrorMessage: null, requestedById: 'user-1', signedAt: date('2026-11-10T00:00:00.000Z'), createdAt: date('2026-11-10T00:00:00.000Z'), updatedAt: date('2026-11-10T00:00:00.000Z'),
      }],
      rtoRecord: {
        id: 'rto-1', listingId: 'listing-id-1', sellAccountId: 'deal-id-1', customerName: 'Buyer Name', customerNumber: '7777777777', vehicleNumber: 'CG04AB1234',
        brandName: 'JCB', vehicleType: 'JCB', vehicleModel: '3DX', hirePurchaseStatus: 'PENDING', financerName: 'Financer', taxStatus: 'VALID', taxValidUntil: date('2027-01-01T00:00:00.000Z'),
        fitnessStatus: 'VALID', fitnessValidUntil: date('2027-01-01T00:00:00.000Z'), insuranceStatus: 'VALID', insuranceValidUntil: date('2027-01-01T00:00:00.000Z'),
        pucStatus: 'VALID', pucValidUntil: date('2027-01-01T00:00:00.000Z'), hsrpStatus: 'YES', hsrpNumber: 'HSRP-1', sellerName: 'Seller Name', sellerNumber: '8888888888', purchaserName: 'Buyer Name', purchaserNumber: '7777777777',
        rtoOffice: 'Raipur RTO', rtoAgentName: 'Agent', rtoAgentState: 'CG', rtoAgentCity: 'Raipur', rtoAgentNumber: '6666666666', rtoExpenses: decimal(5000), rtoExpensesAdvance: decimal(2000), documentSendDate: date('2026-11-11T00:00:00.000Z'), rtoStatus: 'IN_PROGRESS', isLocked: false, lockedAt: null, lockedById: null,
        noteSheet: 'RTO note', vehicleMaintenanceCost: decimal(1000), hourRunning: 500, complianceSnapshot: { ok: true }, complianceCheckedAt: date('2026-11-11T00:00:00.000Z'), createdAt: date('2026-11-10T00:00:00.000Z'), updatedAt: date('2026-11-11T00:00:00.000Z'),
        transferTasks: [{ id: 'task-1', taskKey: 'RC_TRANSFER', label: 'RC Transfer', isOptional: false, sortOrder: 1, status: 'PENDING', remark: 'Need RC', documents: [{ fileUrl: '/private/rc.pdf', fileName: 'rc.pdf' }], updatedById: 'user-1', createdAt: date('2026-11-10T00:00:00.000Z'), updatedAt: date('2026-11-11T00:00:00.000Z') }],
        statusLogs: [{ id: 'rto-log-1', oldStatus: 'PENDING', newStatus: 'IN_PROGRESS', remark: 'Started', changedById: 'user-1', createdAt: date('2026-11-11T00:00:00.000Z') }],
      },
      listing: {
        id: 'listing-id-1', partnerId: 'partner-user-1', title: 'JCB 3DX', ownerName: 'Owner Name', price: decimal(1200000), isNegotiable: false, manufacturingYear: 2022, operatingHours: 500,
        locationState: 'CG', locationCity: 'Raipur', address: 'Address', condition: 'GOOD', description: 'Description', additionalDescription: null, grossPower: '74 HP', engineNumber: 'ENGINE-1', registrationNumberKey: 'CG04AB1234', chassisNumberKey: 'CHASSIS123', moderationReason: null, moderatedAt: null, moderatedById: null,
        adminMarginAmount: decimal(50000), adminExpenseAmount: decimal(0), adminExpenseBreakdown: null, pricingUpdatedAt: null, pricingUpdatedById: null, status: 'SOLD', soldAt: date('2026-11-10T00:00:00.000Z'), contactMode: 'PHONE', views: 10, createdAt: date('2026-10-01T00:00:00.000Z'), updatedAt: date('2026-11-10T00:00:00.000Z'),
        saleRecord: { id: 'sale-1', listingId: 'listing-id-1', buyerName: 'Buyer Name', buyerPhone: '7777777777', buyerCity: 'Durg', buyerState: 'CG', soldPrice: decimal(1250000), soldAt: date('2026-11-10T00:00:00.000Z'), invoiceNo: 'JCBX/SV/26-27/0001', notes: 'Sold note', createdAt: date('2026-11-10T00:00:00.000Z'), updatedAt: date('2026-11-10T00:00:00.000Z') },
        media: [{ id: 'media-1', url: '/private/image.jpg', type: 'IMAGE', slot: 'FRONT', isFeatured: true, aiAnalysis: { quality: 'good' }, aiAnalyzedAt: date('2026-10-01T00:00:00.000Z'), toBeDeletedAt: null, createdAt: date('2026-10-01T00:00:00.000Z') }],
        paymentSubmissions: [{ id: 'listing-payment-1', buyerId: 'buyer-1', partnerId: 'partner-user-1', method: 'UPI', status: 'VERIFIED', amount: decimal(250000), customerCity: 'Durg', customerState: 'CG', transactionRef: 'TXN-1', paymentNote: 'note', receiptUrl: '/private/receipt.pdf', submittedAt: date('2026-11-09T00:00:00.000Z'), createdAt: date('2026-11-09T00:00:00.000Z'), updatedAt: date('2026-11-09T00:00:00.000Z') }],
        partner: { id: 'partner-user-1', name: 'Partner User', mobile: '5555555555', email: 'partner@example.com', partnerProfile: { id: 'partner-profile-1', partnerCode: 'P-001', businessName: 'Partner Business', partnerType: 'DEALER', accountStatus: 'ACTIVE', kycStatus: 'VERIFIED' } },
        leads: [{ id: 'lead-1', customerId: 'buyer-1', dealerId: 'partner-user-1', status: 'WON', enquiryType: 'BUY', source: 'WEBSITE', leadType: 'BUY', wonSellAccountId: 'deal-id-1', score: 90, createdAt: date('2026-10-01T00:00:00.000Z'), updatedAt: date('2026-11-10T00:00:00.000Z'), customer: { id: 'buyer-1', name: 'Buyer Name', mobile: '7777777777', email: 'buyer@example.com', city: 'Durg', state: 'CG' } }],
      },
    }),
  },
  finVoucher: { findMany: async () => [{ id: 'voucher-1', number: 'JV-1', type: 'RECEIPT', date: date('2026-11-10T00:00:00.000Z'), status: 'POSTED', narration: 'Sale receipt', reference: 'REF-1', paymentMethod: 'BANK', partyId: 'party-1', sellAccountId: 'deal-id-1', totalAmount: decimal(1000000), sourceType: 'SELL_ACCOUNT', sourceId: 'deal-id-1', sourceEvent: 'PAYMENT', createdAt: date('2026-11-10T00:00:00.000Z'), lines: [{ id: 'line-1', lineNo: 1, accountId: 'account-1', partyId: 'party-1', sellAccountId: 'deal-id-1', debit: decimal(1000000), credit: decimal(0), narration: 'Receipt', billRef: 'SA-2026-0001' }] }] },
  finDocument: { findMany: async () => [{ id: 'document-1', docType: 'SALES_INVOICE', status: 'POSTED', number: 'INV-1', partyDocNumber: null, date: date('2026-11-10T00:00:00.000Z'), dueDate: null, partyId: 'party-1', placeOfSupply: 'CG', isIntraState: true, isReverseCharge: false, reason: null, againstDocumentId: null, againstReference: null, sellAccountId: 'deal-id-1', notes: 'Invoice note', subTotal: decimal(1000000), cgst: decimal(90000), sgst: decimal(90000), igst: decimal(0), tdsSection: null, tdsAmount: decimal(0), roundOff: decimal(0), total: decimal(1180000), voucherId: 'voucher-2', cancelReason: null, cancelledAt: null, createdAt: date('2026-11-10T00:00:00.000Z'), updatedAt: date('2026-11-10T00:00:00.000Z'), lines: [] }] },
  finVehicleDealExt: { findUnique: async () => ({ id: 'ext-1', sellAccountId: 'deal-id-1', dealMode: 'OUTRIGHT', consignorPartyId: null, consignmentCommission: decimal(0), brokerPartyId: null, brokeragePayable: decimal(0), brokerageReceivable: decimal(0), brokerageReceivablePartyId: null, partnerPartyId: 'party-1', partnerShareAmount: decimal(0), notes: 'Finance note', createdAt: date('2026-11-10T00:00:00.000Z'), updatedAt: date('2026-11-10T00:00:00.000Z') }) },
  finPaymentSchedule: { findMany: async () => [] },
  finWriteOff: { findMany: async () => [] },
};

test('sold.vehicle.detail resolves one exact record and returns complete safe sections', async () => {
  const result = await buildSoldVehicleDetail(db as never, { recordNumber: 'SA-2026-0001' }) as any;

  assert.equal(result.found, true);
  assert.equal(result.deal.recordNumber, 'SA-2026-0001');
  assert.equal(result.deal.sellAmount, 1250000);
  assert.equal(result.financialReconciliation.amounts.purchase, 1000000);
  assert.equal(result.financialReconciliation.amounts.sale, 1250000);
  assert.equal(result.financialReconciliation.amounts.expenses, 2500);
  assert.equal(result.financialReconciliation.amounts.profitBeforeGst, 247500);
  assert.equal(result.financialReconciliation.amounts.profitAfterGst, 209745.76);
  assert.equal(result.financialReconciliation.payments.customer.balance, 250000);
  assert.equal(result.financialReconciliation.payments.seller.balance, 1000000);
  assert.equal(result.financialReconciliation.duplicatePrevention.noDoubleCount, true);
  assert.equal(result.payments.items.length, 1);
  assert.equal(result.refunds.items.length, 1);
  assert.equal(result.documents.deedWorkflows.length, 1);
  assert.equal(result.rto.record.id, 'rto-1');
  assert.equal(result.finance.vouchers.length, 1);
  assert.equal(result.relationships.listingId, 'listing-id-1');
  assert.equal(result.connectedModules.modules.listingsInventory.status, 'VERIFIED');
  assert.equal(result.connectedModules.modules.crmCustomer.records.length, 1);
  assert.equal(result.connectedModules.modules.rtoWork.status, 'VERIFIED');
  assert.equal(result.connectedModules.modules.financeHub.status, 'VERIFIED');
  assert.equal(result.connectedModules.integrity.wrongRecordsExcluded, 0);
  assert.equal(result.deal.invoiceTokenHash, undefined);
  assert.equal(result.payments.items[0]?.receiptTokenHash, undefined);
  assert.equal(result.documents.deedWorkflows[0]?.signingUrlCiphertext, undefined);
  assert.deepEqual(result.fileActions, []);
});

test('sold.vehicle.detail uses only fields that exist on SmsMessageLog', async () => {
  let smsSelect: Record<string, unknown> | null = null;
  await buildSoldVehicleDetail({
    ...db,
    smsMessageLog: {
      findMany: async (args: { select: Record<string, unknown> }) => {
        smsSelect = args.select;
        return [];
      },
    },
  } as never, { dealId: 'deal-id-1' });
  assert.equal('deliveredAt' in (smsSelect ?? {}), false);
  assert.equal('readAt' in (smsSelect ?? {}), false);
});

test('sold.vehicle.detail requires an exact identity and does not guess', async () => {
  await assert.rejects(
    () => buildSoldVehicleDetail(db as never, {}),
    (error: unknown) => error instanceof SoldVehicleDetailError && error.code === 'IDENTIFIER_REQUIRED',
  );
});

test('sold.vehicle.detail preserves legacy keyed document JSON without exposing its locator', async () => {
  const legacyDb = {
    ...db,
    sellAccount: {
      findFirst: async (args: unknown) => {
        void args;
        const row = await db.sellAccount.findFirst();
        return { ...row, documents: { invoice: { fileName: 'invoice.pdf', url: '/private/invoice.pdf' } } };
      },
    },
  };
  const result = await buildSoldVehicleDetail(legacyDb as never, { recordNumber: 'SA-2026-0001' }) as any;
  assert.deepEqual(result.documents.accountDocuments, [{ fileName: 'invoice.pdf', mimeType: null, size: null, uploadedAt: null, slot: null, documentType: 'invoice', hasFile: true }]);
});
