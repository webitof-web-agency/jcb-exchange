export const GST_RATE_PERCENT = 18;

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

export const getSellAccountTaxLines = ({ isIntraState = false, cgst = 0, sgst = 0, igst = 0 } = {}) => (
  isIntraState
    ? [
      { key: 'cgst', label: 'CGST (9%)', ratePercent: 9, amount: cgst },
      { key: 'sgst', label: 'SGST (9%)', ratePercent: 9, amount: sgst },
    ]
    : [{ key: 'igst', label: 'IGST (18%)', ratePercent: 18, amount: igst }]
);

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
  const netProfitBeforeGst = roundSignedMoney(enteredSaleAmount - purchase - operatingExpenses);
  // The entered profit is GST-inclusive. Extract the GST from the profit base.
  const taxableAmount = roundMoney(Math.max(netProfitBeforeGst, 0) / (1 + rate));
  const gstAmount = roundMoney(Math.max(netProfitBeforeGst, 0) - taxableAmount);
  // GST is tracked separately; the purchaser still pays the entered sell amount.
  const grossSaleAmount = enteredSaleAmount;
  const intraState = sameState(sellerState, purchaserState);
  const cgst = intraState ? roundMoney(gstAmount / 2) : 0;
  const sgst = intraState ? roundMoney(gstAmount - cgst) : 0;
  const igst = intraState ? 0 : gstAmount;
  const netProfitAfterGst = netProfitBeforeGst >= 0 ? taxableAmount : netProfitBeforeGst;

  return {
    gstRatePercent: GST_RATE_PERCENT,
    taxMode: 'INCLUSIVE',
    taxableAmount,
    gstAmount,
    grossSaleAmount,
    cgst,
    sgst,
    igst,
    netProfitBeforeGst,
    netProfitAfterGst,
    isIntraState: intraState,
    stateClassification: intraState ? 'CGST + SGST' : 'IGST',
  };
};

export const calculateSellAccountPaymentSummary = ({
  sellAmount = 0,
  purchaseAmount = 0,
  taxMode = 'INCLUSIVE',
  payments = [],
} = {}) => {
  const expectedSale = roundMoney(sellAmount);
  const expectedPurchase = roundMoney(purchaseAmount);
  const safePayments = Array.isArray(payments) ? payments : [];
  const purchaserReceived = roundMoney(safePayments
    .filter((payment) => payment?.side === 'PURCHASER_RECEIPT')
    .reduce((total, payment) => total + number(payment?.amount), 0));
  const sellerPaid = roundMoney(safePayments
    .filter((payment) => payment?.side === 'SELLER_PAYMENT')
    .reduce((total, payment) => total + number(payment?.amount), 0));
  const purchaserBalance = roundMoney(Math.max(expectedSale - purchaserReceived, 0));
  const sellerBalance = roundMoney(Math.max(expectedPurchase - sellerPaid, 0));

  const paymentStatus = (received, expected) => {
    if (received <= 0) return 'UNPAID';
    if (expected > 0 && received >= expected) return 'FULL';
    return 'PARTIAL';
  };

  return {
    purchaserReceived,
    purchaserBalance,
    purchaserPaymentStatus: paymentStatus(purchaserReceived, expectedSale),
    sellerPaid,
    sellerBalance,
    sellerPaymentStatus: paymentStatus(sellerPaid, expectedPurchase),
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
