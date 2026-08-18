"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const publicListingVisibility_1 = require("../src/utils/publicListingVisibility");
strict_1.default.equal((0, publicListingVisibility_1.isPublicMarketplaceListingVisible)({
    status: 'PUBLISHED',
    partner: {
        role: 'CUSTOMER',
        status: 'ACTIVE',
        partnerProfile: null,
    },
}), true, 'published customer listings should be visible publicly');
strict_1.default.equal((0, publicListingVisibility_1.isPublicMarketplaceListingVisible)({
    status: 'PUBLISHED',
    partner: {
        role: 'PARTNER',
        status: 'ACTIVE',
        partnerProfile: {
            onboardingStatus: 'APPROVED',
            accountStatus: 'ACTIVE',
            kycStatus: 'APPROVED',
        },
    },
}), true, 'approved partner listings should remain visible publicly');
strict_1.default.equal((0, publicListingVisibility_1.isPublicMarketplaceListingVisible)({
    status: 'DRAFT',
    partner: {
        role: 'CUSTOMER',
        status: 'ACTIVE',
        partnerProfile: null,
    },
}), false, 'draft customer listings should not be visible publicly');
strict_1.default.equal((0, publicListingVisibility_1.isPublicMarketplaceListingVisible)({
    status: 'PUBLISHED',
    partner: {
        role: 'PARTNER',
        status: 'ACTIVE',
        partnerProfile: {
            onboardingStatus: 'REVIEW_PENDING',
            accountStatus: 'PENDING',
            kycStatus: 'SUBMITTED',
        },
    },
}), false, 'unapproved partner listings should not be visible publicly');
console.log('public listing visibility checks passed.');
//# sourceMappingURL=test-public-listing-visibility.js.map