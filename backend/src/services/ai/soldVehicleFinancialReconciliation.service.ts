import {
  calculateSellAccountGst,
  calculateSellAccountPaymentSummary,
  type SellAccountFinanceInput,
} from '../sellAccountFinance';

export type SoldVehicleFinancialPayment = {
  id?: string | null;
  side?: string | null;
  amount?: number | string | null;
  receiptStatus?: string | null;
  cancelledAt?: string | Date | null;
  paymentDate?: string | Date | null;
  method?: string | null;
  reference?: string | null;
  receiptNumber?: string | null;
  listingPaymentId?: string | null;
};

export type SoldVehicleFinancialRefund = {
  id?: string | null;
  status?: string | null;
  amount?: number | string | null;
  forfeitAmount?: number | string | null;
};

export type SoldVehicleFinancialReconciliationInput = {
  purchaseAmount?: number | string | null;
  sellAmount?: number | string | null;
  expenses?: number | string | null;
  purchaseExchangeValue?: number | string | null;
  saleExchangeValue?: number | string | null;
  gstRatePercent?: number | string | null;
  taxMode?: string | null;
  marginBasis?: string | null;
  sellerState?: string | null;
  purchaserState?: string | null;
  cancelled?: boolean;
  expenseBreakdown?: unknown;
  payments?: SoldVehicleFinancialPayment[];
  refunds?: SoldVehicleFinancialRefund[];
  source?: {
    balanceAmount?: number | string | null;
    netProfit?: number | string | null;
    netProfitAfterGst?: number | string | null;
  };
};

const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const signedAmount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round = (value: unknown) => Math.round((signedAmount(value) + Number.EPSILON) * 100) / 100;

const sum = (items: Array<{ amount?: unknown }>) => round(items.reduce((total, item) => total + amount(item.amount), 0));

const difference = (left: number, right: number) => round(left - right);

const isRealReceipt = (payment: SoldVehicleFinancialPayment) =>
  (payment.receiptStatus ?? 'ISSUED') === 'ISSUED' && !payment.cancelledAt;

const isDraftReceipt = (payment: SoldVehicleFinancialPayment) => payment.receiptStatus === 'DRAFT';

const isCancelledReceipt = (payment: SoldVehicleFinancialPayment) =>
  payment.receiptStatus === 'CANCELLED' || Boolean(payment.cancelledAt);

const duplicateKey = (payment: SoldVehicleFinancialPayment, index: number) => {
  if (payment.id) return `id:${payment.id}`;
  // A legacy/imported row may have no id in an AI fixture. Only deduplicate it
  // when a stable receipt/listing/reference identifier is present; otherwise it
  // remains an independent row and is not silently dropped.
  const stablePart = payment.receiptNumber || payment.listingPaymentId || payment.reference;
  if (!stablePart) return `row:${index}`;
  return [
    'legacy',
    payment.side ?? '',
    amount(payment.amount),
    payment.paymentDate instanceof Date ? payment.paymentDate.toISOString() : String(payment.paymentDate ?? ''),
    payment.method ?? '',
    payment.reference ?? '',
    payment.receiptNumber ?? '',
    payment.listingPaymentId ?? '',
  ].join('|');
};

const deduplicatePayments = (payments: SoldVehicleFinancialPayment[]) => {
  const seen = new Set<string>();
  const unique: SoldVehicleFinancialPayment[] = [];
  const ignoredPaymentIds: string[] = [];
  let duplicateCount = 0;

  payments.forEach((payment, index) => {
    const key = duplicateKey(payment, index);
    if (seen.has(key)) {
      duplicateCount += 1;
      if (payment.id && !ignoredPaymentIds.includes(payment.id)) ignoredPaymentIds.push(payment.id);
      return;
    }
    seen.add(key);
    unique.push(payment);
  });

  return { unique, duplicateCount, ignoredPaymentIds };
};

const paymentBuckets = (payments: SoldVehicleFinancialPayment[], side: string) => {
  const rows = payments.filter((payment) => payment.side === side);
  const real = rows.filter(isRealReceipt);
  const draft = rows.filter(isDraftReceipt);
  const cancelled = rows.filter(isCancelledReceipt);
  return {
    rows,
    real,
    draft,
    cancelled,
    realAmount: sum(real),
    draftAmount: sum(draft),
    cancelledAmount: sum(cancelled),
  };
};

const statusFor = (received: number, expected: number) => {
  if (expected <= 0) return received > 0 ? 'FULL' : 'UNPAID';
  if (received <= 0) return 'UNPAID';
  if (received >= expected) return 'FULL';
  return 'PARTIAL';
};

/**
 * One canonical, read-only reconciliation for Sold Vehicles AI.
 *
 * It deliberately delegates GST and payment semantics to the same shared
 * functions used by the Finance Hub/Sold Vehicles UI. This prevents the AI
 * from inventing a second formula. Draft/cancelled rows are still returned in
 * the evidence counts but never included in real-money totals.
 */
