"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerPrimeAccessState = exports.buildUpiPaymentUri = exports.calculatePrimeExpiryAt = exports.buildPrimeSettingsSnapshot = exports.normalizeCustomerPrimeSettings = exports.normalizePrimeValidityUnit = void 0;
const normalizeTrimmedValue = (value) => {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : null;
};
const normalizeAmount = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }
    return Number(numericValue.toFixed(2));
};
const normalizeValidityValue = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return null;
    }
    return Math.round(numericValue);
};
const normalizePrimeValidityUnit = (value) => String(value || '').toUpperCase() === 'MONTHS' ? 'MONTHS' : 'DAYS';
exports.normalizePrimeValidityUnit = normalizePrimeValidityUnit;
const normalizeCustomerPrimeSettings = (settings) => ({
    enabled: settings?.enabled === true,
    upiId: normalizeTrimmedValue(settings?.upiId) || null,
    amount: normalizeAmount(settings?.amount),
    validityValue: normalizeValidityValue(settings?.validityValue),
    validityUnit: (0, exports.normalizePrimeValidityUnit)(settings?.validityUnit),
    applyToCustomerRoleOnly: true,
    requireForCall: true,
    requireForWhatsapp: true,
    requireForSellListing: true,
    updatedAt: settings?.updatedAt || null,
    updatedByUserId: settings?.updatedByUserId || null,
});
exports.normalizeCustomerPrimeSettings = normalizeCustomerPrimeSettings;
const buildPrimeSettingsSnapshot = (settings) => {
    const normalizedSettings = (0, exports.normalizeCustomerPrimeSettings)(settings);
    return {
        enabled: normalizedSettings.enabled,
        upiId: normalizedSettings.upiId,
        amount: normalizedSettings.amount,
        validityValue: normalizedSettings.validityValue,
        validityUnit: normalizedSettings.validityUnit,
        applyToCustomerRoleOnly: normalizedSettings.applyToCustomerRoleOnly,
        requireForCall: normalizedSettings.requireForCall,
        requireForWhatsapp: normalizedSettings.requireForWhatsapp,
        requireForSellListing: normalizedSettings.requireForSellListing,
        updatedAt: normalizedSettings.updatedAt,
        updatedByUserId: normalizedSettings.updatedByUserId,
    };
};
exports.buildPrimeSettingsSnapshot = buildPrimeSettingsSnapshot;
const calculatePrimeExpiryAt = ({ paidAt, validityValue, validityUnit, }) => {
    const expiryDate = new Date(paidAt);
    if (validityUnit === 'MONTHS') {
        expiryDate.setUTCMonth(expiryDate.getUTCMonth() + validityValue);
        return expiryDate;
    }
    expiryDate.setUTCDate(expiryDate.getUTCDate() + validityValue);
    return expiryDate;
};
exports.calculatePrimeExpiryAt = calculatePrimeExpiryAt;
const buildUpiPaymentUri = ({ upiId, amount, payeeName, transactionNote, }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('pa', upiId.trim());
    if (payeeName?.trim()) {
        searchParams.set('pn', payeeName.trim());
    }
    searchParams.set('am', amount.toFixed(2));
    searchParams.set('cu', 'INR');
    if (transactionNote?.trim()) {
        searchParams.set('tn', transactionNote.trim());
    }
    return `upi://pay?${searchParams.toString().replace(/\+/g, '%20')}`;
};
exports.buildUpiPaymentUri = buildUpiPaymentUri;
const getCustomerPrimeAccessState = ({ role, now, subscriptions, }) => {
    const referenceDate = now || new Date();
    const activeSubscription = (subscriptions || []).find((subscription) => {
        if (subscription.status !== 'ACTIVE') {
            return false;
        }
        if (!subscription.startedAt || !subscription.expiresAt) {
            return false;
        }
        return subscription.startedAt <= referenceDate && subscription.expiresAt >= referenceDate;
    }) || null;
    const isPrimeCustomer = role === 'CUSTOMER' && !!activeSubscription;
    return {
        isPrimeCustomer,
        customerCategory: (isPrimeCustomer ? 'PRIME_CUSTOMER' : 'STANDARD_CUSTOMER'),
        hasActiveSubscription: !!activeSubscription,
        activeSubscriptionId: activeSubscription?.id || null,
    };
};
exports.getCustomerPrimeAccessState = getCustomerPrimeAccessState;
//# sourceMappingURL=customerPrime.js.map