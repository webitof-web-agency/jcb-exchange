"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getModuleBadges = exports.submitAdminPartnerOnboarding = exports.saveAdminPartnerOnboarding = exports.getAdminPartnerOnboarding = exports.deletePartnerUser = exports.updatePartnerUser = exports.updateAdminUserStatus = exports.updateAdminListingStatus = exports.updateVerificationStatus = exports.getAdminListings = exports.getVerificationDetail = exports.getPendingVerifications = exports.createPartnerUser = exports.createManagedUser = exports.deleteManagedUser = exports.resetManagedUserPassword = exports.updateManagedUserAccount = exports.getCustomerVisitors = exports.getAdminPartners = exports.getAdminUsers = exports.updateInspectionSectionContent = exports.updateHeroImageContent = exports.getInspectionSectionContent = exports.getHeroImageContent = exports.updateFinanceSupportContent = exports.getFinanceSupportContent = exports.updateCustomerPrimePaymentStatus = exports.getCustomerPrimePayments = exports.updatePlatformSettings = exports.getPlatformSettings = exports.getDashboardSummary = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../lib/prisma"));
const auth_controller_1 = require("./auth.controller");
const appSettings_1 = require("../utils/appSettings");
const customerPrime_1 = require("../utils/customerPrime");
const customerPrimeSubscriptions_1 = require("../utils/customerPrimeSubscriptions");
const prismaAny = prisma_1.default;
const normalizePhoneNumber = (value) => {
    const trimmedValue = value?.trim();
    if (!trimmedValue) {
        return null;
    }
    const normalizedDigits = trimmedValue.replace(/\D/g, '');
    if (normalizedDigits.length < 10) {
        return null;
    }
    return normalizedDigits;
};
const getDefaultSuperAdminContact = async () => {
    const superAdminUser = await prisma_1.default.user.findFirst({
        where: {
            role: 'SUPER_ADMIN',
        },
        select: {
            mobile: true,
            whatsappNumber: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });
    const adminCallNumber = normalizePhoneNumber(superAdminUser?.mobile);
    const adminWhatsappNumber = normalizePhoneNumber(superAdminUser?.whatsappNumber);
    return {
        adminCallNumber,
        adminWhatsappNumber,
    };
};
const allowedVerificationStatuses = new Set([
    'UNDER_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
]);
const allowedListingStatuses = new Set([
    'DRAFT',
    'PENDING_APPROVAL',
    'CHANGES_REQUESTED',
    'PUBLISHED',
    'PAUSED',
    'RESERVED',
    'SOLD',
    'REJECTED',
]);
const allowedAdminPermissions = new Set([
    'MANAGE_PARTNERS',
    'REVIEW_KYC',
    'REVIEW_LISTINGS',
    'MANAGE_LEADS',
    'MANAGE_FINANCE',
    'MANAGE_REFUNDS',
    'MANAGE_SUPPORT',
    'MANAGE_CMS',
    'MANAGE_SEO',
    'VIEW_REPORTS',
    'MANAGE_SETTINGS',
    'MANAGE_ADMINS',
]);
const allowedPartnerTypes = new Set([
    'SHOWROOM',
    'BROKER',
]);
const hasPartnerProfile = (user) => !!user?.partnerProfile;
const managedUserInclude = {
    adminProfile: true,
    adminPermissions: {
        select: {
            permission: true,
        },
    },
    customRole: true,
    partnerProfile: true,
    createdBy: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
        },
    },
    _count: {
        select: {
            listings: true,
        },
    },
    customerPrimeSubscriptions: {
        where: {
            status: {
                in: ['ACTIVE', 'PENDING'],
            },
        },
        orderBy: {
            submittedAt: 'desc',
        },
        select: {
            id: true,
            status: true,
            startedAt: true,
            expiresAt: true,
            submittedAt: true,
        },
    },
};
const verificationDetailInclude = {
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
                take: 20,
            },
        },
    },
};
const mapManagedUser = (user) => {
    const primeAccessState = (0, customerPrime_1.getCustomerPrimeAccessState)({
        role: user.role,
        subscriptions: (user.customerPrimeSubscriptions || []).map((subscription) => ({
            id: subscription.id,
            status: subscription.status,
            startedAt: subscription.startedAt,
            expiresAt: subscription.expiresAt,
        })),
    });
    return {
        id: user.id,
        name: user.partnerProfile?.businessName ||
            user.name ||
            user.email ||
            'Unnamed user',
        fullName: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        customRoleId: user.customRoleId || null,
        customRoleName: user.customRole?.name || null,
        status: user.status,
        authProvider: user.authProvider || 'LOCAL',
        city: user.city || null,
        state: user.state || null,
        isPrimeCustomer: primeAccessState.isPrimeCustomer,
        customerCategory: primeAccessState.customerCategory,
        primeSubscriptionExpiresAt: primeAccessState.hasActiveSubscription
            ? (user.customerPrimeSubscriptions || []).find((subscription) => subscription.id === primeAccessState.activeSubscriptionId)?.expiresAt || null
            : null,
        primeSubscriptionStatus: (user.customerPrimeSubscriptions || [])[0]?.status || null,
        adminTitle: user.adminProfile?.title || null,
        isRootAdmin: user.adminProfile?.isRootAdmin || false,
        permissions: user.customRole?.permissions && Array.isArray(user.customRole.permissions)
            ? user.customRole.permissions
            : (user.adminPermissions || []).map((item) => item.permission),
        partnerType: user.partnerProfile?.partnerType || null,
        kycStatus: user.partnerProfile?.kycStatus || null,
        onboardingStatus: user.partnerProfile?.onboardingStatus || null,
        accountStatus: user.partnerProfile?.accountStatus || null,
        createdAt: user.createdAt,
        createdBy: user.createdBy || null,
        partnerProfile: user.partnerProfile || null,
    };
};
const getApprovedPartnerAccountStatus = ({ currentAccountStatus, onboardingStatus, kycStatus, }) => {
    if (currentAccountStatus === 'ACTIVE') {
        return 'ACTIVE';
    }
    if (onboardingStatus === 'APPROVED' && kycStatus === 'APPROVED') {
        return 'ACTIVE';
    }
    return 'PENDING';
};
const mapPartnerAccountStatus = ({ status, currentAccountStatus, onboardingStatus, kycStatus, }) => {
    if (status === 'BLOCKED') {
        return 'BLOCKED';
    }
    if (status === 'SUSPENDED') {
        return 'SUSPENDED';
    }
    if (status === 'INACTIVE') {
        return getApprovedPartnerAccountStatus({
            currentAccountStatus,
            onboardingStatus,
            kycStatus,
        });
    }
    if (status === 'ACTIVE') {
        return getApprovedPartnerAccountStatus({
            currentAccountStatus,
            onboardingStatus,
            kycStatus,
        });
    }
    return 'PENDING';
};
const createPartnerNotification = async ({ userId, title, message, link, type, }) => {
    await prismaAny.notification.create({
        data: {
            userId,
            title,
            message,
            link,
            type,
        },
    });
};
const getDashboardSummary = async (req, res, next) => {
    try {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        sixMonthsAgo.setHours(0, 0, 0, 0);
        const [totalPartners, approvedPartners, pendingKyc, activeListings, recentPartners, recentUsersData, recentListingsData, totalEnquiries, categoryStats, recentListingsRaw, recentEnquiriesRaw] = await Promise.all([
            prisma_1.default.user.count({
                where: {
                    role: 'PARTNER',
                },
            }),
            prisma_1.default.user.count({
                where: {
                    role: 'PARTNER',
                    partnerProfile: {
                        kycStatus: 'APPROVED',
                    },
                },
            }),
            prisma_1.default.partnerProfile.count({
                where: {
                    kycStatus: {
                        in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
                    },
                },
            }),
            prisma_1.default.listing.count({
                where: {
                    status: 'PUBLISHED',
                },
            }),
            prisma_1.default.user.findMany({
                where: {
                    partnerProfile: {
                        isNot: null,
                    },
                },
                include: {
                    partnerProfile: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 5,
            }),
            prisma_1.default.user.findMany({
                where: { role: 'PARTNER', createdAt: { gte: sixMonthsAgo } },
                select: { createdAt: true },
            }),
            prisma_1.default.listing.findMany({
                where: { createdAt: { gte: sixMonthsAgo } },
                select: { createdAt: true },
            }),
            prisma_1.default.lead.count(),
            prisma_1.default.listing.groupBy({
                by: ['categoryId'],
                _count: { id: true },
            }),
            prisma_1.default.listing.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { category: true, brand: true },
            }),
            prisma_1.default.lead.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: { listing: true, customer: true },
            }),
        ]);
        const monthsMap = {};
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const mName = monthNames[d.getMonth()] || '';
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            monthsMap[key] = { name: mName, partners: 0, listings: 0 };
        }
        recentUsersData.forEach(u => {
            const key = `${u.createdAt.getFullYear()}-${u.createdAt.getMonth()}`;
            if (monthsMap[key])
                monthsMap[key].partners += 1;
        });
        recentListingsData.forEach(l => {
            const key = `${l.createdAt.getFullYear()}-${l.createdAt.getMonth()}`;
            if (monthsMap[key])
                monthsMap[key].listings += 1;
        });
        const graphData = Object.values(monthsMap);
        const categoryIds = categoryStats.map((c) => c.categoryId);
        const categories = await prisma_1.default.category.findMany({
            where: { id: { in: categoryIds } },
        });
        const categoryBreakdown = categoryStats.map((stat) => {
            const cat = categories.find((c) => c.id === stat.categoryId);
            const rawName = cat ? cat.name : 'Unknown';
            const formattedName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            return {
                name: formattedName,
                value: stat._count.id,
            };
        });
        console.log("CATEGORY STATS:", categoryStats);
        console.log("CATEGORY BREAKDOWN:", categoryBreakdown);
        res.json({
            stats: {
                totalPartners,
                approvedPartners,
                pendingKyc,
                activeListings,
                totalEnquiries,
            },
            graphData,
            categoryBreakdown,
            recentApplications: recentPartners.map((partner) => ({
                id: partner.id,
                name: partner.partnerProfile?.businessName || partner.name || partner.email || 'Unnamed partner',
                email: partner.email,
                mobile: partner.mobile,
                partnerType: partner.partnerProfile?.partnerType || 'SHOWROOM',
                kycStatus: partner.partnerProfile?.kycStatus || 'NOT_STARTED',
                onboardingStatus: partner.partnerProfile?.onboardingStatus || 'ACCOUNT_CREATED',
                createdAt: partner.createdAt,
            })),
            recentListings: recentListingsRaw.map((listing) => ({
                id: listing.id,
                title: listing.title,
                price: listing.price,
                status: listing.status,
                categoryName: listing.category?.name || 'N/A',
                brandName: listing.brand?.name || 'N/A',
                createdAt: listing.createdAt,
            })),
            recentEnquiries: recentEnquiriesRaw.map((enquiry) => ({
                id: enquiry.id,
                enquiryType: enquiry.enquiryType,
                status: enquiry.status,
                listingTitle: enquiry.listing?.title || enquiry.listingTitleSnapshot || 'N/A',
                customerName: enquiry.customer?.name || enquiry.customer?.mobile || 'Unknown',
                createdAt: enquiry.createdAt,
            })),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getDashboardSummary = getDashboardSummary;
const getPlatformSettings = async (req, res, next) => {
    try {
        const [settings, defaultSuperAdminContact, recentPrimePayments] = await Promise.all([
            (0, appSettings_1.getAppSettings)(),
            getDefaultSuperAdminContact(),
            (0, customerPrimeSubscriptions_1.listCustomerPrimeSubscriptions)({ take: 10 }),
        ]);
        res.json({
            googleAuth: {
                enabled: !!settings.googleAuth.clientId,
                clientId: settings.googleAuth.clientId || '',
                updatedAt: settings.googleAuth.updatedAt,
                updatedByUserId: settings.googleAuth.updatedByUserId,
            },
            publicLeadRouting: {
                useSellerContact: settings.publicLeadRouting.useSellerContact,
                adminCallNumber: defaultSuperAdminContact.adminCallNumber || '',
                adminWhatsappNumber: defaultSuperAdminContact.adminWhatsappNumber || '',
                updatedAt: settings.publicLeadRouting.updatedAt,
                updatedByUserId: settings.publicLeadRouting.updatedByUserId,
            },
            customerPrime: {
                ...settings.customerPrime,
                recentPayments: recentPrimePayments,
            },
            financeSupport: {
                items: settings.financeSupport.items,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPlatformSettings = getPlatformSettings;
const updatePlatformSettings = async (req, res, next) => {
    try {
        const { googleClientId, publicLeadRouting, customerPrime } = req.body;
        if (googleClientId === undefined && !publicLeadRouting && !customerPrime) {
            return res.status(400).json({
                error: 'No platform setting changes were provided.',
            });
        }
        const settingsPayload = {
            updatedByUserId: req.user?.id || null,
        };
        if (googleClientId !== undefined) {
            settingsPayload.googleClientId = googleClientId;
        }
        if (publicLeadRouting) {
            settingsPayload.publicLeadRouting = {
                useSellerContact: publicLeadRouting.useSellerContact === true,
            };
        }
        if (customerPrime) {
            settingsPayload.customerPrime = {
                enabled: customerPrime.enabled === true,
                ...(customerPrime.upiId !== undefined ? { upiId: customerPrime.upiId } : {}),
                ...(customerPrime.amount !== undefined ? { amount: customerPrime.amount } : {}),
                ...(customerPrime.validityValue !== undefined ? { validityValue: customerPrime.validityValue } : {}),
                ...(customerPrime.validityUnit !== undefined
                    ? { validityUnit: (0, customerPrime_1.normalizePrimeValidityUnit)(customerPrime.validityUnit) }
                    : {}),
                applyToCustomerRoleOnly: true,
                requireForCall: true,
                requireForWhatsapp: true,
                requireForSellListing: true,
            };
        }
        const [settings, defaultSuperAdminContact, recentPrimePayments] = await Promise.all([
            (0, appSettings_1.updatePlatformRuntimeSettings)(settingsPayload),
            getDefaultSuperAdminContact(),
            (0, customerPrimeSubscriptions_1.listCustomerPrimeSubscriptions)({ take: 10 }),
        ]);
        res.json({
            message: 'Platform settings updated successfully.',
            googleAuth: {
                enabled: !!settings.googleAuth.clientId,
                clientId: settings.googleAuth.clientId || '',
                updatedAt: settings.googleAuth.updatedAt,
                updatedByUserId: settings.googleAuth.updatedByUserId,
            },
            publicLeadRouting: {
                useSellerContact: settings.publicLeadRouting.useSellerContact,
                adminCallNumber: defaultSuperAdminContact.adminCallNumber || '',
                adminWhatsappNumber: defaultSuperAdminContact.adminWhatsappNumber || '',
                updatedAt: settings.publicLeadRouting.updatedAt,
                updatedByUserId: settings.publicLeadRouting.updatedByUserId,
            },
            customerPrime: {
                ...settings.customerPrime,
                recentPayments: recentPrimePayments,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updatePlatformSettings = updatePlatformSettings;
const getCustomerPrimePayments = async (req, res, next) => {
    try {
        const requestedStatus = String(req.query.status || '').trim().toUpperCase();
        const status = requestedStatus && ['PENDING', 'ACTIVE', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(requestedStatus)
            ? requestedStatus
            : undefined;
        const subscriptions = await (0, customerPrimeSubscriptions_1.listCustomerPrimeSubscriptions)(status ? { status } : {});
        res.json({
            payments: subscriptions,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getCustomerPrimePayments = getCustomerPrimePayments;
const updateCustomerPrimePaymentStatus = async (req, res, next) => {
    try {
        const id = String(req.params.id || '');
        const { status, rejectionReason } = req.body;
        if (!id) {
            return res.status(400).json({ error: 'Payment request id is required.' });
        }
        if (!status || !['ACTIVE', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: 'Valid payment status is required.' });
        }
        const subscription = status === 'ACTIVE'
            ? await (0, customerPrimeSubscriptions_1.approveCustomerPrimeSubscription)({
                subscriptionId: id,
                approverUserId: req.user?.id || '',
            })
            : await (0, customerPrimeSubscriptions_1.rejectCustomerPrimeSubscription)({
                subscriptionId: id,
                approverUserId: req.user?.id || '',
                rejectionReason: rejectionReason || null,
            });
        await createPartnerNotification({
            userId: subscription.userId,
            title: status === 'ACTIVE' ? 'Prime Subscription Activated' : 'Prime Payment Rejected',
            message: status === 'ACTIVE'
                ? 'Your payment has been verified and your Prime customer subscription is now active.'
                : subscription.rejectionReason || 'Your Prime payment proof could not be verified.',
            type: status === 'ACTIVE' ? 'PRIME_SUBSCRIPTION_ACTIVE' : 'PRIME_SUBSCRIPTION_REJECTED',
            link: '/profile',
        });
        res.json({
            message: status === 'ACTIVE'
                ? 'Prime customer payment approved successfully.'
                : 'Prime customer payment rejected successfully.',
            payment: subscription,
        });
    }
    catch (error) {
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        }
        next(error);
    }
};
exports.updateCustomerPrimePaymentStatus = updateCustomerPrimePaymentStatus;
const getFinanceSupportContent = async (req, res, next) => {
    try {
        const settings = await (0, appSettings_1.getAppSettings)();
        res.json({
            items: settings.financeSupport.items,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getFinanceSupportContent = getFinanceSupportContent;
const updateFinanceSupportContent = async (req, res, next) => {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const invalidItem = items.find((item) => !item?.name?.trim() || !item?.imageUrl?.trim());
        if (invalidItem) {
            return res.status(400).json({ error: 'Each finance support item must include a name and image.' });
        }
        const settings = await (0, appSettings_1.updateFinanceSupportSettings)({
            items,
            updatedByUserId: req.user?.id || null,
        });
        res.json({
            message: 'Finance support items updated successfully.',
            items: settings.financeSupport.items,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateFinanceSupportContent = updateFinanceSupportContent;
const getHeroImageContent = async (req, res, next) => {
    try {
        const settings = await (0, appSettings_1.getAppSettings)();
        res.json({
            imageUrl: settings.heroImage.imageUrl,
            headline: settings.heroImage.headline,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getHeroImageContent = getHeroImageContent;
const getInspectionSectionContent = async (req, res, next) => {
    try {
        const settings = await (0, appSettings_1.getAppSettings)();
        res.json(settings.inspectionSection);
    }
    catch (error) {
        next(error);
    }
};
exports.getInspectionSectionContent = getInspectionSectionContent;
const updateHeroImageContent = async (req, res, next) => {
    try {
        const imageUrl = req.body?.imageUrl;
        const headline = req.body?.headline;
        const settings = await (0, appSettings_1.updateHeroImageSettings)({
            imageUrl,
            headline,
            updatedByUserId: req.user?.id || null,
        });
        res.json({
            message: 'Hero image updated successfully.',
            imageUrl: settings.heroImage.imageUrl,
            headline: settings.heroImage.headline,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateHeroImageContent = updateHeroImageContent;
const updateInspectionSectionContent = async (req, res, next) => {
    try {
        const title = req.body?.title;
        const description = req.body?.description;
        const imageUrl = req.body?.imageUrl;
        const settings = await (0, appSettings_1.updateInspectionSectionSettings)({
            title,
            description,
            imageUrl,
            updatedByUserId: req.user?.id || null,
        });
        res.json({
            message: 'Inspection section updated successfully.',
            ...settings.inspectionSection,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateInspectionSectionContent = updateInspectionSectionContent;
const getAdminUsers = async (req, res, next) => {
    try {
        const users = await prisma_1.default.user.findMany({
            where: {
                role: {
                    in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
                },
            },
            include: managedUserInclude,
            orderBy: [{ createdAt: 'desc' }],
        });
        res.json({
            users: users.map(mapManagedUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAdminUsers = getAdminUsers;
const getAdminPartners = async (req, res, next) => {
    try {
        const partners = await prisma_1.default.user.findMany({
            where: {
                role: 'PARTNER',
            },
            include: managedUserInclude,
            orderBy: [{ createdAt: 'desc' }],
        });
        res.json({
            partners: partners.filter(hasPartnerProfile).map(mapManagedUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAdminPartners = getAdminPartners;
const getCustomerVisitors = async (req, res, next) => {
    try {
        await (0, customerPrimeSubscriptions_1.syncExpiredCustomerPrimeSubscriptions)();
        const visitors = await prisma_1.default.user.findMany({
            where: {
                role: 'CUSTOMER',
                status: {
                    not: 'CLOSED',
                },
            },
            include: managedUserInclude,
            orderBy: [{ createdAt: 'desc' }],
        });
        res.json({
            visitors: visitors.map(mapManagedUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getCustomerVisitors = getCustomerVisitors;
const updateManagedUserAccount = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { name, email, mobile, city, state, title, permissions, customRoleId, } = req.body;
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
            include: managedUserInclude,
        });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const normalizedName = name?.trim();
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedMobile = mobile?.trim() || null;
        const normalizedCity = city?.trim() || null;
        const normalizedState = state?.trim() || null;
        if (!normalizedName || !normalizedEmail) {
            return res.status(400).json({ error: 'Name and email are required.' });
        }
        const duplicateUser = await prisma_1.default.user.findFirst({
            where: {
                id: { not: id },
                OR: [
                    { email: normalizedEmail },
                    ...(normalizedMobile ? [{ mobile: normalizedMobile }] : []),
                ],
            },
            select: { id: true },
        });
        if (duplicateUser) {
            return res.status(400).json({ error: 'Another user with the same email or mobile already exists.' });
        }
        await prisma_1.default.user.update({
            where: { id },
            data: {
                name: normalizedName,
                email: normalizedEmail,
                mobile: normalizedMobile,
                city: normalizedCity,
                state: normalizedState,
            },
        });
        if (targetUser.role === 'ADMIN' || targetUser.role === 'EMPLOYEE') {
            const normalizedCustomRoleId = typeof customRoleId === 'string' && customRoleId.trim() ? customRoleId.trim() : null;
            if (normalizedCustomRoleId) {
                const customRole = await prisma_1.default.customRole.findUnique({
                    where: { id: normalizedCustomRoleId },
                    select: { id: true },
                });
                if (!customRole) {
                    return res.status(400).json({ error: 'Selected employee role was not found.' });
                }
            }
            const normalizedPermissions = Array.isArray(permissions)
                ? permissions.filter((permission) => allowedAdminPermissions.has(permission))
                : [];
            await prisma_1.default.user.update({
                where: { id },
                data: {
                    customRoleId: targetUser.role === 'EMPLOYEE' ? normalizedCustomRoleId : null,
                },
            });
            await prismaAny.adminProfile.updateMany({
                where: { userId: id },
                data: {
                    title: title?.trim() || (targetUser.role === 'EMPLOYEE' ? 'Operations Employee' : 'Operations Admin'),
                },
            });
            await prisma_1.default.adminPermission.deleteMany({
                where: { adminUserId: id },
            });
            if (normalizedPermissions.length > 0) {
                await prisma_1.default.adminPermission.createMany({
                    data: normalizedPermissions.map((permission) => ({
                        adminUserId: id,
                        permission,
                    })),
                });
            }
        }
        if (targetUser.partnerProfile) {
            await prismaAny.partnerProfile.updateMany({
                where: { userId: id },
                data: {
                    ownerName: normalizedName,
                },
            });
        }
        const refreshedUser = await prisma_1.default.user.findUnique({
            where: { id },
            include: managedUserInclude,
        });
        res.json({
            message: 'User account updated successfully.',
            user: mapManagedUser(refreshedUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateManagedUserAccount = updateManagedUserAccount;
const resetManagedUserPassword = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { password } = req.body;
        if (!password || password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
            select: {
                id: true,
                role: true,
            },
        });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (targetUser.role === 'SUPER_ADMIN' && (await prisma_1.default.adminProfile.findUnique({ where: { userId: id } }))?.isRootAdmin) {
            return res.status(400).json({ error: 'Protected root super admin passwords cannot be reset here.' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        await prisma_1.default.user.update({
            where: { id },
            data: {
                password: hashedPassword,
            },
        });
        res.json({
            message: 'Password reset successfully.',
            id,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.resetManagedUserPassword = resetManagedUserPassword;
const deleteManagedUser = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
            include: {
                adminProfile: true,
                partnerProfile: {
                    select: { id: true },
                },
                _count: {
                    select: {
                        listings: true,
                        assignedLeads: true,
                        teamMemberships: true,
                    },
                },
            },
        });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (targetUser.adminProfile?.isRootAdmin) {
            return res.status(400).json({ error: 'Protected root super admin account cannot be deleted.' });
        }
        if (targetUser.role === 'CUSTOMER') {
            await prisma_1.default.user.update({
                where: { id },
                data: {
                    status: 'CLOSED',
                },
            });
            res.json({
                message: 'Visitor removed successfully.',
                id,
                archived: true,
            });
            return;
        }
        if (targetUser.partnerProfile) {
            if (targetUser._count?.listings > 0 ||
                targetUser._count?.assignedLeads > 0 ||
                targetUser._count?.teamMemberships > 0) {
                return res.status(400).json({
                    error: 'This partner cannot be deleted because linked listings, leads, or team records already exist. Mark the account inactive or blocked instead.',
                });
            }
            const partnerProfileId = targetUser.partnerProfile.id;
            await prisma_1.default.$transaction([
                prisma_1.default.adminPermission.deleteMany({ where: { adminUserId: id } }),
                prismaAny.partnerAgreement.deleteMany({ where: { partnerProfileId } }),
                prismaAny.partnerDeposit.deleteMany({ where: { partnerProfileId } }),
                prismaAny.kycReviewLog.deleteMany({ where: { partnerProfileId } }),
                prismaAny.kycDocument.deleteMany({ where: { partnerProfileId } }),
                prismaAny.partnerProfile.delete({ where: { userId: id } }),
                prisma_1.default.user.delete({ where: { id } }),
            ]);
        }
        else {
            await prisma_1.default.$transaction([
                prisma_1.default.adminPermission.deleteMany({ where: { adminUserId: id } }),
                prismaAny.adminProfile.deleteMany({ where: { userId: id } }),
                prisma_1.default.user.delete({ where: { id } }),
            ]);
        }
        res.json({
            message: 'User deleted successfully.',
            id,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteManagedUser = deleteManagedUser;
const createManagedUser = async (req, res, next) => {
    try {
        const { name, email, mobile, password, role, title, permissions, customRoleId, businessName, partnerType, } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ error: 'Name, email, password, and role are required.' });
        }
        if (role !== 'EMPLOYEE') {
            return res.status(400).json({ error: 'Only employee accounts can be created here.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }
        const existingUser = await prisma_1.default.user.findFirst({
            where: {
                OR: [
                    { email },
                    ...(mobile ? [{ mobile }] : []),
                ],
            },
        });
        if (existingUser) {
            return res.status(400).json({ error: 'A user with the same email or mobile already exists.' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const normalizedCustomRoleId = typeof customRoleId === 'string' && customRoleId.trim() ? customRoleId.trim() : null;
        if (normalizedCustomRoleId) {
            const customRole = await prisma_1.default.customRole.findUnique({
                where: { id: normalizedCustomRoleId },
                select: { id: true },
            });
            if (!customRole) {
                return res.status(400).json({ error: 'Selected employee role was not found.' });
            }
        }
        const normalizedPermissions = Array.isArray(permissions)
            ? permissions.filter((permission) => allowedAdminPermissions.has(permission))
            : [];
        const createdUser = await prisma_1.default.user.create({
            data: {
                name,
                email,
                mobile: mobile || undefined,
                password: hashedPassword,
                role,
                customRoleId: role === 'EMPLOYEE' ? normalizedCustomRoleId : null,
                status: 'ACTIVE',
                authProvider: 'LOCAL',
                createdById: req.user?.id,
                adminProfile: {
                    create: {
                        title: title || 'Operations Employee',
                        isRootAdmin: false,
                    },
                },
                adminPermissions: normalizedPermissions.length > 0
                    ? {
                        create: normalizedPermissions.map((permission) => ({ permission })),
                    }
                    : undefined,
            },
            include: managedUserInclude,
        });
        res.status(201).json({
            message: 'Employee created successfully.',
            user: mapManagedUser(createdUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createManagedUser = createManagedUser;
const createPartnerUser = async (req, res, next) => {
    try {
        const { name, email, mobile, password, businessName, partnerType, } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        }
        const existingUser = await prisma_1.default.user.findFirst({
            where: {
                OR: [
                    { email: email.trim().toLowerCase() },
                    ...(mobile ? [{ mobile: mobile.trim() }] : []),
                ],
            },
        });
        if (existingUser) {
            return res.status(400).json({ error: 'A user with the same email or mobile already exists.' });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedMobile = mobile?.trim() || null;
        const normalizedBusinessName = businessName?.trim() || normalizedName;
        const createdUser = await prisma_1.default.user.create({
            data: {
                name: normalizedName,
                email: normalizedEmail,
                mobile: normalizedMobile || undefined,
                password: hashedPassword,
                role: 'PARTNER',
                status: 'ACTIVE',
                authProvider: 'LOCAL',
                createdById: req.user?.id,
            },
            include: {
                partnerProfile: true,
            },
        });
        await (0, auth_controller_1.ensurePartnerProfileForUser)(createdUser);
        if (normalizedBusinessName || partnerType) {
            await prismaAny.partnerProfile.updateMany({
                where: { userId: createdUser.id },
                data: {
                    ownerName: normalizedName,
                    businessName: normalizedBusinessName,
                    partnerType: partnerType && allowedPartnerTypes.has(partnerType) ? partnerType : undefined,
                },
            });
        }
        const refreshedUser = await prisma_1.default.user.findUnique({
            where: { id: createdUser.id },
            include: managedUserInclude,
        });
        res.status(201).json({
            message: 'Partner created successfully.',
            user: mapManagedUser(refreshedUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createPartnerUser = createPartnerUser;
const getPendingVerifications = async (req, res, next) => {
    try {
        const pendingPartners = await prisma_1.default.user.findMany({
            where: {
                partnerProfile: {
                    is: {
                        kycStatus: {
                            in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
                        },
                    },
                },
            },
            include: managedUserInclude,
            orderBy: { createdAt: 'desc' },
        });
        res.json({
            verifications: pendingPartners.map((partner) => ({
                id: partner.id,
                name: partner.partnerProfile?.businessName || partner.name || partner.email || 'Unnamed partner',
                email: partner.email,
                partnerType: partner.partnerProfile?.partnerType || 'SHOWROOM',
                appliedOn: partner.createdAt,
                status: partner.partnerProfile?.kycStatus || 'NOT_STARTED',
            })),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPendingVerifications = getPendingVerifications;
const getVerificationDetail = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const partner = await prisma_1.default.user.findUnique({
            where: { id },
            include: verificationDetailInclude,
        });
        if (!partner || !partner.partnerProfile) {
            return res.status(404).json({ error: 'Partner verification record not found.' });
        }
        const partnerProfile = partner.partnerProfile;
        res.json({
            verification: {
                id: partner.id,
                ownerName: partner.name,
                email: partner.email,
                mobile: partner.mobile,
                whatsappNumber: partner.whatsappNumber,
                city: partner.city,
                state: partner.state,
                profile: {
                    ownerName: partnerProfile.ownerName,
                    businessName: partnerProfile.businessName,
                    partnerType: partnerProfile.partnerType,
                    businessAddress: partnerProfile.businessAddress,
                    district: partnerProfile.district,
                    pinCode: partnerProfile.pinCode,
                    businessExperience: partnerProfile.businessExperience,
                    expectedMonthlyListings: partnerProfile.expectedMonthlyListings,
                    businessDescription: partnerProfile.businessDescription,
                    serviceAreas: partnerProfile.serviceAreas,
                    workingHours: partnerProfile.workingHours,
                    gstNumber: partnerProfile.gstNumber,
                    businessRegistrationNumber: partnerProfile.businessRegistrationNumber,
                    websiteUrl: partnerProfile.websiteUrl,
                    socialLinks: partnerProfile.socialLinks,
                    yearsInBusiness: partnerProfile.yearsInBusiness,
                    teamSize: partnerProfile.teamSize,
                    contactPreference: partnerProfile.contactPreference,
                    googleMapsLocation: partnerProfile.googleMapsLocation,
                    onboardingStatus: partnerProfile.onboardingStatus,
                    kycStatus: partnerProfile.kycStatus,
                    accountStatus: partnerProfile.accountStatus,
                    approvedAt: partnerProfile.approvedAt,
                },
                documents: (partnerProfile.kycDocuments || []).map((document) => ({
                    id: document.id,
                    documentType: document.documentType,
                    fileUrl: document.fileUrl,
                    fileName: document.fileName,
                    documentNumber: document.documentNumber,
                    nameOnDocument: document.nameOnDocument,
                    issueDate: document.issueDate,
                    expiryDate: document.expiryDate,
                    submittedNote: document.submittedNote,
                    status: document.status,
                    reviewComment: document.reviewComment,
                })),
                agreements: (partnerProfile.agreements || []).map((agreement) => ({
                    agreementType: agreement.agreementType,
                    version: agreement.version,
                    acceptedAt: agreement.acceptedAt,
                })),
                reviewHistory: (partnerProfile.kycReviews || []).map((review) => ({
                    id: review.id,
                    action: review.action,
                    comment: review.comment,
                    createdAt: review.createdAt,
                })),
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getVerificationDetail = getVerificationDetail;
const getAdminListings = async (req, res, next) => {
    try {
        const partnerId = req.query.partnerId ? String(req.query.partnerId) : undefined;
        const listings = await prisma_1.default.listing.findMany({
            ...(partnerId ? { where: { partnerId } } : {}),
            include: {
                partner: {
                    include: {
                        partnerProfile: {
                            select: {
                                businessName: true,
                            },
                        },
                    },
                },
                media: {
                    select: {
                        id: true,
                        url: true,
                        isFeatured: true,
                        type: true,
                    },
                    orderBy: [
                        { isFeatured: 'desc' },
                        { createdAt: 'asc' },
                    ],
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.json({
            // Prisma's inferred relation type for this query is too narrow here, so we normalize it locally.
            // This keeps the API payload strongly shaped without leaking `any` into the response contract.
            listings: listings.map((listing) => {
                const listingImages = (listing.media || []).filter((media) => media.type === 'IMAGE');
                return {
                    id: listing.id,
                    title: listing.title,
                    dealer: listing.partner?.partnerProfile?.businessName ||
                        listing.partner?.name ||
                        listing.partner?.email ||
                        'Unknown partner',
                    price: Number(listing.price),
                    status: listing.status,
                    createdAt: listing.createdAt,
                    imageUrl: listingImages[0]?.url || null,
                    images: listingImages.map((image) => ({
                        id: image.id,
                        url: image.url,
                        isFeatured: image.isFeatured,
                    })),
                };
            }),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAdminListings = getAdminListings;
const updateVerificationStatus = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { status } = req.body;
        if (!status || !allowedVerificationStatuses.has(status)) {
            return res.status(400).json({ error: 'Invalid verification status.' });
        }
        const existingPartner = await prisma_1.default.user.findUnique({
            where: { id },
            include: {
                partnerProfile: true,
            },
        });
        if (!existingPartner || !existingPartner.partnerProfile) {
            return res.status(404).json({ error: 'Partner verification record not found.' });
        }
        const existingProfile = existingPartner.partnerProfile;
        const profile = await prisma_1.default.$transaction(async (tx) => {
            const txAny = tx;
            if (status === 'APPROVED' && existingPartner.role !== 'PARTNER') {
                await tx.user.update({
                    where: { id },
                    data: { role: 'PARTNER' },
                });
            }
            return txAny.partnerProfile.update({
                where: { userId: id },
                data: {
                    kycStatus: status,
                    onboardingStatus: status === 'APPROVED'
                        ? 'APPROVED'
                        : status === 'CHANGES_REQUESTED'
                            ? 'CHANGES_REQUESTED'
                            : status === 'REJECTED'
                                ? 'REJECTED'
                                : 'REVIEW_PENDING',
                    accountStatus: status === 'APPROVED' ? 'ACTIVE' : 'PENDING',
                    approvedById: status === 'APPROVED' ? req.user?.id : null,
                    approvedAt: status === 'APPROVED' ? new Date() : null,
                },
            });
        });
        await prismaAny.kycReviewLog.create({
            data: {
                partnerProfileId: profile.id,
                action: `SUPER_ADMIN_${status}`,
                actorUserId: req.user?.id,
                comment: `Verification moved to ${status}`,
            },
        });
        await createPartnerNotification({
            userId: id,
            title: 'KYC Status Updated',
            message: `Super admin updated your KYC status to ${status.replaceAll('_', ' ')}.`,
            type: 'KYC_UPDATE',
            link: '/partner/kyc',
        });
        res.json({
            message: 'Verification status updated successfully.',
            profile,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateVerificationStatus = updateVerificationStatus;
const updateAdminListingStatus = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { status } = req.body;
        if (!status || !allowedListingStatuses.has(status)) {
            return res.status(400).json({ error: 'Invalid listing status.' });
        }
        const listing = await prisma_1.default.listing.update({
            where: { id },
            data: { status },
            include: {
                partner: {
                    select: { id: true }
                }
            }
        });
        if (listing.partner?.id) {
            await prisma_1.default.notification.create({
                data: {
                    userId: listing.partner.id,
                    title: 'Listing Status Updated',
                    message: `Your listing "${listing.title}" status is now ${status}.`,
                    type: 'LISTING_UPDATE',
                    link: '/partner/listings',
                },
            });
        }
        res.json({
            message: 'Listing status updated successfully.',
            listing,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateAdminListingStatus = updateAdminListingStatus;
const updateAdminUserStatus = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { status } = req.body;
        if (!status || !['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid user status.' });
        }
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
            select: {
                role: true,
                partnerProfile: {
                    select: {
                        accountStatus: true,
                        onboardingStatus: true,
                        kycStatus: true,
                    },
                },
            },
        });
        if (!targetUser) {
            return res.status(404).json({ error: 'User not found.' });
        }
        if (targetUser.role === 'SUPER_ADMIN') {
            return res.status(400).json({ error: 'Super admin status cannot be changed from this screen.' });
        }
        await prisma_1.default.user.update({
            where: { id },
            data: { status: status },
        });
        if (targetUser.partnerProfile) {
            await prismaAny.partnerProfile.update({
                where: { userId: id },
                data: {
                    accountStatus: mapPartnerAccountStatus({
                        status,
                        currentAccountStatus: targetUser.partnerProfile?.accountStatus,
                        onboardingStatus: targetUser.partnerProfile?.onboardingStatus,
                        kycStatus: targetUser.partnerProfile?.kycStatus,
                    }),
                },
            });
            await createPartnerNotification({
                userId: id,
                title: 'Account Status Updated',
                message: `Super admin changed your account status to ${status}.`,
                type: 'ACCOUNT_UPDATE',
                link: '/partner/kyc',
            });
        }
        const refreshedUser = await prisma_1.default.user.findUnique({
            where: { id },
            include: managedUserInclude,
        });
        res.json({
            message: 'User status updated successfully.',
            user: mapManagedUser(refreshedUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateAdminUserStatus = updateAdminUserStatus;
const updatePartnerUser = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { name, email, mobile, businessName, partnerType, } = req.body;
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
            include: managedUserInclude,
        });
        if (!targetUser || !hasPartnerProfile(targetUser)) {
            return res.status(404).json({ error: 'Partner not found.' });
        }
        const partnerProfile = targetUser.partnerProfile || (await (0, auth_controller_1.ensurePartnerProfileForUser)(targetUser));
        const normalizedName = name?.trim();
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedMobile = mobile?.trim();
        const normalizedBusinessName = businessName?.trim();
        const normalizedPartnerType = partnerType && allowedPartnerTypes.has(partnerType) ? partnerType : null;
        if (!normalizedName || !normalizedEmail) {
            return res.status(400).json({ error: 'Name and email are required.' });
        }
        const duplicateUser = await prisma_1.default.user.findFirst({
            where: {
                id: { not: id },
                OR: [
                    { email: normalizedEmail },
                    ...(normalizedMobile ? [{ mobile: normalizedMobile }] : []),
                ],
            },
            select: { id: true },
        });
        if (duplicateUser) {
            return res.status(400).json({ error: 'Another user with the same email or mobile already exists.' });
        }
        await prisma_1.default.user.update({
            where: { id },
            data: {
                name: normalizedName,
                email: normalizedEmail,
                mobile: normalizedMobile || null,
            },
        });
        await prismaAny.partnerProfile.update({
            where: { userId: id },
            data: {
                ownerName: normalizedName,
                businessName: normalizedBusinessName || normalizedName,
                partnerType: normalizedPartnerType || partnerProfile?.partnerType || 'SHOWROOM',
            },
        });
        const refreshedUser = await prisma_1.default.user.findUnique({
            where: { id },
            include: managedUserInclude,
        });
        res.json({
            message: 'Partner updated successfully.',
            user: mapManagedUser(refreshedUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updatePartnerUser = updatePartnerUser;
const deletePartnerUser = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const targetUser = await prisma_1.default.user.findUnique({
            where: { id },
            include: {
                partnerProfile: {
                    select: { id: true },
                },
                _count: {
                    select: {
                        listings: true,
                        assignedLeads: true,
                        teamMemberships: true,
                    },
                },
            },
        });
        if (!targetUser || !targetUser.partnerProfile) {
            return res.status(404).json({ error: 'Partner not found.' });
        }
        if (targetUser._count?.listings > 0 || targetUser._count?.assignedLeads > 0 || targetUser._count?.teamMemberships > 0) {
            return res.status(400).json({
                error: 'This partner cannot be deleted because linked listings, leads, or team records already exist. Mark the account inactive or blocked instead.',
            });
        }
        const partnerProfileId = targetUser.partnerProfile.id;
        await prisma_1.default.$transaction([
            prismaAny.partnerAgreement.deleteMany({ where: { partnerProfileId } }),
            prismaAny.partnerDeposit.deleteMany({ where: { partnerProfileId } }),
            prismaAny.kycReviewLog.deleteMany({ where: { partnerProfileId } }),
            prismaAny.kycDocument.deleteMany({ where: { partnerProfileId } }),
            prismaAny.partnerProfile.delete({ where: { userId: id } }),
            prisma_1.default.user.delete({ where: { id } }),
        ]);
        res.json({
            message: 'Partner deleted successfully.',
            id,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.deletePartnerUser = deletePartnerUser;
const getAdminPartnerOnboarding = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const partnerUser = await (0, auth_controller_1.getPartnerOnboardingContext)(id);
        if (!partnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found.' });
        }
        const authUser = await (0, auth_controller_1.buildAuthUserPayload)(partnerUser);
        res.json({
            user: authUser,
            ...(0, auth_controller_1.buildOnboardingResponse)(partnerUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getAdminPartnerOnboarding = getAdminPartnerOnboarding;
const saveAdminPartnerOnboarding = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { profile, kycDocuments = [], agreements = [], actionName, actionComment, } = req.body;
        if (!profile) {
            return res.status(400).json({ error: 'Profile section is required.' });
        }
        const existingPartner = await (0, auth_controller_1.getPartnerOnboardingContext)(id);
        if (!existingPartner) {
            return res.status(404).json({ error: 'Partner onboarding record not found.' });
        }
        await (0, auth_controller_1.saveOnboardingData)({
            userId: id,
            userEmail: existingPartner.email,
            profile,
            kycDocuments,
            agreementTypes: agreements,
            submitForReview: false,
            preserveApprovalState: true,
            actionName: actionName || 'SUPER_ADMIN_SAVED_ONBOARDING_CHANGES',
            actionComment: actionComment || 'Super admin updated partner onboarding details.',
        });
        const refreshedPartnerUser = await (0, auth_controller_1.getPartnerOnboardingContext)(id);
        if (!refreshedPartnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found after save.' });
        }
        const authUser = await (0, auth_controller_1.buildAuthUserPayload)(refreshedPartnerUser);
        await createPartnerNotification({
            userId: id,
            title: 'Onboarding Updated',
            message: 'Super admin updated your onboarding details.',
            type: 'ONBOARDING_UPDATE',
            link: '/partner/kyc',
        });
        res.json({
            message: 'Partner onboarding updated successfully.',
            user: authUser,
            onboarding: (0, auth_controller_1.buildOnboardingResponse)(refreshedPartnerUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.saveAdminPartnerOnboarding = saveAdminPartnerOnboarding;
const submitAdminPartnerOnboarding = async (req, res, next) => {
    try {
        const id = String(req.params.id);
        const { profile, kycDocuments = [], agreements = [], actionComment, } = req.body;
        if (!profile) {
            return res.status(400).json({ error: 'Profile section is required.' });
        }
        const existingPartner = await (0, auth_controller_1.getPartnerOnboardingContext)(id);
        if (!existingPartner) {
            return res.status(404).json({ error: 'Partner onboarding record not found.' });
        }
        await (0, auth_controller_1.saveOnboardingData)({
            userId: id,
            userEmail: existingPartner.email,
            profile,
            kycDocuments,
            agreementTypes: agreements,
            submitForReview: true,
            actionName: 'SUPER_ADMIN_RESUBMITTED_ONBOARDING',
            actionComment: actionComment || 'Super admin resubmitted the onboarding package for review.',
        });
        const refreshedPartnerUser = await (0, auth_controller_1.getPartnerOnboardingContext)(id);
        if (!refreshedPartnerUser) {
            return res.status(404).json({ error: 'Partner onboarding record not found after submit.' });
        }
        const authUser = await (0, auth_controller_1.buildAuthUserPayload)(refreshedPartnerUser);
        await createPartnerNotification({
            userId: id,
            title: 'Onboarding Resubmitted',
            message: 'Super admin resubmitted your onboarding package for review.',
            type: 'ONBOARDING_RESUBMITTED',
            link: '/partner/kyc',
        });
        res.json({
            message: 'Partner onboarding submitted for review successfully.',
            user: authUser,
            onboarding: (0, auth_controller_1.buildOnboardingResponse)(refreshedPartnerUser),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.submitAdminPartnerOnboarding = submitAdminPartnerOnboarding;
const getModuleBadges = async (req, res, next) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [enquiriesCount, verificationsCount, visitorsCount, recurrenceCount] = await Promise.all([
            prisma_1.default.lead.count({
                where: { status: 'NEW' },
            }),
            prisma_1.default.user.count({
                where: {
                    partnerProfile: {
                        is: {
                            kycStatus: {
                                in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
                            },
                        },
                    },
                },
            }),
            prisma_1.default.user.count({
                where: {
                    role: 'CUSTOMER',
                    createdAt: {
                        gte: today,
                    },
                },
            }),
            prisma_1.default.customerPrimeSubscription.count({
                where: { status: 'PENDING' },
            }),
        ]);
        res.json({
            badges: {
                enquiries: enquiriesCount,
                verifications: verificationsCount,
                visitors: visitorsCount,
                recurrence: recurrenceCount,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getModuleBadges = getModuleBadges;
//# sourceMappingURL=admin.controller.js.map