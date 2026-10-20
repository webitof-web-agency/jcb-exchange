export const GST_RATE_PERCENT = 18;

export const SELL_ACCOUNT_EXPENSE_FIELDS = [
  { key: 'transport', label: 'Vehicle transport' },
  { key: 'paperwork', label: 'Paperwork' },
  { key: 'rtoWork', label: 'RTO work' },
  { key: 'other', label: 'Other' },
];

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const roundMoney = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;

const signedNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundSignedMoney = (value) => Math.round((signedNumber(value) + Number.EPSILON) * 100) / 100;

const sameState = (sellerState, purchaserState) => {
  const seller = String(sellerState ?? '').trim().toLowerCase();
  const purchaser = String(purchaserState ?? '').trim().toLowerCase();
  return Boolean(seller && purchaser && seller === purchaser);
};

export const createEmptyExpenseBreakdown = () => ({ transport: 0, paperwork: 0, rtoWork: 0, other: 0, otherLabel: '' });

export const normalizeExpenseBreakdown = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    transport: roundMoney(value.transport),
    paperwork: roundMoney(value.paperwork),
    rtoWork: roundMoney(value.rtoWork),
    other: roundMoney(value.other),
    otherLabel: typeof value.otherLabel === 'string' ? value.otherLabel.trim().slice(0, 120) : '',
  };
};

export const sumExpenseBreakdown = (breakdown) => roundMoney(
  SELL_ACCOUNT_EXPENSE_FIELDS.reduce((total, field) => total + number(breakdown?.[field.key]), 0),
);

export const getSellAccountTaxLines = ({ isIntraState = false, cgst = 0, sgst = 0, igst = 0 } = {}) => (
  isIntraState
    ? [
      { key: 'cgst', label: 'CGST (9%)', ratePercent: 9, amount: cgst },
      { key: 'sgst', label: 'SGST (9%)', ratePercent: 9, amount: sgst },
    ]
    : [{ key: 'igst', label: 'IGST (18%)', ratePercent: 18, amount: igst }]
);

/**
 * Margin scheme for second-hand goods (Rule 32(5), CGST Rules 2017): GST is due on the
 * margin (sell - purchase), which is GST-inclusive, so the tax is extracted from it.
 * Expenses are not deducted from the GST base; they only reduce the final profit.
 * Mirrors backend/src/services/sellAccountFinance.ts.
 */
export const calculateSellAccountGst = ({
  sellAmount = 0,
  purchaseAmount = 0,
  expenses = 0,
  sellerState = '',
  purchaserState = '',
} = {}) => {
  const enteredSaleAmount = roundMoney(sellAmount);
  const purchase = roundMoney(purchaseAmount);
  const operatingExpenses = roundMoney(expenses);
  const rate = GST_RATE_PERCENT / 100;
  const marginAmount = roundSignedMoney(enteredSaleAmount - purchase);
  const taxableAmount = roundMoney(Math.max(marginAmount, 0) / (1 + rate));
  const gstAmount = roundMoney(Math.max(marginAmount, 0) - taxableAmount);
  // GST is tracked separately; the purchaser still pays the entered sell amount.
  const grossSaleAmount = enteredSaleAmount;
  const intraState = sameState(sellerState, purchaserState);
  const cgst = intraState ? roundMoney(gstAmount / 2) : 0;
  const sgst = intraState ? roundMoney(gstAmount - cgst) : 0;
  const igst = intraState ? 0 : gstAmount;
  const netProfitBeforeGst = roundSignedMoney(marginAmount - operatingExpenses);

  return {
    gstRatePercent: GST_RATE_PERCENT,
    taxMode: 'INCLUSIVE',
    marginAmount,
    expenses: operatingExpenses,
    taxableAmount,
    gstAmount,
    grossSaleAmount,
    cgst,
    sgst,
    igst,
    netProfitBeforeGst,
    netProfitAfterGst: roundSignedMoney(netProfitBeforeGst - gstAmount),
    isIntraState: intraState,
    stateClassification: intraState ? 'CGST + SGST' : 'IGST',
  };
};

