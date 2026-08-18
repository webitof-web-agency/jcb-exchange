"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const accountAccess_1 = require("../src/utils/accountAccess");
const verifiedPartnerRole = (0, accountAccess_1.resolveEffectiveUserRole)({
    role: 'CUSTOMER',
    partnerProfile: {
        onboardingStatus: 'APPROVED',
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
    },
});
strict_1.default.equal(verifiedPartnerRole, 'PARTNER', 'verified partner accounts should resolve to PARTNER');
const customerRole = (0, accountAccess_1.resolveEffectiveUserRole)({
    role: 'CUSTOMER',
    partnerProfile: null,
});
strict_1.default.equal(customerRole, 'CUSTOMER', 'standard customers should remain CUSTOMER');
const pendingPartnerRole = (0, accountAccess_1.resolveEffectiveUserRole)({
    role: 'CUSTOMER',
    partnerProfile: {
        onboardingStatus: 'PROFILE_PENDING',
        accountStatus: 'PENDING',
        kycStatus: 'NOT_STARTED',
    },
});
strict_1.default.equal(pendingPartnerRole, 'CUSTOMER', 'pending partner onboarding should not elevate the public role');
console.log('resolveEffectiveUserRole checks passed.');
//# sourceMappingURL=test-resolve-effective-role.js.map