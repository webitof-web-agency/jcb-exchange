export const SELL_ACCOUNT_GST_RATE_PERCENT = 18;

export type SellAccountTaxMode = 'INCLUSIVE' | 'EXCLUSIVE';
export type SellAccountMarginBasis = 'SALE_MINUS_PURCHASE' | 'AFTER_EXPENSES';
export type SellAccountPaymentSide = 'PURCHASER_RECEIPT' | 'SELLER_PAYMENT';
export type SellAccountPaymentStatus = 'UNPAID' | 'PARTIAL' | 'FULL';
export type SellAccountDealStatus =
  | 'OPEN'
  | 'PARTIAL_PAYMENT_RECEIVED'
  | 'FULL_PAYMENT'
  | 'RTO_WORK_STARTED'
  | 'RTO_WORK_IN_PROGRESS'
  | 'RTO_WORK_FAILED'
  | 'RTO_WORK_COMPLETED'
  | 'DEAL_DONE'
  | 'CANCELLED';

export type SellAccountReceiptStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED';

export interface SellAccountPaymentInput {
  side?: SellAccountPaymentSide | string;
  amount?: number | string;
  // Missing = ISSUED (records saved before draft receipts existed).
  receiptStatus?: SellAccountReceiptStatus | string | null;
}

export interface SellAccountRefundInput {
  status?: string;
  amount?: number | string;
  forfeitAmount?: number | string;
}

export interface SellAccountFinanceInput {
  sellAmount?: number | string;
  purchaseAmount?: number | string;
  expenses?: number | string;
  taxMode?: SellAccountTaxMode | string;
  // Older records keep SALE_MINUS_PURCHASE; anything else uses AFTER_EXPENSES.
  marginBasis?: SellAccountMarginBasis | string | null;
  sellerState?: string;
  purchaserState?: string;
  // Value of the vehicle JCB Exchange handed over (purchase) or took back (sale) in an exchange.
  // It is part of the deal value, but it is not cash, so it reduces the cash payable/receivable.
  purchaseExchangeValue?: number | string;
  saleExchangeValue?: number | string;
  payments?: SellAccountPaymentInput[];
  refunds?: SellAccountRefundInput[];
  cancelled?: boolean;
}

export const SELL_ACCOUNT_EXPENSE_KEYS = ['transport', 'paperwork', 'rtoWork', 'other'] as const;
export type SellAccountExpenseKey = (typeof SELL_ACCOUNT_EXPENSE_KEYS)[number];
export type SellAccountExpenseBreakdown = Record<SellAccountExpenseKey, number> & { otherLabel: string };

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const roundMoney = (value: unknown) => Math.round((number(value) + Number.EPSILON) * 100) / 100;

const signedNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundSignedMoney = (value: unknown) => Math.round((signedNumber(value) + Number.EPSILON) * 100) / 100;

const sameState = (sellerState?: string, purchaserState?: string) => {
  const seller = String(sellerState || '').trim().toLowerCase();
  const purchaser = String(purchaserState || '').trim().toLowerCase();
  return Boolean(seller && purchaser && seller === purchaser);
};

/** Returns null when no itemised breakdown was sent, so a plain expenses total keeps working. */
export const normalizeSellAccountExpenseBreakdown = (value: unknown): SellAccountExpenseBreakdown | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const otherLabel = typeof source.otherLabel === 'string' ? source.otherLabel.trim().slice(0, 120) : '';
  return {
    transport: roundMoney(source.transport),
    paperwork: roundMoney(source.paperwork),
    rtoWork: roundMoney(source.rtoWork),
    other: roundMoney(source.other),
    otherLabel,
  };
};

export const sumSellAccountExpenseBreakdown = (breakdown: SellAccountExpenseBreakdown) =>
  roundMoney(SELL_ACCOUNT_EXPENSE_KEYS.reduce((total, key) => total + number(breakdown[key]), 0));

export const resolveSellAccountMarginBasis = (value: unknown): SellAccountMarginBasis =>
  value === 'SALE_MINUS_PURCHASE' ? 'SALE_MINUS_PURCHASE' : 'AFTER_EXPENSES';

/**
 * The broker margin is GST-inclusive and the 18% GST is extracted from it.
 * AFTER_EXPENSES (current): margin = sell - purchase - expenses, so what is left after
 * GST is the final profit.
 * SALE_MINUS_PURCHASE (records saved before 2026-10-22): margin = sell - purchase, and the
 * expenses only reduce the profit after GST.
 */
