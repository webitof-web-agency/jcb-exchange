import { createEmptyExpenseBreakdown, normalizeExpenseBreakdown, sumExpenseBreakdown } from './sellAccountFinance.mjs';

// JCB Exchange sits in the middle of every deal as the broker:
// vehicle purchased (partner / agent / direct customer / own stock) -> JCB Exchange -> sold to customer.
export const JCB_EXCHANGE_COMPANY_NAME = 'JCB Exchange';
export const JCB_EXCHANGE_BROKER = Object.freeze({ name: 'Arjun Kumar Gupta', number: '9183433895' });

export const SOURCE_TYPE_OPTIONS = [
  { value: 'PARTNER', label: 'Partner' },
  { value: 'AGENT', label: 'Agent' },
  { value: 'DIRECT_CUSTOMER', label: 'Direct Customer' },
  { value: 'JCB_EXCHANGE', label: 'JCB Exchange (own stock)' },
];

export const PURCHASE_TYPE_OPTIONS = [
  { value: 'PURCHASE', label: 'Purchase' },
  { value: 'EXCHANGE', label: 'Exchange' },
];

export const SALE_TYPE_OPTIONS = [
  { value: 'SELL', label: 'Sell' },
  { value: 'EXCHANGE', label: 'Exchange' },
];

const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);

const text = (value) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');
const upper = (value) => text(value).toUpperCase();
const digits = (value) => text(value).replace(/\D/g, '').slice(-10);
const place = (value) => {
  const normalized = text(value);
  return normalized && normalized.toLowerCase() !== 'not specified' ? normalized : '';
};

export const getSourceTypeLabel = (value) => SOURCE_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Not set';

/** Who listed the vehicle decides where JCB Exchange bought it from. */
export const resolveListingSourceType = (listing = {}) => {
  const role = upper(listing?.partner?.role);
  if (INTERNAL_ROLES.has(role)) return 'JCB_EXCHANGE';
  if (role === 'CUSTOMER') return 'DIRECT_CUSTOMER';
  if (role === 'PARTNER') return upper(listing?.partner?.partnerProfile?.partnerType) === 'BROKER' ? 'AGENT' : 'PARTNER';
  return '';
};

export const isOwnStockSource = (sourceType) => sourceType === 'JCB_EXCHANGE';

/** Expenses the admin added on the listing at approval, or null when there are none. */
export const getListingExpenseBreakdown = (listing = {}) => {
  const breakdown = normalizeExpenseBreakdown(listing?.adminExpenseBreakdown)
    || { ...createEmptyExpenseBreakdown(), other: Number(listing?.adminExpenseAmount) > 0 ? Number(listing.adminExpenseAmount) : 0 };
  return sumExpenseBreakdown(breakdown) > 0 ? breakdown : null;
};

/** Purchase side + broker defaults for a Sold Vehicle created from a listing. */
export const getListingDealParties = (listing = {}) => {
  const sourceType = resolveListingSourceType(listing);
  const ownStock = isOwnStockSource(sourceType);
  const listedPrice = Number(listing?.price) > 0 ? Number(listing.price) : 0;
  const listerName = text(listing?.dealer) || text(listing?.partner?.partnerProfile?.businessName) || text(listing?.partner?.name);
  const listerNumber = digits(listing?.dealerPhone) || digits(listing?.partner?.mobile) || digits(listing?.partner?.whatsappNumber);

  return {
    sourceType,
    sellerName: ownStock ? JCB_EXCHANGE_COMPANY_NAME : listerName,
    sellerNumber: ownStock ? JCB_EXCHANGE_BROKER.number : listerNumber,
    sellerCity: place(listing?.locationCity),
    sellerState: place(listing?.locationState),
    brokerName: JCB_EXCHANGE_BROKER.name,
    brokerNumber: JCB_EXCHANGE_BROKER.number,
    listedPrice,
    // `price` is the seller's own price (admin margin and expenses are stored separately), so it is
    // what JCB Exchange pays a partner / agent / customer. Own stock has no purchase price on the listing.
    purchaseAmount: ownStock ? 0 : listedPrice,
    expenseBreakdown: getListingExpenseBreakdown(listing),
  };
};

const isBlank = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return !value.trim();
  if (typeof value === 'number') return !(value > 0);
  if (typeof value === 'object' && !Array.isArray(value)) return sumExpenseBreakdown(value) <= 0;
  return false;
};

/** Copies prefill values only into fields the record has not filled yet. */
export const fillBlankFields = (form, fill = {}) => {
  const next = { ...form };
  for (const [key, value] of Object.entries(fill)) {
    if (!isBlank(value) && isBlank(next[key])) next[key] = value;
  }
  return next;
};

/** Switching the source to own stock (or away from it) keeps the purchase side consistent. */
export const applySourceTypeChange = (form, nextSourceType) => {
  if (isOwnStockSource(nextSourceType)) {
    return {
      ...form,
      sourceType: nextSourceType,
      sellerName: JCB_EXCHANGE_COMPANY_NAME,
      sellerNumber: JCB_EXCHANGE_BROKER.number,
    };
  }
  const wasOwnStock = isOwnStockSource(form.sourceType) && text(form.sellerName) === JCB_EXCHANGE_COMPANY_NAME;
  return {
    ...form,
    sourceType: nextSourceType,
    ...(wasOwnStock ? { sellerName: '', sellerNumber: '' } : {}),
  };
};
