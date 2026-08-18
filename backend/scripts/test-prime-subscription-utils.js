"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const customerPrime_1 = require("../src/utils/customerPrime");
const baseSettings = {
    enabled: true,
    upiId: 'prime@upi',
    amount: 499,
    validityValue: 30,
    validityUnit: 'DAYS',
    applyToCustomerRoleOnly: true,
    requireForCall: true,
    requireForWhatsapp: true,
    requireForSellListing: true,
    updatedAt: '2026-08-17T05:30:00.000Z',
    updatedByUserId: 'super-admin-1',
};
const snapshot = (0, customerPrime_1.buildPrimeSettingsSnapshot)(baseSettings);
strict_1.default.equal(snapshot.upiId, 'prime@upi');
strict_1.default.equal(snapshot.amount, 499);
strict_1.default.equal(snapshot.validityValue, 30);
strict_1.default.equal(snapshot.validityUnit, 'DAYS');
const expiryAt = (0, customerPrime_1.calculatePrimeExpiryAt)({
    paidAt: new Date('2026-08-17T00:00:00.000Z'),
    validityValue: 2,
    validityUnit: 'MONTHS',
});
strict_1.default.equal(expiryAt.toISOString(), '2026-10-17T00:00:00.000Z');
const paymentUri = (0, customerPrime_1.buildUpiPaymentUri)({
    upiId: 'prime@upi',
    amount: 499,
    payeeName: 'JCB Exchange',
    transactionNote: 'Prime customer subscription',
});
strict_1.default.equal(paymentUri, 'upi://pay?pa=prime%40upi&pn=JCB%20Exchange&am=499.00&cu=INR&tn=Prime%20customer%20subscription');
const activeAccess = (0, customerPrime_1.getCustomerPrimeAccessState)({
    role: 'CUSTOMER',
    now: new Date('2026-08-20T00:00:00.000Z'),
    subscriptions: [
        {
            id: 'sub-active',
            status: 'ACTIVE',
            startedAt: new Date('2026-08-18T00:00:00.000Z'),
            expiresAt: new Date('2026-09-18T00:00:00.000Z'),
        },
    ],
});
strict_1.default.equal(activeAccess.isPrimeCustomer, true);
strict_1.default.equal(activeAccess.customerCategory, 'PRIME_CUSTOMER');
strict_1.default.equal(activeAccess.hasActiveSubscription, true);
strict_1.default.equal(activeAccess.activeSubscriptionId, 'sub-active');
const expiredAccess = (0, customerPrime_1.getCustomerPrimeAccessState)({
    role: 'CUSTOMER',
    now: new Date('2026-10-20T00:00:00.000Z'),
    subscriptions: [
        {
            id: 'sub-expired',
            status: 'ACTIVE',
            startedAt: new Date('2026-08-18T00:00:00.000Z'),
            expiresAt: new Date('2026-09-18T00:00:00.000Z'),
        },
    ],
});
strict_1.default.equal(expiredAccess.isPrimeCustomer, false);
strict_1.default.equal(expiredAccess.customerCategory, 'STANDARD_CUSTOMER');
strict_1.default.equal(expiredAccess.hasActiveSubscription, false);
console.log('Prime subscription utility tests passed.');
//# sourceMappingURL=test-prime-subscription-utils.js.map