export const calculateSellAccountPaymentSummary = ({
  sellAmount = 0,
  purchaseAmount = 0,
  saleExchangeValue = 0,
  purchaseExchangeValue = 0,
  payments = [],
} = {}) => {
  // Exchange vehicles are part of the deal value but not cash.
  const expectedSale = roundMoney(Math.max(number(sellAmount) - number(saleExchangeValue), 0));
  const expectedPurchase = roundMoney(Math.max(number(purchaseAmount) - number(purchaseExchangeValue), 0));
  const safePayments = Array.isArray(payments) ? payments : [];
  const purchaserReceived = roundMoney(safePayments
    .filter((payment) => payment?.side === 'PURCHASER_RECEIPT')
    .reduce((total, payment) => total + number(payment?.amount), 0));
  const sellerPaid = roundMoney(safePayments
    .filter((payment) => payment?.side === 'SELLER_PAYMENT')
    .reduce((total, payment) => total + number(payment?.amount), 0));
  const purchaserBalance = roundMoney(Math.max(expectedSale - purchaserReceived, 0));
  const sellerBalance = roundMoney(Math.max(expectedPurchase - sellerPaid, 0));

  const paymentStatus = (received, expected, dealValue) => {
    if (expected <= 0) return number(dealValue) > 0 ? 'FULL' : 'UNPAID';
    if (received <= 0) return 'UNPAID';
    if (received >= expected) return 'FULL';
    return 'PARTIAL';
  };

  return {
    customerCashReceivable: expectedSale,
    sellerCashPayable: expectedPurchase,
    purchaserReceived,
    purchaserBalance,
    purchaserPaymentStatus: paymentStatus(purchaserReceived, expectedSale, sellAmount),
    sellerPaid,
    sellerBalance,
    sellerPaymentStatus: paymentStatus(sellerPaid, expectedPurchase, purchaseAmount),
  };
};

export const deriveSellAccountDealStatus = ({
  purchaserPaymentStatus = 'UNPAID',
  rtoStatus = 'PENDING',
  rtoLinked = false,
} = {}) => {
  const normalizedRtoStatus = String(rtoStatus || 'PENDING').toUpperCase();
  if (['REJECTED', 'CANCELLED', 'FAILED', 'ERROR', 'RTO_WORK_FAILED'].includes(normalizedRtoStatus)) return 'RTO_WORK_FAILED';
  if (normalizedRtoStatus === 'DEAL_DONE') return 'DEAL_DONE';
  if (['COMPLETED', 'RTO_WORK_COMPLETED'].includes(normalizedRtoStatus) && purchaserPaymentStatus === 'FULL') return 'DEAL_DONE';
  if (['COMPLETED', 'RTO_WORK_COMPLETED'].includes(normalizedRtoStatus)) return 'RTO_WORK_COMPLETED';
  if (['IN_PROGRESS', 'RTO_WORK_IN_PROGRESS'].includes(normalizedRtoStatus)) return 'RTO_WORK_IN_PROGRESS';
  if (['DOCUMENT_REQUIRED', 'SUBMITTED', 'APPROVED', 'RTO_WORK_STARTED'].includes(normalizedRtoStatus)) return 'RTO_WORK_STARTED';
  if (normalizedRtoStatus === 'PENDING' && rtoLinked) return 'RTO_WORK_IN_PROGRESS';
  if (purchaserPaymentStatus === 'FULL') return 'FULL_PAYMENT';
  if (purchaserPaymentStatus === 'PARTIAL') return 'PARTIAL_PAYMENT_RECEIVED';
  return 'OPEN';
};

export const calculateSellAccountFinance = (input = {}) => ({
  gst: calculateSellAccountGst(input),
  payments: calculateSellAccountPaymentSummary(input),
});
