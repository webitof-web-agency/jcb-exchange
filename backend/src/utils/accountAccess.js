"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPortalStatusBlocked = exports.isAccountInactive = exports.isAccountRevoked = exports.getAccountAccessState = exports.resolveEffectiveUserRole = exports.fetchAuthenticatedUserById = exports.authenticatedUserSelect = exports.ACCOUNT_INACTIVE_MESSAGE = exports.ACCOUNT_INACTIVE_CODE = exports.ACCOUNT_REVOKED_MESSAGE = exports.ACCOUNT_REVOKED_CODE = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const prismaAny = prisma_1.default;
exports.ACCOUNT_REVOKED_CODE = 'ACCOUNT_REVOKED';
exports.ACCOUNT_REVOKED_MESSAGE = 'This account has been deactivated or removed. Please contact the super admin for access.';
exports.ACCOUNT_INACTIVE_CODE = 'ACCOUNT_INACTIVE';
exports.ACCOUNT_INACTIVE_MESSAGE = 'This account is inactive right now. Please contact the super admin to reactivate access.';
const inactiveUserStatuses = new Set(['INACTIVE']);
const revokedUserStatuses = new Set(['SUSPENDED', 'BLOCKED', 'CLOSED']);
const blockedPartnerStatuses = new Set(['SUSPENDED', 'BLOCKED', 'CLOSED']);
const approvedPartnerStatuses = {
    onboardingStatus: 'APPROVED',
    accountStatus: 'ACTIVE',
    kycStatus: 'APPROVED',
};
exports.authenticatedUserSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    status: true,
    mobile: true,
    whatsappNumber: true,
    city: true,
    state: true,
    partnerProfile: {
        select: {
            onboardingStatus: true,
            accountStatus: true,
            kycStatus: true,
            partnerType: true,
            ownerName: true,
            businessName: true,
            businessAddress: true,
            district: true,
            pinCode: true,
            contactPreference: true,
        },
    },
};
const fetchAuthenticatedUserById = async (userId) => {
    if (!userId) {
        return null;
    }
    return prismaAny.user.findUnique({
        where: { id: userId },
        select: exports.authenticatedUserSelect,
    });
};
exports.fetchAuthenticatedUserById = fetchAuthenticatedUserById;
const resolveEffectiveUserRole = (user) => {
    if (!user) {
        return 'CUSTOMER';
    }
    if (user.role === 'SUPER_ADMIN' ||
        user.role === 'ADMIN' ||
        user.role === 'EMPLOYEE' ||
        user.role === 'PARTNER') {
        return user.role;
    }
    const partnerProfile = user.partnerProfile;
    const isVerifiedPartner = partnerProfile?.onboardingStatus === approvedPartnerStatuses.onboardingStatus &&
        partnerProfile?.accountStatus === approvedPartnerStatuses.accountStatus &&
        partnerProfile?.kycStatus === approvedPartnerStatuses.kycStatus;
    return isVerifiedPartner ? 'PARTNER' : (user.role || 'CUSTOMER');
};
exports.resolveEffectiveUserRole = resolveEffectiveUserRole;
const getAccountAccessState = (user) => {
    if (!user) {
        return 'revoked';
    }
    if (user.status && inactiveUserStatuses.has(user.status)) {
        return 'inactive';
    }
    if (user.status && revokedUserStatuses.has(user.status)) {
        return 'revoked';
    }
    if ((0, exports.resolveEffectiveUserRole)(user) === 'PARTNER') {
        const accountStatus = user.partnerProfile?.accountStatus;
        if (!accountStatus || blockedPartnerStatuses.has(accountStatus)) {
            return 'revoked';
        }
    }
    return 'active';
};
exports.getAccountAccessState = getAccountAccessState;
const isAccountRevoked = (user) => (0, exports.getAccountAccessState)(user) === 'revoked';
exports.isAccountRevoked = isAccountRevoked;
const isAccountInactive = (user) => (0, exports.getAccountAccessState)(user) === 'inactive';
exports.isAccountInactive = isAccountInactive;
const isPortalStatusBlocked = (status) => !!status && (inactiveUserStatuses.has(status) || revokedUserStatuses.has(status));
exports.isPortalStatusBlocked = isPortalStatusBlocked;
//# sourceMappingURL=accountAccess.js.map