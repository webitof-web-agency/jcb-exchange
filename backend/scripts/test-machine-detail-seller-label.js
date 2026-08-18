"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const publicListingVisibility_1 = require("../src/utils/publicListingVisibility");
const customerSeller = (0, publicListingVisibility_1.getMarketplaceSellerPresentation)({
    role: 'CUSTOMER',
    name: 'Shaurya Kumar',
    partnerProfile: null,
});
strict_1.default.equal(customerSeller.partnerType, null, 'customer sellers should not be tagged as dealer');
strict_1.default.equal(customerSeller.displayName, 'Shaurya Kumar', 'customer seller name should stay intact');
const partnerSeller = (0, publicListingVisibility_1.getMarketplaceSellerPresentation)({
    role: 'PARTNER',
    name: 'Fallback Name',
    partnerProfile: {
        businessName: 'Amar Earthmovers',
        partnerType: 'SHOWROOM',
    },
});
strict_1.default.equal(partnerSeller.partnerType, 'SHOWROOM', 'approved partners should preserve partner type');
strict_1.default.equal(partnerSeller.displayName, 'Amar Earthmovers', 'partner business name should be preferred');
console.log('machine detail seller presentation checks passed.');
//# sourceMappingURL=test-machine-detail-seller-label.js.map