export const calculateSellAccountGst = (input: SellAccountFinanceInput = {}) => {
  const enteredSaleAmount = roundMoney(input.sellAmount);
  const purchaseAmount = roundMoney(input.purchaseAmount);
  const expenses = roundMoney(input.expenses);
  const rate = SELL_ACCOUNT_GST_RATE_PERCENT / 100;
  const marginBasis = resolveSellAccountMarginBasis(input.marginBasis);
  const marginAmount = roundSignedMoney(
    enteredSaleAmount - purchaseAmount - (marginBasis === 'AFTER_EXPENSES' ? expenses : 0),
  );
  const taxableAmount = roundMoney(Math.max(marginAmount, 0) / (1 + rate));
  const gstAmount = roundMoney(Math.max(marginAmount, 0) - taxableAmount);
  // GST is tracked separately; the purchaser still pays the entered sell amount.
  const grossSaleAmount = enteredSaleAmount;
  const intraState = sameState(input.sellerState, input.purchaserState);
  const cgst = intraState ? roundMoney(gstAmount / 2) : 0;
  const sgst = intraState ? roundMoney(gstAmount - cgst) : 0;
  const igst = intraState ? 0 : gstAmount;
  const netProfitBeforeGst = marginBasis === 'AFTER_EXPENSES' ? marginAmount : roundSignedMoney(marginAmount - expenses);

  return {
    gstRatePercent: SELL_ACCOUNT_GST_RATE_PERCENT,
    taxMode: 'INCLUSIVE' as const,
    marginBasis,
    marginAmount,
    expenses,
    taxableAmount,
    gstAmount,
    grossSaleAmount,
    cgst,
    sgst,
    igst,
    isIntraState: intraState,
    stateClassification: intraState ? 'CGST + SGST' : 'IGST',
    netProfitBeforeGst,
    netProfitAfterGst: roundSignedMoney(netProfitBeforeGst - gstAmount),
  };
};

const isIssued = (payment: SellAccountPaymentInput) => (payment.receiptStatus ?? 'ISSUED') === 'ISSUED';

/**
 * Only ISSUED customer receipts count as money received; DRAFT receipts are shown as pending.
 * Paid refunds (and amounts forfeited on a cancelled deal) come off what was received.
 * A cancelled deal expects nothing more from the customer, so everything still held is refundable.
 */
export const calculateSellAccountPaymentSummary = (input: SellAccountFinanceInput = {}) => {
  const cancelled = input.cancelled === true;
  const dealSale = roundMoney(Math.max(number(input.sellAmount) - number(input.saleExchangeValue), 0));
  const expectedSale = cancelled ? 0 : dealSale;
  const expectedPurchase = roundMoney(Math.max(number(input.purchaseAmount) - number(input.purchaseExchangeValue), 0));
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const refunds = Array.isArray(input.refunds) ? input.refunds : [];
  const sum = (items: SellAccountPaymentInput[]) => roundMoney(items.reduce((total, payment) => total + number(payment.amount), 0));
  const customerReceipts = payments.filter((payment) => payment.side === 'PURCHASER_RECEIPT');
  const purchaserReceivedGross = sum(customerReceipts.filter(isIssued));
  const purchaserDraftPending = sum(customerReceipts.filter((payment) => payment.receiptStatus === 'DRAFT'));
  const paidRefunds = refunds.filter((refund) => refund.status === 'PAID');
  const purchaserRefunded = roundMoney(paidRefunds.reduce((total, refund) => total + number(refund.amount), 0));
  const purchaserForfeited = roundMoney(paidRefunds.reduce((total, refund) => total + number(refund.forfeitAmount), 0));
  const openRefunds = refunds.filter((refund) => refund.status === 'REQUESTED' || refund.status === 'APPROVED');
  const purchaserRefundPending = roundMoney(openRefunds.reduce((total, refund) => total + number(refund.amount) + number(refund.forfeitAmount), 0));
  const purchaserReceived = roundMoney(Math.max(purchaserReceivedGross - purchaserRefunded - purchaserForfeited, 0));
  const sellerPaid = sum(payments.filter((payment) => payment.side === 'SELLER_PAYMENT' && isIssued(payment)));
  // A deal settled entirely by exchange has nothing left to collect in cash.
  const status = (received: number, expected: number, dealValue: unknown): SellAccountPaymentStatus => {
    if (expected <= 0) return number(dealValue) > 0 ? 'FULL' : 'UNPAID';
    if (received <= 0) return 'UNPAID';
    if (received >= expected) return 'FULL';
    return 'PARTIAL';
  };
  const purchaserExcess = roundMoney(Math.max(purchaserReceived - expectedSale, 0));

  return {
    customerCashReceivable: expectedSale,
    sellerCashPayable: expectedPurchase,
    purchaserReceivedGross,
    purchaserDraftPending,
    purchaserRefunded,
    purchaserForfeited,
    purchaserRefundPending,
    purchaserReceived,
    purchaserBalance: roundMoney(Math.max(expectedSale - purchaserReceived, 0)),
    purchaserPaymentStatus: cancelled ? 'UNPAID' as SellAccountPaymentStatus : status(purchaserReceived, expectedSale, input.sellAmount),
    // Money the customer can be refunded now: overpayment, or everything held on a cancelled deal.
    purchaserRefundable: roundMoney(Math.max(purchaserExcess - purchaserRefundPending, 0)),
    sellerPaid,
    sellerBalance: roundMoney(Math.max(expectedPurchase - sellerPaid, 0)),
    sellerPaymentStatus: status(sellerPaid, expectedPurchase, input.purchaseAmount),
  };
};

