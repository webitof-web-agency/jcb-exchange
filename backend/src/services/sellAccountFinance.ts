export const SELL_ACCOUNT_GST_RATE_PERCENT = 18;

export type SellAccountTaxMode = 'INCLUSIVE' | 'EXCLUSIVE';
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
  sellerState?: string;
  purchaserState?: string;
  payments?: SellAccountPaymentInput[];
}

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

export const calculateSellAccountGst = (input: SellAccountFinanceInput = {}) => {
  const enteredSaleAmount = roundMoney(input.sellAmount);
  const purchaseAmount = roundMoney(input.purchaseAmount);
  const expenses = roundMoney(input.expenses);
  const rate = SELL_ACCOUNT_GST_RATE_PERCENT / 100;
  const netProfitBeforeGst = roundSignedMoney(enteredSaleAmount - purchaseAmount - expenses);
  // The entered profit is GST-inclusive. Extract the GST from the profit base.
  const taxableAmount = roundMoney(Math.max(netProfitBeforeGst, 0) / (1 + rate));
  const gstAmount = roundMoney(Math.max(netProfitBeforeGst, 0) - taxableAmount);
  // GST is tracked separately; the purchaser still pays the entered sell amount.
  const grossSaleAmount = enteredSaleAmount;
  const intraState = sameState(input.sellerState, input.purchaserState);
  const cgst = intraState ? roundMoney(gstAmount / 2) : 0;
  const sgst = intraState ? roundMoney(gstAmount - cgst) : 0;
  const igst = intraState ? 0 : gstAmount;

  return {
    gstRatePercent: SELL_ACCOUNT_GST_RATE_PERCENT,
    taxMode: 'INCLUSIVE' as const,
    taxableAmount,
    gstAmount,
    grossSaleAmount,
    cgst,
    sgst,
    igst,
    isIntraState: intraState,
    stateClassification: intraState ? 'CGST + SGST' : 'IGST',
    netProfitBeforeGst,
    netProfitAfterGst: netProfitBeforeGst >= 0 ? taxableAmount : netProfitBeforeGst,
  };
};

export const calculateSellAccountPaymentSummary = (input: SellAccountFinanceInput = {}) => {
  const expectedSale = roundMoney(input.sellAmount);
  const expectedPurchase = roundMoney(input.purchaseAmount);
  const payments = Array.isArray(input.payments) ? input.payments : [];
  const purchaserReceived = roundMoney(payments
    .filter((payment) => payment.side === 'PURCHASER_RECEIPT')
    .reduce((total, payment) => total + number(payment.amount), 0));
  const sellerPaid = roundMoney(payments
    .filter((payment) => payment.side === 'SELLER_PAYMENT')
    .reduce((total, payment) => total + number(payment.amount), 0));
  const status = (received: number, expected: number): SellAccountPaymentStatus => {
    if (received <= 0) return 'UNPAID';
    if (expected > 0 && received >= expected) return 'FULL';
    return 'PARTIAL';
  };

  return {
    purchaserReceived,
    purchaserBalance: roundMoney(Math.max(expectedSale - purchaserReceived, 0)),
    purchaserPaymentStatus: status(purchaserReceived, expectedSale),
    sellerPaid,
    sellerBalance: roundMoney(Math.max(expectedPurchase - sellerPaid, 0)),
    sellerPaymentStatus: status(sellerPaid, expectedPurchase),
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
