"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitKyc = exports.submitPartnerOnboarding = exports.savePartnerOnboarding = exports.getPartnerOnboarding = exports.updatePassword = exports.updateProfile = exports.submitCustomerPrimeSubscription = exports.getCustomerPrimeAccess = exports.getProfile = exports.googleLogin = exports.getGoogleClientConfig = exports.checkSetup = exports.verifyLoginOtp = exports.sendLoginOtp = exports.getMobileOtpConfig = exports.login = exports.register = exports.saveOnboardingData = exports.buildOnboardingResponse = exports.getPartnerOnboardingContext = exports.buildAuthUserPayload = exports.ensurePartnerProfileForUser = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const bootstrapSuperAdmin_1 = require("../utils/bootstrapSuperAdmin");
const accountAccess_1 = require("../utils/accountAccess");
const appSettings_1 = require("../utils/appSettings");
const mobileOtp_1 = require("../utils/mobileOtp");
const customerPrimeSubscriptions_1 = require("../utils/customerPrimeSubscriptions");
const JWT_SECRET = process.env.JWT_SECRET || 'jcbexchange_super_secret_key_123';
const prismaAny = prisma_1.default;
const businessPartnerTypes = new Set(['SHOWROOM']);
const requiredAgreementTypes = [
    'MARKETPLACE_TERMS',
    'PARTNER_TERMS',
    'LISTING_AUTHENTICITY',
    'MEDIA_OWNERSHIP',
    'CUSTOMER_DATA_USAGE',
    'FRAUD_POLICY',
    'COMMISSION_POLICY',
];
const individualRequiredDocs = [
    'PAN_CARD',
    'AADHAAR_CARD',
    'CANCELLED_CHEQUE',
    'PASSPORT_PHOTO',
];
const businessRequiredDocs = [
    'PAN_CARD',
    'GST_CERTIFICATE',
    'AUTHORIZED_PERSON_ID',
    'CANCELLED_CHEQUE',
    'PASSPORT_PHOTO',
];
const individualOptionalDocs = [];
const parseOptionalDate = (value) => {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const parseOptionalInt = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const parseOptionalFloat = (value) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const normalizeText = (value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};
const isBusinessPartnerType = (partnerType) => !!partnerType && businessPartnerTypes.has(partnerType);
const getRequiredDocuments = (partnerType) => !partnerType ? [] : isBusinessPartnerType(partnerType) ? businessRequiredDocs : individualRequiredDocs;
const getOptionalDocuments = (partnerType) => !partnerType || isBusinessPartnerType(partnerType) ? [] : individualOptionalDocs;
const getAllowedDocuments = (partnerType) => [
    ...getRequiredDocuments(partnerType),
    ...getOptionalDocuments(partnerType),
];
const isValidPartnerType = (partnerType) => !!partnerType && ['SHOWROOM', 'BROKER'].includes(partnerType);
const canHoldPartnerProfile = (role) => role === 'PARTNER' || role === 'CUSTOMER';
const getDefaultPartnerProfileData = (user) => ({
    userId: user.id,
    ownerName: user.name || null,
    businessName: user.name || user.email || 'Partner Account',
    onboardingStatus: 'PROFILE_PENDING',
    accountStatus: 'PENDING',
    kycStatus: 'NOT_STARTED',
});
const ensurePartnerProfileForUser = async (user) => {
    if (!user.id || !canHoldPartnerProfile(user.role)) {
        return null;
    }
    return prismaAny.partnerProfile.upsert({
        where: { userId: user.id },
        update: {},
        create: getDefaultPartnerProfileData(user),
    });
};
exports.ensurePartnerProfileForUser = ensurePartnerProfileForUser;
const isProfileComplete = (profile) => !!(normalizeText(profile.ownerName) &&
    normalizeText(profile.businessName) &&
    isValidPartnerType(profile.partnerType) &&
    normalizeText(profile.primaryContact) &&
    normalizeText(profile.whatsappNumber) &&
    normalizeText(profile.state) &&
    normalizeText(profile.district) &&
    normalizeText(profile.city) &&
    normalizeText(profile.pinCode) &&
    normalizeText(profile.businessAddress) &&
    normalizeText(profile.businessExperience) &&
    (profile.partnerType === 'SHOWROOM' || parseOptionalInt(profile.expectedMonthlyListings) !== null) &&
    (profile.partnerType === 'SHOWROOM' || normalizeText(profile.contactPreference) !== null));
const normalizeDocuments = (documents, partnerType) => {
    const allowedTypes = new Set(getAllowedDocuments(partnerType));
    return documents
        .filter((document) => allowedTypes.has(document.documentType))
        .map((document) => ({
        documentType: document.documentType,
        fileUrl: normalizeText(document.fileUrl),
        fileName: normalizeText(document.fileName),
        documentNumber: normalizeText(document.documentNumber),
        nameOnDocument: normalizeText(document.nameOnDocument),
        issueDate: parseOptionalDate(document.issueDate),
        expiryDate: parseOptionalDate(document.expiryDate),
        submittedNote: normalizeText(document.submittedNote),
    }))
        .filter((document) => !!document.fileUrl);
};
const areDocumentsComplete = (documents, partnerType) => {
    const uploadedTypes = new Set(documents.map((document) => document.documentType));
    return getRequiredDocuments(partnerType).every((documentType) => uploadedTypes.has(documentType));
};
const areAgreementsComplete = (agreementTypes) => requiredAgreementTypes.every((agreementType) => agreementTypes.includes(agreementType));
const determineDraftOnboardingStatus = ({ profileComplete, documentsComplete, agreementsComplete, }) => {
    if (!profileComplete) {
        return 'PROFILE_PENDING';
    }
    if (!documentsComplete) {
        return 'KYC_PENDING';
    }
    if (!agreementsComplete) {
        return 'AGREEMENT_PENDING';
    }
    return 'AGREEMENT_PENDING';
};
const buildAuthUserPayload = async (user) => {
    const resolvedRole = (0, accountAccess_1.resolveEffectiveUserRole)(user);
    const primeAccessPayload = resolvedRole === 'CUSTOMER'
        ? await (0, customerPrimeSubscriptions_1.getCustomerPrimeAccessPayload)({
            userId: user.id,
            role: resolvedRole,
        })
        : null;
    const baseUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: resolvedRole,
        rawRole: user.role,
        status: user.status,
        mobile: user.mobile ?? null,
        whatsappNumber: user.whatsappNumber ?? null,
        city: user.city ?? null,
        state: user.state ?? null,
        isPrimeCustomer: primeAccessPayload?.isPrimeCustomer ?? false,
        customerCategory: primeAccessPayload?.customerCategory ?? 'STANDARD_CUSTOMER',
        primeSubscriptionExpiresAt: primeAccessPayload?.activeSubscription?.expiresAt ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
    if (user.role === 'SUPER_ADMIN') {
        const adminProfile = await prismaAny.adminProfile.findUnique({
            where: { userId: user.id },
            select: {
                title: true,
                isRootAdmin: true,
            },
        });
        return {
            ...baseUser,
            permissions: ['ALL_ACCESS'],
            title: adminProfile?.title ?? 'Super Admin',
            isRootAdmin: adminProfile?.isRootAdmin ?? true,
        };
    }
    if (user.role === 'ADMIN' || user.role === 'EMPLOYEE') {
        const [permissions, customRole] = await Promise.all([
            prismaAny.adminPermission.findMany({
                where: { adminUserId: user.id },
                select: { permission: true },
            }),
            user.customRoleId
                ? prismaAny.customRole.findUnique({
                    where: { id: user.customRoleId },
                    select: { id: true, name: true, permissions: true },
                })
                : Promise.resolve(null),
        ]);
        const resolvedPermissions = customRole?.permissions && Array.isArray(customRole.permissions)
            ? customRole.permissions
            : permissions.map((item) => item.permission);
        return {
            ...baseUser,
            permissions: resolvedPermissions,
            customRoleId: customRole?.id ?? null,
            customRoleName: customRole?.name ?? null,
            title: user.adminProfile?.title ?? (user.role === 'EMPLOYEE' ? 'Employee' : 'Admin'),
            isRootAdmin: user.adminProfile?.isRootAdmin ?? false,
        };
    }
    if (canHoldPartnerProfile(user.role)) {
        const partnerProfile = await prismaAny.partnerProfile.findUnique({
            where: { userId: user.id },
            select: {
                ownerName: true,
                businessName: true,
                partnerType: true,
                businessAddress: true,
                district: true,
                pinCode: true,
                contactPreference: true,
                onboardingStatus: true,
                accountStatus: true,
                kycStatus: true,
            },
        });
        if (!partnerProfile && user.role !== 'PARTNER') {
            return baseUser;
        }
        const resolvedPartnerProfile = partnerProfile || (await (0, exports.ensurePartnerProfileForUser)(user));
        return {
            ...baseUser,
            name: resolvedPartnerProfile?.businessName ?? user.name,
            ownerName: resolvedPartnerProfile?.ownerName ?? user.name,
            onboardingStatus: resolvedPartnerProfile?.onboardingStatus ?? null,
            accountStatus: resolvedPartnerProfile?.accountStatus ?? null,
            kycStatus: resolvedPartnerProfile?.kycStatus ?? null,
            partnerType: resolvedPartnerProfile?.partnerType ?? null,
            businessAddress: resolvedPartnerProfile?.businessAddress ?? null,
            district: resolvedPartnerProfile?.district ?? null,
            pinCode: resolvedPartnerProfile?.pinCode ?? null,
            contactPreference: resolvedPartnerProfile?.contactPreference ?? null,
            city: user.city ?? null,
            state: user.state ?? null,
            mobile: user.mobile ?? null,
            whatsappNumber: user.whatsappNumber ?? null,
            isVerifiedPartner: resolvedRole === 'PARTNER',
            portalHomeRoute: resolvedRole === 'PARTNER'
                ? '/partner/dashboard'
                : resolvedRole === 'CUSTOMER'
                    ? '/profile'
                    : null,
        };
    }
    return baseUser;
};
exports.buildAuthUserPayload = buildAuthUserPayload;
const signAuthToken = (user) => jsonwebtoken_1.default.sign({
    id: user.id,
    email: user.email,
    role: user.role,
    rawRole: user.rawRole ?? user.role,
    status: user.status,
}, JWT_SECRET, { expiresIn: '7d' });
const assertAccountAccessOrRespond = (res, user) => {
    const accessState = (0, accountAccess_1.getAccountAccessState)(user);
    if (accessState === 'inactive') {
        res.status(403).json({
            error: accountAccess_1.ACCOUNT_INACTIVE_MESSAGE,
            code: accountAccess_1.ACCOUNT_INACTIVE_CODE,
        });
        return true;
    }
    if (accessState === 'revoked') {
        res.status(403).json({
            error: accountAccess_1.ACCOUNT_REVOKED_MESSAGE,
            code: accountAccess_1.ACCOUNT_REVOKED_CODE,
        });
        return true;
    }
    return false;
};
const sendMobileOtpViaGateway = async ({ apiKey, mobileNumber, templateId, senderId, templateMessage, }) => {
    if (templateId) {
        const response = await fetch(`https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=${encodeURIComponent(mobileNumber)}&authkey=${encodeURIComponent(apiKey)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        const payload = (await response.json().catch(() => null));
        if (!response.ok || payload?.type === 'error') {
            throw new Error(payload?.message || 'Unable to send OTP right now.');
        }
        return;
    }
    if (!senderId || !templateMessage) {
        throw new Error('OTP gateway configuration is incomplete.');
    }
    const response = await fetch(`https://world.msg91.com/api/otp.php?authkey=${encodeURIComponent(apiKey)}&mobile=${encodeURIComponent(mobileNumber)}&message=${encodeURIComponent(templateMessage)}&sender=${encodeURIComponent(senderId)}&otp_expiry=${(0, mobileOtp_1.getMobileOtpExpiryMinutes)()}`, {
        method: 'GET',
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok || payload?.type === 'error') {
        throw new Error(payload?.message || 'Unable to send OTP right now.');
    }
};
const verifyMobileOtpViaGateway = async ({ apiKey, mobileNumber, otp, }) => {
    const response = await fetch(`https://control.msg91.com/api/v5/otp/verify?otp=${encodeURIComponent(otp)}&mobile=${encodeURIComponent(mobileNumber)}`, {
        method: 'GET',
        headers: {
            authkey: apiKey,
        },
    });
    const payload = (await response.json().catch(() => null));
    if (!response.ok) {
        throw new Error(payload?.message || 'OTP verification failed.');
    }
    return (payload?.message || '').toLowerCase().includes('verified');
};
class GoogleAuthError extends Error {
    statusCode;
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'GoogleAuthError';
        this.statusCode = statusCode;
    }
}
const verifyGoogleIdToken = async (idToken) => {
    const normalizedToken = idToken?.trim();
    const googleClientId = await (0, appSettings_1.getRuntimeGoogleClientId)();
    const isGoogleConfigured = !!googleClientId;
    if (!isGoogleConfigured) {
        throw new GoogleAuthError('Google login is not configured on the server.');
    }
    if (!normalizedToken) {
        throw new GoogleAuthError('Google credential is required.');
    }
    let response;
    try {
        response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(normalizedToken)}`);
    }
    catch {
        throw new GoogleAuthError('Google verification service could not be reached. Please try again in a moment.', 502);
    }
    const tokenInfo = (await response.json());
    if (!response.ok) {
        const googleReason = tokenInfo.error_description?.trim() || tokenInfo.error?.trim() || null;
        throw new GoogleAuthError(googleReason
            ? `Google credential could not be verified: ${googleReason}`
            : 'Unable to verify Google credential.', 400);
    }
    if (tokenInfo.aud !== googleClientId) {
        throw new GoogleAuthError('Google credential audience mismatch. Please use the matching Google OAuth client for this website.');
    }
    const isEmailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';
    if (!isEmailVerified || !tokenInfo.email) {
        throw new GoogleAuthError('Google account email is not verified.');
    }
    return {
        email: tokenInfo.email.trim().toLowerCase(),
        name: tokenInfo.name?.trim() || tokenInfo.email.split('@')[0],
        googleSubject: tokenInfo.sub?.trim() || null,
    };
};
const getPartnerOnboardingContext = async (userId) => {
    let user = await prisma_1.default.user.findUnique({
        where: { id: userId },
        include: {
            partnerProfile: {
                include: {
                    kycDocuments: {
                        orderBy: { uploadedAt: 'asc' },
                    },
                    agreements: {
                        orderBy: { createdAt: 'asc' },
                    },
                    kycReviews: {
                        orderBy: { createdAt: 'desc' },
                        take: 10,
                    },
                },
            },
        },
    });
    if (!user || !canHoldPartnerProfile(user.role)) {
        return null;
    }
    if (!user.partnerProfile) {
        await (0, exports.ensurePartnerProfileForUser)(user);
        user = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: {
                partnerProfile: {
                    include: {
                        kycDocuments: {
                            orderBy: { uploadedAt: 'asc' },
                        },
                        agreements: {
                            orderBy: { createdAt: 'asc' },
                        },
                        kycReviews: {
                            orderBy: { createdAt: 'desc' },
                            take: 10,
                        },
                    },
                },
            },
        });
    }
    if (!user?.partnerProfile) {
        return null;
    }
    return user;
};
exports.getPartnerOnboardingContext = getPartnerOnboardingContext;
const buildOnboardingResponse = (partnerUser) => {
    const profile = partnerUser.partnerProfile;
    const acceptedAgreementTypes = new Set((profile.agreements || []).map((agreement) => agreement.agreementType));
    const requiredDocs = getRequiredDocuments(profile.partnerType);
    const profileComplete = isProfileComplete({
        ownerName: profile.ownerName,
        businessName: profile.businessName,
        partnerType: profile.partnerType,
        primaryContact: partnerUser.mobile,
        whatsappNumber: partnerUser.whatsappNumber,
        state: partnerUser.state,
        district: profile.district,
        city: partnerUser.city,
        pinCode: profile.pinCode,
        businessAddress: profile.businessAddress,
        businessExperience: profile.businessExperience,
        expectedMonthlyListings: profile.expectedMonthlyListings,
        contactPreference: profile.contactPreference,
    });
    const normalizedDocs = normalizeDocuments(profile.kycDocuments || [], profile.partnerType);
    const documentsComplete = areDocumentsComplete(normalizedDocs, profile.partnerType);
    const agreementsComplete = areAgreementsComplete(Array.from(acceptedAgreementTypes));
    return {
        profile: {
            ownerName: profile.ownerName || partnerUser.name || '',
            businessName: profile.businessName || '',
            partnerType: profile.partnerType || '',
            primaryContact: partnerUser.mobile || '',
            alternateMobile: profile.alternateMobile || '',
            whatsappNumber: partnerUser.whatsappNumber || '',
            email: partnerUser.email || '',
            state: partnerUser.state || '',
            district: profile.district || '',
            city: partnerUser.city || '',
            pinCode: profile.pinCode || '',
            businessAddress: profile.businessAddress || '',
            googleMapsLocation: profile.googleMapsLocation || '',
            businessDescription: profile.businessDescription || '',
            businessExperience: profile.businessExperience || '',
            expectedMonthlyListings: profile.expectedMonthlyListings || '',
            serviceAreas: profile.serviceAreas || '',
            workingHours: profile.workingHours || '',
            gstNumber: profile.gstNumber || '',
            businessRegistrationNumber: profile.businessRegistrationNumber || '',
            websiteUrl: profile.websiteUrl || '',
            socialLinks: profile.socialLinks || '',
            yearsInBusiness: profile.yearsInBusiness || '',
            teamSize: profile.teamSize || '',
            contactPreference: profile.contactPreference || 'PHONE_CALL',
            referralCode: profile.referralCode || '',
        },
        requiredDocuments: requiredDocs,
        kycDocuments: (profile.kycDocuments || []).map((document) => ({
            documentType: document.documentType,
            fileUrl: document.fileUrl,
            fileName: document.fileName,
            documentNumber: document.documentNumber,
            nameOnDocument: document.nameOnDocument,
            issueDate: document.issueDate ? new Date(document.issueDate).toISOString().slice(0, 10) : '',
            expiryDate: document.expiryDate ? new Date(document.expiryDate).toISOString().slice(0, 10) : '',
            submittedNote: document.submittedNote || '',
            status: document.status,
            reviewComment: document.reviewComment || '',
        })),
        agreements: requiredAgreementTypes.map((agreementType) => ({
            agreementType,
            checked: acceptedAgreementTypes.has(agreementType),
        })),
        reviewHistory: (profile.kycReviews || []).map((review) => ({
            id: review.id,
            action: review.action,
            comment: review.comment,
            createdAt: review.createdAt,
        })),
        progress: {
            profileComplete,
            documentsComplete,
            agreementsComplete,
            readyForSubmission: profileComplete && documentsComplete && agreementsComplete,
        },
    };
};
exports.buildOnboardingResponse = buildOnboardingResponse;
const saveOnboardingData = async ({ userId, userEmail, profile, kycDocuments, agreementTypes, submitForReview, preserveApprovalState = false, actionName, actionComment, }) => {
    const normalizedPartnerType = isValidPartnerType(profile.partnerType) ? profile.partnerType : undefined;
    const normalizedDocs = normalizeDocuments(kycDocuments, normalizedPartnerType);
    const profileComplete = isProfileComplete({
        ownerName: profile.ownerName,
        businessName: profile.businessName,
        partnerType: normalizedPartnerType,
        primaryContact: profile.primaryContact,
        alternateMobile: profile.alternateMobile,
        whatsappNumber: profile.whatsappNumber,
        email: profile.email,
        state: profile.state,
        district: profile.district,
        city: profile.city,
        pinCode: profile.pinCode,
        businessAddress: profile.businessAddress,
        googleMapsLocation: profile.googleMapsLocation,
        businessDescription: profile.businessDescription,
        businessExperience: profile.businessExperience,
        expectedMonthlyListings: profile.expectedMonthlyListings,
        serviceAreas: profile.serviceAreas,
        workingHours: profile.workingHours,
        gstNumber: profile.gstNumber,
        businessRegistrationNumber: profile.businessRegistrationNumber,
        websiteUrl: profile.websiteUrl,
        socialLinks: profile.socialLinks,
        yearsInBusiness: profile.yearsInBusiness,
        teamSize: profile.teamSize,
        contactPreference: profile.contactPreference,
        referralCode: profile.referralCode,
    });
    const documentsComplete = areDocumentsComplete(normalizedDocs, normalizedPartnerType);
    const agreementsComplete = areAgreementsComplete(agreementTypes);
    const onboardingStatus = submitForReview
        ? 'REVIEW_PENDING'
        : determineDraftOnboardingStatus({
            profileComplete,
            documentsComplete,
            agreementsComplete,
        });
    const kycStatus = submitForReview
        ? 'SUBMITTED'
        : normalizedDocs.length > 0
            ? documentsComplete
                ? 'INCOMPLETE'
                : 'INCOMPLETE'
            : 'NOT_STARTED';
    const currentPartnerProfile = await prismaAny.partnerProfile.findUnique({
        where: { userId },
        select: {
            id: true,
            onboardingStatus: true,
            accountStatus: true,
            kycStatus: true,
            approvedById: true,
            approvedAt: true,
            kycReviews: {
                where: {
                    action: {
                        in: ['SUPER_ADMIN_APPROVED', 'SUPER_ADMIN_CHANGES_REQUESTED', 'SUPER_ADMIN_REJECTED'],
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: 1,
                select: {
                    action: true,
                    actorUserId: true,
                    createdAt: true,
                },
            },
        },
    });
    const latestVerificationAction = currentPartnerProfile?.kycReviews?.[0] || null;
    const preserveApprovedFromCurrentState = currentPartnerProfile?.accountStatus === 'ACTIVE' &&
        currentPartnerProfile?.onboardingStatus === 'APPROVED' &&
        currentPartnerProfile?.kycStatus === 'APPROVED';
    const preserveApprovedFromReviewHistory = latestVerificationAction?.action === 'SUPER_ADMIN_APPROVED';
    const shouldPreserveApprovedState = preserveApprovalState &&
        (preserveApprovedFromCurrentState || preserveApprovedFromReviewHistory);
    await prisma_1.default.user.update({
        where: { id: userId },
        data: {
            name: normalizeText(profile.ownerName),
            email: normalizeText(profile.email) || userEmail || null,
            ...(normalizeText(profile.primaryContact) ? { mobile: normalizeText(profile.primaryContact) } : {}),
            ...(normalizeText(profile.whatsappNumber) ? { whatsappNumber: normalizeText(profile.whatsappNumber) } : { whatsappNumber: null }),
            ...(normalizeText(profile.city) ? { city: normalizeText(profile.city) } : { city: null }),
            ...(normalizeText(profile.state) ? { state: normalizeText(profile.state) } : { state: null }),
        },
    });
    const partnerProfile = await prismaAny.partnerProfile.update({
        where: { userId },
        data: {
            ownerName: normalizeText(profile.ownerName),
            businessName: normalizeText(profile.businessName),
            partnerType: normalizedPartnerType,
            businessAddress: normalizeText(profile.businessAddress),
            district: normalizeText(profile.district),
            pinCode: normalizeText(profile.pinCode),
            businessExperience: normalizeText(profile.businessExperience),
            expectedMonthlyListings: parseOptionalInt(profile.expectedMonthlyListings),
            referralCode: normalizeText(profile.referralCode),
            businessDescription: normalizeText(profile.businessDescription),
            businessLogoUrl: null,
            googleMapsLocation: normalizeText(profile.googleMapsLocation),
            serviceAreas: normalizeText(profile.serviceAreas),
            workingHours: normalizeText(profile.workingHours),
            alternateMobile: normalizeText(profile.alternateMobile),
            websiteUrl: normalizeText(profile.websiteUrl),
            socialLinks: normalizeText(profile.socialLinks),
            yearsInBusiness: parseOptionalInt(profile.yearsInBusiness),
            teamSize: parseOptionalInt(profile.teamSize),
            gstNumber: normalizeText(profile.gstNumber),
            businessRegistrationNumber: normalizeText(profile.businessRegistrationNumber),
            contactPreference: normalizeText(profile.contactPreference),
            onboardingStatus: shouldPreserveApprovedState ? 'APPROVED' : onboardingStatus,
            accountStatus: shouldPreserveApprovedState ? 'ACTIVE' : 'PENDING',
            kycStatus: shouldPreserveApprovedState ? 'APPROVED' : kycStatus,
            approvedById: shouldPreserveApprovedState
                ? latestVerificationAction?.actorUserId || currentPartnerProfile.approvedById
                : null,
            approvedAt: shouldPreserveApprovedState
                ? latestVerificationAction?.createdAt || currentPartnerProfile.approvedAt
                : null,
        },
    });
    await prismaAny.kycDocument.deleteMany({
        where: { partnerProfileId: partnerProfile.id },
    });
    if (normalizedDocs.length > 0) {
        await prismaAny.kycDocument.createMany({
            data: normalizedDocs.map((document) => ({
                partnerProfileId: partnerProfile.id,
                documentType: document.documentType,
                fileUrl: document.fileUrl,
                fileName: document.fileName,
                documentNumber: document.documentNumber,
                nameOnDocument: document.nameOnDocument,
                issueDate: document.issueDate,
                expiryDate: document.expiryDate,
                submittedNote: document.submittedNote,
                status: submitForReview ? 'UPLOADED' : 'UPLOADED',
            })),
        });
    }
    await prismaAny.partnerAgreement.deleteMany({
        where: { partnerProfileId: partnerProfile.id },
    });
    const selectedAgreementTypes = requiredAgreementTypes.filter((agreementType) => agreementTypes.includes(agreementType));
    if (selectedAgreementTypes.length > 0) {
        await prismaAny.partnerAgreement.createMany({
            data: selectedAgreementTypes.map((agreementType) => ({
                partnerProfileId: partnerProfile.id,
                agreementType: agreementType,
                version: 'v1.0',
                acceptedByUserId: userId,
                ipAddress: null,
            })),
        });
    }
    await prismaAny.kycReviewLog.create({
        data: {
            partnerProfileId: partnerProfile.id,
            actorUserId: userId,
            action: submitForReview ? 'PARTNER_SUBMITTED_FULL_ONBOARDING' : (actionName || 'PARTNER_SAVED_ONBOARDING_DRAFT'),
            comment: submitForReview
                ? actionComment || 'Partner submitted full onboarding package for review.'
                : actionComment || 'Partner saved onboarding draft.',
        },
    });
};
exports.saveOnboardingData = saveOnboardingData;
const register = async (req, res, next) => {
    try {
        const { email, password, name, mobile } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Please fill in all fields (Name, Email, Password).' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }
        const existingUser = await prisma_1.default.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const hasSuperAdmin = await (0, bootstrapSuperAdmin_1.ensureBootstrapSuperAdmin)();
        const newUser = hasSuperAdmin
            ? await prisma_1.default.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    mobile: mobile || undefined,
                    authProvider: 'LOCAL',
                    role: 'CUSTOMER',
                    status: 'ACTIVE',
                },
            })
            : await prisma_1.default.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    name,
                    mobile: mobile || undefined,
                    authProvider: 'LOCAL',
                    role: 'SUPER_ADMIN',
                    status: 'ACTIVE',
                    adminProfile: {
                        create: {
                            title: 'Platform Super Admin',
                            isRootAdmin: true,
                        },
                    },
                },
            });
        const authUser = await (0, exports.buildAuthUserPayload)(newUser);
        const token = signAuthToken(authUser);
        res.json({
            message: hasSuperAdmin
                ? 'Registration successful.'
                : 'Super admin registration successful',
            token,
            user: authUser,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.register = register;
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const user = await prisma_1.default.user.findUnique({ where: { email } });
        if (!user || !user.password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const userRecord = user;
        const isMatch = await bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const currentUser = await (0, accountAccess_1.fetchAuthenticatedUserById)(userRecord.id);
        if (assertAccountAccessOrRespond(res, currentUser)) {
            return;
        }
        const authUser = await (0, exports.buildAuthUserPayload)(currentUser);
        const token = signAuthToken(authUser);
        res.json({
            message: 'Login successful',
            token,
            user: authUser,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.login = login;
const getMobileOtpConfig = async (req, res, next) => {
    try {
        const settings = await (0, appSettings_1.getAppSettings)();
        res.json({
            enabled: settings.mobileOtp.enabled,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getMobileOtpConfig = getMobileOtpConfig;
const sendLoginOtp = async (req, res, next) => {
    try {
        const { mobile } = req.body;
        const settings = await (0, appSettings_1.getAppSettings)();
        if (!settings.mobileOtp.enabled) {
            return res.status(400).json({ error: 'Mobile OTP login is currently disabled.' });
        }
        if (!settings.mobileOtp.apiKey) {
            return res.status(400).json({ error: 'Mobile OTP gateway is not configured yet.' });
        }
        const normalizedMobile = (0, mobileOtp_1.normalizeLoginMobileNumber)(mobile);
        if (!normalizedMobile) {
            return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
        }
        const user = await prisma_1.default.user.findFirst({
            where: { mobile: normalizedMobile },
            select: { id: true },
        });
        if (!user) {
            return res.status(404).json({ error: 'No account found with this mobile number.' });
        }
        const currentUser = await (0, accountAccess_1.fetchAuthenticatedUserById)(user.id);
        if (assertAccountAccessOrRespond(res, currentUser)) {
            return;
        }
        const cooldownSeconds = await (0, mobileOtp_1.getMobileOtpCooldownSeconds)(normalizedMobile);
        if (cooldownSeconds > 0) {
            return res.status(429).json({
                error: `Please wait ${cooldownSeconds} seconds before requesting another OTP.`,
            });
        }
        const internationalMobileNumber = (0, mobileOtp_1.toInternationalMobileNumber)(normalizedMobile);
        await sendMobileOtpViaGateway({
            apiKey: settings.mobileOtp.apiKey,
            mobileNumber: internationalMobileNumber,
            templateId: settings.mobileOtp.templateId,
            senderId: settings.mobileOtp.senderId,
            templateMessage: settings.mobileOtp.templateMessage,
        });
        const session = await (0, mobileOtp_1.createMobileOtpSession)({
            mobile: normalizedMobile,
            userId: user.id,
        });
        res.json({
            message: 'OTP sent successfully.',
            challengeId: session.id,
            expiresInSeconds: (0, mobileOtp_1.getMobileOtpExpiryMinutes)() * 60,
            maskedMobile: (0, mobileOtp_1.maskMobileNumber)(normalizedMobile),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.sendLoginOtp = sendLoginOtp;
const verifyLoginOtp = async (req, res, next) => {
    try {
        const { challengeId, mobile, otp } = req.body;
        const settings = await (0, appSettings_1.getAppSettings)();
        if (!settings.mobileOtp.enabled || !settings.mobileOtp.apiKey) {
            return res.status(400).json({ error: 'Mobile OTP login is currently unavailable.' });
        }
        if (!challengeId || !otp) {
            return res.status(400).json({ error: 'Challenge and OTP are required.' });
        }
        const normalizedMobile = (0, mobileOtp_1.normalizeLoginMobileNumber)(mobile);
        if (!normalizedMobile) {
            return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
        }
        const session = await (0, mobileOtp_1.getMobileOtpSessionById)(challengeId);
        if (!session || session.mobile !== normalizedMobile) {
            return res.status(400).json({ error: 'OTP session is invalid. Please request a new OTP.' });
        }
        if ((0, mobileOtp_1.isMobileOtpSessionExpired)(session)) {
            await (0, mobileOtp_1.invalidateMobileOtpSession)(session.id);
            return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
        }
        if (!(0, mobileOtp_1.canAttemptMobileOtpVerification)(session)) {
            await (0, mobileOtp_1.invalidateMobileOtpSession)(session.id);
            return res.status(429).json({ error: 'Too many invalid attempts. Please request a new OTP.' });
        }
        const verified = await verifyMobileOtpViaGateway({
            apiKey: settings.mobileOtp.apiKey,
            mobileNumber: (0, mobileOtp_1.toInternationalMobileNumber)(normalizedMobile),
            otp: otp.trim(),
        });
        if (!verified) {
            const updatedSession = await (0, mobileOtp_1.recordMobileOtpAttempt)({
                sessionId: session.id,
                verified: false,
            });
            if (updatedSession && !(0, mobileOtp_1.canAttemptMobileOtpVerification)(updatedSession)) {
                await (0, mobileOtp_1.invalidateMobileOtpSession)(session.id);
            }
            return res.status(401).json({ error: 'Invalid OTP. Please try again.' });
        }
        await (0, mobileOtp_1.recordMobileOtpAttempt)({
            sessionId: session.id,
            verified: true,
        });
        const user = await prisma_1.default.user.findFirst({
            where: { mobile: normalizedMobile },
            select: { id: true, isMobileVerified: true },
        });
        if (!user) {
            return res.status(404).json({ error: 'No account found with this mobile number.' });
        }
        if (!user.isMobileVerified) {
            await prisma_1.default.user.update({
                where: { id: user.id },
                data: {
                    isMobileVerified: true,
                },
            });
        }
        const currentUser = await (0, accountAccess_1.fetchAuthenticatedUserById)(user.id);
        if (assertAccountAccessOrRespond(res, currentUser)) {
            return;
        }
        const authUser = await (0, exports.buildAuthUserPayload)(currentUser);
        const token = signAuthToken(authUser);
        res.json({
            message: 'OTP verified successfully.',
            token,
            user: authUser,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.verifyLoginOtp = verifyLoginOtp;
const checkSetup = async (req, res, next) => {
    try {
        const hasSuperAdmin = await (0, bootstrapSuperAdmin_1.ensureBootstrapSuperAdmin)();
        res.json({ hasSuperAdmin });
    }
    catch (error) {
        next(error);
    }
};
exports.checkSetup = checkSetup;
const getGoogleClientConfig = async (req, res, next) => {
    try {
        const clientId = await (0, appSettings_1.getRuntimeGoogleClientId)();
        res.json({
            enabled: !!clientId,
            clientId: clientId || null,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getGoogleClientConfig = getGoogleClientConfig;
const googleLogin = async (req, res, next) => {
    try {
        const { credential } = req.body;
        const googleProfile = await verifyGoogleIdToken(credential);
        let user = await prisma_1.default.user.findUnique({
            where: { email: googleProfile.email },
        });
        if (!user) {
            const hasSuperAdmin = await (0, bootstrapSuperAdmin_1.ensureBootstrapSuperAdmin)();
            if (!hasSuperAdmin) {
                return res.status(403).json({
                    error: 'Super admin setup is required before Google login can be used.',
                });
            }
            user = await prisma_1.default.user.create({
                data: {
                    email: googleProfile.email,
                    name: googleProfile.name,
                    authProvider: 'GOOGLE',
                    role: 'CUSTOMER',
                    status: 'ACTIVE',
                    isMobileVerified: true,
                },
            });
        }
        else if (user.authProvider !== 'GOOGLE') {
            user = await prisma_1.default.user.update({
                where: { id: user.id },
                data: {
                    authProvider: 'GOOGLE',
                    ...(user.name ? {} : { name: googleProfile.name }),
                },
            });
        }
        const currentUser = await (0, accountAccess_1.fetchAuthenticatedUserById)(user.id);
        const accessState = (0, accountAccess_1.getAccountAccessState)(currentUser);
        if (accessState === 'inactive') {
            return res.status(403).json({
                error: accountAccess_1.ACCOUNT_INACTIVE_MESSAGE,
                code: accountAccess_1.ACCOUNT_INACTIVE_CODE,
            });
        }
        if (accessState === 'revoked') {
            return res.status(403).json({
                error: accountAccess_1.ACCOUNT_REVOKED_MESSAGE,
                code: accountAccess_1.ACCOUNT_REVOKED_CODE,
            });
        }
        const authUser = await (0, exports.buildAuthUserPayload)(currentUser);
        const token = signAuthToken(authUser);
        res.json({
            message: 'Google login successful',
            token,
            user: authUser,
        });
    }
    catch (error) {
        if (error instanceof GoogleAuthError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error('Google login flow failed.', error);
        next(error);
    }
};
exports.googleLogin = googleLogin;
const getProfile = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const authUser = await (0, exports.buildAuthUserPayload)(user);
        res.json({ user: authUser });
    }
    catch (error) {
        next(error);
    }
};
exports.getProfile = getProfile;
const getCustomerPrimeAccess = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const accessPayload = await (0, customerPrimeSubscriptions_1.getCustomerPrimeAccessPayload)({
            userId: req.user.id,
            role: req.user.role,
        });
        return res.json({
            access: accessPayload,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getCustomerPrimeAccess = getCustomerPrimeAccess;
const submitCustomerPrimeSubscription = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (req.user.role !== 'CUSTOMER') {
            return res.status(403).json({ error: 'Prime subscription is available for customers only.' });
        }
        const { receiptUrl } = req.body;
        const subscription = await (0, customerPrimeSubscriptions_1.createCustomerPrimeSubscriptionRequest)({
            userId: req.user.id,
            role: req.user.role,
            receiptUrl,
        });
        const refreshedUser = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
        });
        if (!refreshedUser) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const authUser = await (0, exports.buildAuthUserPayload)(refreshedUser);
        return res.status(201).json({
            message: 'Prime payment submitted successfully. Super admin approval is pending.',
            subscription,
            user: authUser,
        });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
};
exports.submitCustomerPrimeSubscription = submitCustomerPrimeSubscription;
const updateProfile = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const userId = req.user.id;
        const { name, email, mobile, whatsappNumber, ownerName, businessName, state, district, city, pinCode, businessAddress, websiteUrl, googleMapsLocation, serviceAreas, } = req.body;
        const normalizedName = name?.trim();
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedMobile = mobile?.trim();
        const normalizedWhatsapp = whatsappNumber?.trim();
        const normalizedOwnerName = ownerName?.trim();
        const normalizedBusinessName = businessName?.trim();
        const normalizedState = state?.trim();
        const normalizedDistrict = district?.trim();
        const normalizedCity = city?.trim();
        const normalizedPinCode = pinCode?.trim();
        const normalizedBusinessAddress = businessAddress?.trim();
        const normalizedWebsiteUrl = websiteUrl?.trim();
        const normalizedGoogleMapsLocation = googleMapsLocation?.trim();
        const normalizedServiceAreas = serviceAreas?.trim();
        if (!normalizedEmail) {
            return res.status(400).json({ error: 'Email is required.' });
        }
        const currentUser = await prisma_1.default.user.findUnique({
            where: { id: userId },
            include: {
                adminProfile: true,
                partnerProfile: true,
            },
        });
        if (!currentUser) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const isPartnerProfileAccount = canHoldPartnerProfile(currentUser.role) && !!currentUser.partnerProfile;
        if (isPartnerProfileAccount) {
            if (!normalizedOwnerName) {
                return res.status(400).json({ error: 'Owner name is required.' });
            }
            if (!normalizedBusinessName) {
                return res.status(400).json({ error: 'Business name is required.' });
            }
        }
        else if (!normalizedName) {
            return res.status(400).json({ error: 'Name is required.' });
        }
        const conflictingEmailUser = await prisma_1.default.user.findFirst({
            where: {
                email: normalizedEmail,
                id: { not: userId },
            },
            select: { id: true },
        });
        if (conflictingEmailUser) {
            return res.status(409).json({ error: 'Email address is already in use.' });
        }
        if (normalizedMobile) {
            const conflictingMobileUser = await prisma_1.default.user.findFirst({
                where: {
                    mobile: normalizedMobile,
                    id: { not: userId },
                },
                select: { id: true },
            });
            if (conflictingMobileUser) {
                return res.status(409).json({ error: 'Mobile number is already in use.' });
            }
        }
        const partnerProfile = isPartnerProfileAccount
            ? currentUser.partnerProfile || (await (0, exports.ensurePartnerProfileForUser)(currentUser))
            : null;
        const updatedUser = await prisma_1.default.$transaction(async (tx) => {
            const nextUser = await tx.user.update({
                where: { id: userId },
                data: isPartnerProfileAccount
                    ? {
                        name: normalizedOwnerName || currentUser.name,
                        email: normalizedEmail,
                        mobile: normalizedMobile || null,
                        whatsappNumber: normalizedWhatsapp || null,
                        city: normalizedCity || null,
                        state: normalizedState || null,
                    }
                    : {
                        name: normalizedName || currentUser.name || null,
                        email: normalizedEmail,
                        mobile: normalizedMobile || null,
                        whatsappNumber: normalizedWhatsapp || null,
                    },
                include: {
                    adminProfile: true,
                },
            });
            if (isPartnerProfileAccount) {
                if (!partnerProfile) {
                    throw new Error('Partner profile not found.');
                }
                await tx.partnerProfile.update({
                    where: { userId },
                    data: {
                        ownerName: normalizedOwnerName || null,
                        businessName: normalizedBusinessName || null,
                        district: normalizedDistrict || null,
                        pinCode: normalizedPinCode || null,
                        businessAddress: normalizedBusinessAddress || null,
                        websiteUrl: normalizedWebsiteUrl || null,
                        googleMapsLocation: normalizedGoogleMapsLocation || null,
                        serviceAreas: normalizedServiceAreas || null,
                    },
                });
            }
            return nextUser;
        });
        const authUser = await (0, exports.buildAuthUserPayload)(updatedUser);
        res.json({
            message: 'Profile updated successfully.',
            user: authUser,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateProfile = updateProfile;
const updatePassword = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const { newPassword, confirmPassword } = req.body;
        if (!newPassword || !confirmPassword) {
            return res.status(400).json({ error: 'New password and confirm password are required.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: 'New password and confirm password must match.' });
        }
        const user = await prisma_1.default.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                password: true,
            },
        });
        if (!user || !user.password) {
            return res.status(404).json({ error: 'Password record not found for this user.' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, 10);
        await prisma_1.default.user.update({
            where: { id: req.user.id },
            data: {
                password: hashedPassword,
            },
        });
        res.json({ message: 'Password updated successfully.' });
    }
    catch (error) {
        next(error);
    }
};
exports.updatePassword = updatePassword;
const getPartnerOnboarding = async (req, res, next) => {
    try {
        if (!req.user?.id || !canHoldPartnerProfile(req.user.role)) {
            return res.status(403).json({ error: 'Partner onboarding access required.' });
        }
        const partnerUser = await (0, exports.getPartnerOnboardingContext)(req.user.id);
        if (!partnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found.' });
        }
        const authUser = await (0, exports.buildAuthUserPayload)(partnerUser);
        res.json({
            user: authUser,
            ...(0, exports.buildOnboardingResponse)(partnerUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPartnerOnboarding = getPartnerOnboarding;
const savePartnerOnboarding = async (req, res, next) => {
    try {
        if (!req.user?.id || !canHoldPartnerProfile(req.user.role)) {
            return res.status(403).json({ error: 'Partner onboarding access required.' });
        }
        const { profile, kycDocuments = [], agreements = [], actionName, actionComment, } = req.body;
        if (!profile) {
            return res.status(400).json({ error: 'Profile section is required.' });
        }
        const partnerUser = await (0, exports.getPartnerOnboardingContext)(req.user.id);
        if (!partnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found.' });
        }
        await (0, exports.saveOnboardingData)({
            userId: req.user.id,
            ...(req.user.email !== undefined ? { userEmail: req.user.email } : {}),
            profile,
            kycDocuments,
            agreementTypes: agreements,
            submitForReview: false,
            actionName,
            actionComment,
        });
        const refreshedPartnerUser = await (0, exports.getPartnerOnboardingContext)(req.user.id);
        if (!refreshedPartnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found after save.' });
        }
        const authUser = await (0, exports.buildAuthUserPayload)(refreshedPartnerUser);
        res.json({
            message: 'Onboarding draft saved successfully.',
            user: authUser,
            onboarding: (0, exports.buildOnboardingResponse)(refreshedPartnerUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.savePartnerOnboarding = savePartnerOnboarding;
const submitPartnerOnboarding = async (req, res, next) => {
    try {
        if (!req.user?.id || !canHoldPartnerProfile(req.user.role)) {
            return res.status(403).json({ error: 'Partner onboarding access required.' });
        }
        const { profile, kycDocuments = [], agreements = [], } = req.body;
        if (!profile) {
            return res.status(400).json({ error: 'Profile section is required.' });
        }
        const partnerUser = await (0, exports.getPartnerOnboardingContext)(req.user.id);
        if (!partnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found.' });
        }
        await (0, exports.saveOnboardingData)({
            userId: req.user.id,
            ...(req.user.email !== undefined ? { userEmail: req.user.email } : {}),
            profile,
            kycDocuments,
            agreementTypes: agreements,
            submitForReview: true,
            actionComment: req.body.actionComment,
        });
        const refreshedPartnerUser = await (0, exports.getPartnerOnboardingContext)(req.user.id);
        if (!refreshedPartnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found after submit.' });
        }
        const authUser = await (0, exports.buildAuthUserPayload)(refreshedPartnerUser);
        res.json({
            message: 'Full onboarding submitted successfully. Your application is now under review.',
            user: authUser,
            onboarding: (0, exports.buildOnboardingResponse)(refreshedPartnerUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.submitPartnerOnboarding = submitPartnerOnboarding;
exports.submitKyc = exports.submitPartnerOnboarding;
//# sourceMappingURL=auth.controller.js.map