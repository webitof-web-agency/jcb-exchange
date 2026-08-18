"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const publicListingVisibility_1 = require("../src/utils/publicListingVisibility");
const approvedPartnerListing = (0, publicListingVisibility_1.isPublicMarketplaceListingVisible)({
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
});
strict_1.default.equal(approvedPartnerListing, true, 'approved verified partners should remain visible on detail pages');
const incompletePartnerListing = (0, publicListingVisibility_1.isPublicMarketplaceListingVisible)({
    status: 'PUBLISHED',
    partner: {
        role: 'PARTNER',
        status: 'ACTIVE',
        partnerProfile: {
            onboardingStatus: 'APPROVED',
            accountStatus: 'ACTIVE',
            kycStatus: null,
        },
    },
});
strict_1.default.equal(incompletePartnerListing, false, 'partners missing required verification state should stay hidden');
console.log('public listing detail visibility checks passed.');
//# sourceMappingURL=test-public-listing-detail-visibility.js.map