type StoredRecord = {
  sellAmount: unknown; purchaseAmount: unknown; purchaseType?: string | null; saleType?: string | null;
  purchaseExchangeValue?: unknown; saleExchangeValue?: unknown; cancelledAt?: Date | string | null;
};

/** Payment summary of a stored Sold Vehicle (exchange values only count for exchange deals). */
export const paymentSummaryForSellAccount = (
  record: StoredRecord,
  payments: Array<{ side: string; amount: unknown; receiptStatus?: string | null }>,
  refunds: Array<{ status: string; amount: unknown; forfeitAmount?: unknown }> = [],
) => calculateSellAccountPaymentSummary({
  sellAmount: Number(record.sellAmount),
  purchaseAmount: Number(record.purchaseAmount),
  purchaseExchangeValue: record.purchaseType === 'EXCHANGE' ? Number(record.purchaseExchangeValue || 0) : 0,
  saleExchangeValue: record.saleType === 'EXCHANGE' ? Number(record.saleExchangeValue || 0) : 0,
  payments: payments.map((item) => ({ side: item.side, amount: Number(item.amount), receiptStatus: item.receiptStatus ?? 'ISSUED' })),
  refunds: refunds.map((refund) => ({ status: refund.status, amount: Number(refund.amount), forfeitAmount: Number(refund.forfeitAmount || 0) })),
  cancelled: Boolean(record.cancelledAt),
});

export const deriveSellAccountDealStatus = (
  purchaserPaymentStatus: SellAccountPaymentStatus,
  rtoStatus = 'PENDING',
  rtoLinked = false,
): SellAccountDealStatus => {
  const status = String(rtoStatus || 'PENDING').toUpperCase();
  if (['REJECTED', 'CANCELLED', 'FAILED', 'ERROR', 'RTO_WORK_FAILED'].includes(status)) return 'RTO_WORK_FAILED';
  if (status === 'DEAL_DONE') return 'DEAL_DONE';
  if (['COMPLETED', 'RTO_WORK_COMPLETED'].includes(status) && purchaserPaymentStatus === 'FULL') return 'DEAL_DONE';
  if (['COMPLETED', 'RTO_WORK_COMPLETED'].includes(status)) return 'RTO_WORK_COMPLETED';
  if (['IN_PROGRESS', 'RTO_WORK_IN_PROGRESS'].includes(status)) return 'RTO_WORK_IN_PROGRESS';
  if (['DOCUMENT_REQUIRED', 'SUBMITTED', 'APPROVED', 'RTO_WORK_STARTED'].includes(status)) return 'RTO_WORK_STARTED';
  if (status === 'PENDING' && rtoLinked) return 'RTO_WORK_IN_PROGRESS';
  if (purchaserPaymentStatus === 'FULL') return 'FULL_PAYMENT';
  if (purchaserPaymentStatus === 'PARTIAL') return 'PARTIAL_PAYMENT_RECEIVED';
  return 'OPEN';
};