export const reconcileSoldVehicleFinancials = (input: SoldVehicleFinancialReconciliationInput = {}) => {
  const purchase = amount(input.purchaseAmount);
  const sale = amount(input.sellAmount);
  const expenses = amount(input.expenses);
  const purchaseExchangeValue = amount(input.purchaseExchangeValue);
  const saleExchangeValue = amount(input.saleExchangeValue);
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const refunds = Array.isArray(input.refunds) ? input.refunds : [];
  const deduplicated = deduplicatePayments(payments);
  const customer = paymentBuckets(deduplicated.unique, 'PURCHASER_RECEIPT');
  const seller = paymentBuckets(deduplicated.unique, 'SELLER_PAYMENT');
  const refundAmount = (status: string) => sum(refunds.filter((refund) => refund.status === status));
  const paidRefunds = refunds.filter((refund) => refund.status === 'PAID');
  const pendingRefunds = refunds.filter((refund) => refund.status === 'REQUESTED' || refund.status === 'APPROVED');
  const refundedAmount = sum(paidRefunds);
  const forfeitedAmount = round(paidRefunds.reduce((total, refund) => total + amount(refund.forfeitAmount), 0));
  const pendingForfeitAmount = round(pendingRefunds.reduce((total, refund) => total + amount(refund.forfeitAmount), 0));

  const financeInput: SellAccountFinanceInput = {
    sellAmount: sale,
    purchaseAmount: purchase,
    expenses,
    ...(input.taxMode ? { taxMode: input.taxMode } : {}),
    ...(input.marginBasis ? { marginBasis: input.marginBasis } : {}),
    ...(input.sellerState ? { sellerState: input.sellerState } : {}),
    ...(input.purchaserState ? { purchaserState: input.purchaserState } : {}),
    purchaseExchangeValue,
    saleExchangeValue,
    payments: deduplicated.unique.map((payment) => ({ side: payment.side ?? '', amount: amount(payment.amount), receiptStatus: payment.receiptStatus ?? 'ISSUED' })),
    refunds: refunds.map((refund) => ({ status: refund.status ?? '', amount: amount(refund.amount), forfeitAmount: amount(refund.forfeitAmount) })),
    cancelled: input.cancelled === true,
  };
  const gst = calculateSellAccountGst(financeInput);
  const paymentSummary = calculateSellAccountPaymentSummary(financeInput);
  const expectedCustomerAmount = paymentSummary.customerCashReceivable;
  const expectedSellerAmount = paymentSummary.sellerCashPayable;
  const netCustomerReceived = round(Math.max(customer.realAmount - refundedAmount - forfeitedAmount, 0));
  const calculatedCustomerBalance = round(Math.max(expectedCustomerAmount - netCustomerReceived, 0));
  const calculatedSellerBalance = round(Math.max(expectedSellerAmount - seller.realAmount, 0));
  const source = input.source ?? {};
  const warnings: string[] = [];
  const sourceBalance = source.balanceAmount === undefined || source.balanceAmount === null ? null : amount(source.balanceAmount);
  const sourceProfit = source.netProfit === undefined || source.netProfit === null ? null : signedAmount(source.netProfit);
  const sourceProfitAfterGst = source.netProfitAfterGst === undefined || source.netProfitAfterGst === null ? null : signedAmount(source.netProfitAfterGst);

  if (sourceBalance !== null && Math.abs(difference(sourceBalance, calculatedCustomerBalance)) > 0.01) warnings.push(`Stored balanceAmount (${sourceBalance}) differs from reconciled customer balance (${calculatedCustomerBalance}).`);
  if (sourceProfit !== null && Math.abs(difference(sourceProfit, gst.marginAmount)) > 0.01) warnings.push(`Stored netProfit (${sourceProfit}) differs from reconciled profit before GST (${gst.marginAmount}).`);
  if (sourceProfitAfterGst !== null && Math.abs(difference(sourceProfitAfterGst, gst.netProfitAfterGst)) > 0.01) warnings.push(`Stored netProfitAfterGst (${sourceProfitAfterGst}) differs from reconciled post-GST profit (${gst.netProfitAfterGst}).`);
  if (input.gstRatePercent !== undefined && input.gstRatePercent !== null && amount(input.gstRatePercent) !== gst.gstRatePercent) warnings.push(`Stored GST rate (${amount(input.gstRatePercent)}%) differs from the canonical Sold Vehicle rate (${gst.gstRatePercent}%).`);
  if (input.taxMode && input.taxMode !== gst.taxMode) warnings.push(`Stored tax mode (${input.taxMode}) differs from the canonical Sold Vehicle mode (${gst.taxMode}).`);
  if (deduplicated.duplicateCount > 0) warnings.push(`${deduplicated.duplicateCount} duplicate payment row(s) were excluded from totals.`);
  if (customer.draftAmount > 0) warnings.push(`Customer draft receipts of ${customer.draftAmount} are pending and were excluded from received totals.`);
  if (seller.draftAmount > 0) warnings.push(`Seller draft payments of ${seller.draftAmount} are pending and were excluded from paid totals.`);

  const missingSourceAmount = input.purchaseAmount === undefined || input.purchaseAmount === null || input.sellAmount === undefined || input.sellAmount === null;
  if (missingSourceAmount) warnings.push('Purchase amount or sale amount is missing from the source record.');

  const profitAfterGst = gst.netProfitAfterGst;
  const marginPercentBeforeGst = sale > 0 ? round((gst.marginAmount / sale) * 100) : null;
  const marginPercentAfterGst = sale > 0 ? round((profitAfterGst / sale) * 100) : null;

  return {
    source: 'database' as const,
    formulaVersion: 'sell-account-finance-v1',
    amounts: {
      purchase,
      sale,
      expenses,
      expenseBreakdown: input.expenseBreakdown ?? null,
      purchaseExchangeValue,
      saleExchangeValue,
      cashPurchaseAmount: expectedSellerAmount,
      cashSaleAmount: expectedCustomerAmount,
      tradeMargin: round(sale - purchase),
      profitBeforeGst: gst.marginAmount,
      taxableAmount: gst.taxableAmount,
      gst: { ratePercent: gst.gstRatePercent, amount: gst.gstAmount, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst, taxType: gst.stateClassification, isIntraState: gst.isIntraState },
      profitAfterGst,
      profit: round(Math.max(profitAfterGst, 0)),
      loss: round(Math.max(-profitAfterGst, 0)),
      result: profitAfterGst > 0 ? 'PROFIT' : profitAfterGst < 0 ? 'LOSS' : 'BREAK_EVEN',
      marginPercentBeforeGst,
      marginPercentAfterGst,
    },
    payments: {
      customer: {
        expectedAmount: expectedCustomerAmount,
        realAmount: customer.realAmount,
        draftAmount: customer.draftAmount,
        cancelledAmount: customer.cancelledAmount,
        refundedAmount,
        forfeitedAmount,
        netReceived: netCustomerReceived,
        balance: calculatedCustomerBalance,
        status: paymentSummary.purchaserPaymentStatus ?? statusFor(netCustomerReceived, expectedCustomerAmount),
      },
      seller: {
        expectedAmount: expectedSellerAmount,
        realAmount: seller.realAmount,
        draftAmount: seller.draftAmount,
        cancelledAmount: seller.cancelledAmount,
        balance: calculatedSellerBalance,
        status: paymentSummary.sellerPaymentStatus ?? statusFor(seller.realAmount, expectedSellerAmount),
      },
    },
    refunds: {
      requestedAmount: refundAmount('REQUESTED'),
      approvedAmount: refundAmount('APPROVED'),
      paidAmount: refundedAmount,
      rejectedAmount: refundAmount('REJECTED'),
      pendingAmount: sum(pendingRefunds),
      pendingForfeitAmount,
      forfeitAmount: forfeitedAmount,
      count: refunds.length,
    },
    receipts: {
      realCount: customer.real.length + seller.real.length,
      realAmount: round(customer.realAmount + seller.realAmount),
      draftCount: customer.draft.length + seller.draft.length,
      draftAmount: round(customer.draftAmount + seller.draftAmount),
      cancelledCount: customer.cancelled.length + seller.cancelled.length,
      cancelledAmount: round(customer.cancelledAmount + seller.cancelledAmount),
    },
    duplicatePrevention: {
      strategy: 'payment-id-first; legacy receipt/listing/reference fingerprint fallback',
      duplicateCount: deduplicated.duplicateCount,
      ignoredPaymentIds: deduplicated.ignoredPaymentIds,
      countedPaymentIds: deduplicated.unique.map((payment) => payment.id).filter((id): id is string => Boolean(id)),
      noDoubleCount: true,
    },
    reconciliation: {
      status: missingSourceAmount ? 'INCOMPLETE' : warnings.some((warning) => warning.startsWith('Stored ') || warning.startsWith('Stored net') || warning.startsWith('Stored GST')) ? 'MISMATCH' : 'RECONCILED',
      warnings,
      source: { balanceAmount: sourceBalance, netProfit: sourceProfit, netProfitAfterGst: sourceProfitAfterGst },
      calculated: { customerBalance: calculatedCustomerBalance, profitBeforeGst: gst.marginAmount, profitAfterGst: gst.netProfitAfterGst },
      differences: {
        balanceAmount: sourceBalance === null ? null : difference(sourceBalance, calculatedCustomerBalance),
        netProfit: sourceProfit === null ? null : difference(sourceProfit, gst.marginAmount),
        netProfitAfterGst: sourceProfitAfterGst === null ? null : difference(sourceProfitAfterGst, gst.netProfitAfterGst),
      },
    },
    evidence: {
      realPaymentIds: deduplicated.unique.filter(isRealReceipt).map((payment) => payment.id).filter((id): id is string => Boolean(id)),
      draftPaymentIds: deduplicated.unique.filter(isDraftReceipt).map((payment) => payment.id).filter((id): id is string => Boolean(id)),
      cancelledPaymentIds: deduplicated.unique.filter(isCancelledReceipt).map((payment) => payment.id).filter((id): id is string => Boolean(id)),
      paymentRowsRead: payments.length,
      uniquePaymentRowsCounted: deduplicated.unique.length,
      refundRowsRead: refunds.length,
    },
  };
};

export type SoldVehicleFinancialReconciliation = ReturnType<typeof reconcileSoldVehicleFinancials>;
