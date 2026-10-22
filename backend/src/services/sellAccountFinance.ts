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
  | 'DEAL_DONE';

export interface SellAccountPaymentInput {
  side?: SellAccountPaymentSide | string;
  amount?: number | string;
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

export const calculateSellAccountPaymentSummary = (input: SellAccountFinanceInput = {}) => {
  const expectedSale = roundMoney(Math.max(number(input.sellAmount) - number(input.saleExchangeValue), 0));
  const expectedPurchase = roundMoney(Math.max(number(input.purchaseAmount) - number(input.purchaseExchangeValue), 0));
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const purchaserReceived = roundMoney(payments
    .filter((payment) => payment.side === 'PURCHASER_RECEIPT')
    .reduce((total, payment) => total + number(payment.amount), 0));
  const sellerPaid = roundMoney(payments
    .filter((payment) => payment.side === 'SELLER_PAYMENT')
    .reduce((total, payment) => total + number(payment.amount), 0));
  // A deal settled entirely by exchange has nothing left to collect in cash.
  const status = (received: number, expected: number, dealValue: unknown): SellAccountPaymentStatus => {
    if (expected <= 0) return number(dealValue) > 0 ? 'FULL' : 'UNPAID';
    if (received <= 0) return 'UNPAID';
    if (received >= expected) return 'FULL';
    return 'PARTIAL';
  };

  return {
    customerCashReceivable: expectedSale,
    sellerCashPayable: expectedPurchase,
    purchaserReceived,
    purchaserBalance: roundMoney(Math.max(expectedSale - purchaserReceived, 0)),
    purchaserPaymentStatus: status(purchaserReceived, expectedSale, input.sellAmount),
    sellerPaid,
    sellerBalance: roundMoney(Math.max(expectedPurchase - sellerPaid, 0)),
    sellerPaymentStatus: status(sellerPaid, expectedPurchase, input.purchaseAmount),
  };
};

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
