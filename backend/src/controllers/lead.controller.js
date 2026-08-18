"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyLeadBadges = exports.updateLeadStatus = exports.getMyLeads = exports.createPublicContactLead = exports.createLead = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const appSettings_1 = require("../utils/appSettings");
const prismaAny = prisma_1.default;
const LEAD_STATUSES = [
    'NEW',
    'CONTACTED',
    'INTERESTED',
    'INSPECTION_SCHEDULED',
    'WON',
    'LOST',
];
const leadRelatedUserSelect = {
    id: true,
    name: true,
    mobile: true,
    email: true,
    city: true,
    state: true,
    role: true,
    whatsappNumber: true,
    partnerProfile: {
        select: {
            businessName: true,
            partnerType: true,
        },
    },
};
const leadRelatedListingSelect = {
    id: true,
    title: true,
    status: true,
    price: true,
    locationCity: true,
    locationState: true,
    partner: {
        select: leadRelatedUserSelect,
    },
};
const canEmployeeManageEnquiries = async (userId) => {
    const employee = await prismaAny.user.findUnique({
        where: { id: userId },
        select: {
            customRole: {
                select: {
                    permissions: true,
                },
            },
            adminPermissions: {
                select: {
                    permission: true,
                },
            },
        },
    });
    const permissions = Array.isArray(employee?.customRole?.permissions)
        ? employee.customRole.permissions
        : (employee?.adminPermissions || []).map((item) => item.permission);
    return permissions.includes('ALL_ACCESS') || permissions.includes('enquiries.manage');
};
const formatLead = (lead) => ({
    id: lead.id,
    enquiryType: lead.enquiryType,
    message: lead.message || '',
    status: lead.status,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    customer: {
        id: lead.customer?.id || '',
        name: lead.customer?.name || lead.customer?.mobile || lead.customer?.email || 'Customer',
        mobile: lead.customer?.mobile || '',
        email: lead.customer?.email || '',
        city: lead.customer?.city || '',
        state: lead.customer?.state || '',
    },
    listing: {
        id: lead.listing?.id || '',
        title: lead.listing?.title || lead.listingTitleSnapshot || 'Listing removed',
        status: lead.listing?.status || lead.listingStatusSnapshot || '',
        price: Number(lead.listing?.price ?? lead.listingPriceSnapshot ?? 0),
        locationCity: lead.listing?.locationCity || lead.listingLocationCitySnapshot || '',
        locationState: lead.listing?.locationState || lead.listingLocationStateSnapshot || '',
    },
    routing: {
        mode: lead.dealer?.role === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'SELLER',
    },
    recipient: {
        id: lead.dealer?.id || '',
        name: lead.dealer?.partnerProfile?.businessName ||
            lead.dealer?.name ||
            lead.dealer?.mobile ||
            lead.dealer?.email ||
            'Recipient',
        mobile: lead.dealer?.mobile || '',
        email: lead.dealer?.email || '',
        whatsappNumber: lead.dealer?.whatsappNumber || '',
        role: lead.dealer?.role || '',
        partnerType: lead.dealer?.partnerProfile?.partnerType || null,
    },
    listingOwner: lead.dealer?.role === 'SUPER_ADMIN'
        ? null
        : {
            id: lead.listing?.partner?.id || lead.dealer?.id || '',
            name: lead.listing?.partner?.partnerProfile?.businessName ||
                lead.listing?.partner?.name ||
                lead.dealer?.partnerProfile?.businessName ||
                lead.dealer?.name ||
                'Listing Seller',
            mobile: lead.listing?.partner?.mobile || lead.dealer?.mobile || '',
            whatsappNumber: lead.listing?.partner?.whatsappNumber || lead.dealer?.whatsappNumber || '',
            partnerType: lead.listing?.partner?.partnerProfile?.partnerType ||
                lead.dealer?.partnerProfile?.partnerType ||
                null,
        },
});
const buildLeadSummary = (leads) => {
    const summary = {
        total: leads.length,
        new: 0,
        contacted: 0,
        interested: 0,
        inspectionScheduled: 0,
        won: 0,
        lost: 0,
    };
    for (const lead of leads) {
        if (lead.status === 'NEW') {
            summary.new += 1;
        }
        if (lead.status === 'CONTACTED') {
            summary.contacted += 1;
        }
        if (lead.status === 'INTERESTED') {
            summary.interested += 1;
        }
        if (lead.status === 'INSPECTION_SCHEDULED') {
            summary.inspectionScheduled += 1;
        }
        if (lead.status === 'WON') {
            summary.won += 1;
        }
        if (lead.status === 'LOST') {
            summary.lost += 1;
        }
    }
    return {
        ...summary,
        active: summary.new + summary.contacted + summary.interested + summary.inspectionScheduled,
        conversionRate: summary.total > 0 ? Number(((summary.won / summary.total) * 100).toFixed(1)) : 0,
    };
};
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
const resolvePublicLeadRecipient = async (partnerProfile) => {
    const [settings, superAdminUser] = await Promise.all([
        (0, appSettings_1.getAppSettings)(),
        prisma_1.default.user.findFirst({
            where: {
                role: 'SUPER_ADMIN',
            },
            select: {
                id: true,
                name: true,
                mobile: true,
                whatsappNumber: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        }),
    ]);
    const normalizedSellerCallNumber = normalizePhoneNumber(partnerProfile.user.mobile) || normalizePhoneNumber(partnerProfile.alternateMobile);
    const normalizedSellerWhatsappNumber = normalizePhoneNumber(partnerProfile.user.whatsappNumber) || normalizedSellerCallNumber;
    const sellerCanReceivePublicLead = Boolean(normalizedSellerCallNumber || normalizedSellerWhatsappNumber);
    const useSellerContact = settings.publicLeadRouting.useSellerContact === true;
    if (useSellerContact && sellerCanReceivePublicLead) {
        return {
            recipientUserId: partnerProfile.user.id,
            routingMode: 'SELLER',
            fallbackApplied: false,
        };
    }
    if (superAdminUser?.id) {
        return {
            recipientUserId: superAdminUser.id,
            routingMode: 'SUPER_ADMIN',
            fallbackApplied: useSellerContact && !sellerCanReceivePublicLead,
        };
    }
    return {
        recipientUserId: partnerProfile.user.id,
        routingMode: 'SELLER',
        fallbackApplied: false,
    };
};
const createLead = async (req, res, next) => {
    try {
        const partnerProfileId = String(req.body?.partnerProfileId || '').trim();
        const firstName = String(req.body?.firstName || '').trim();
        const surname = String(req.body?.surname || '').trim();
        const mobileNo = String(req.body?.mobileNo || '').trim();
        const city = String(req.body?.city || '').trim();
        const message = String(req.body?.message || '').trim();
        if (!partnerProfileId) {
            return res.status(400).json({ error: 'Partner is required.' });
        }
        if (!firstName) {
            return res.status(400).json({ error: 'First name is required.' });
        }
        if (!mobileNo) {
            return res.status(400).json({ error: 'Mobile number is required.' });
        }
        if (!city) {
            return res.status(400).json({ error: 'City is required.' });
        }
        const normalizedMobile = mobileNo.replace(/\D/g, '');
        if (normalizedMobile.length < 10) {
            return res.status(400).json({ error: 'Enter a valid mobile number.' });
        }
        const partnerProfile = await prismaAny.partnerProfile.findUnique({
            where: { id: partnerProfileId },
            select: {
                id: true,
                businessName: true,
                onboardingStatus: true,
                accountStatus: true,
                kycStatus: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        mobile: true,
                        whatsappNumber: true,
                    },
                },
                alternateMobile: true,
            },
        });
        if (!partnerProfile ||
            partnerProfile.onboardingStatus !== 'APPROVED' ||
            partnerProfile.accountStatus !== 'ACTIVE' ||
            partnerProfile.kycStatus !== 'APPROVED' ||
            !partnerProfile.user?.id) {
            return res.status(404).json({ error: 'Approved partner not found.' });
        }
        const listing = await prismaAny.listing.findFirst({
            where: {
                partnerId: partnerProfile.user.id,
                status: {
                    in: ['PUBLISHED', 'RESERVED', 'PAUSED', 'DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'],
                },
            },
            orderBy: [
                {
                    status: 'asc',
                },
                {
                    createdAt: 'desc',
                },
            ],
            select: {
                id: true,
                title: true,
                status: true,
                price: true,
                locationCity: true,
                locationState: true,
            },
        });
        if (!listing) {
            return res.status(400).json({
                error: 'This approved partner does not have any listing to attach the enquiry to yet.',
            });
        }
        const leadRecipient = await resolvePublicLeadRecipient(partnerProfile);
        const fullName = [firstName, surname].filter(Boolean).join(' ').trim();
        const customer = await prismaAny.user.upsert({
            where: { mobile: normalizedMobile },
            update: {
                name: fullName || undefined,
                city,
                role: 'CUSTOMER',
                status: 'ACTIVE',
            },
            create: {
                name: fullName || firstName,
                mobile: normalizedMobile,
                city,
                role: 'CUSTOMER',
                status: 'ACTIVE',
            },
            select: {
                id: true,
            },
        });
        const lead = await prismaAny.lead.create({
            data: {
                listingId: listing.id,
                customerId: customer.id,
                dealerId: leadRecipient.recipientUserId,
                enquiryType: 'DEALER_CALLBACK',
                listingTitleSnapshot: listing.title,
                listingStatusSnapshot: listing.status,
                listingPriceSnapshot: listing.price,
                listingLocationCitySnapshot: listing.locationCity,
                listingLocationStateSnapshot: listing.locationState,
                message: message ||
                    `Dealer callback request for ${partnerProfile.businessName || partnerProfile.user.name || 'approved partner'} from ${fullName || firstName}.`,
            },
            include: {
                customer: {
                    select: leadRelatedUserSelect,
                },
                listing: {
                    select: leadRelatedListingSelect,
                },
                dealer: {
                    select: leadRelatedUserSelect,
                },
            },
        });
        return res.status(201).json({
            message: 'Callback request submitted successfully.',
            lead: formatLead(lead),
            routing: {
                mode: leadRecipient.routingMode,
                fallbackApplied: leadRecipient.fallbackApplied,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createLead = createLead;
const createPublicContactLead = async (req, res, next) => {
    try {
        if (!req.user?.id || req.user.role !== 'CUSTOMER') {
            return res.status(403).json({ error: 'Customer access required.' });
        }
        const listingId = String(req.body?.listingId || '').trim();
        const partnerProfileId = String(req.body?.partnerProfileId || '').trim();
        const enquiryType = String(req.body?.enquiryType || '').trim().toUpperCase();
        if (!['CALL', 'WHATSAPP'].includes(enquiryType)) {
            return res.status(400).json({ error: 'Invalid enquiry type.' });
        }
        if (!listingId && !partnerProfileId) {
            return res.status(400).json({ error: 'Listing or partner is required.' });
        }
        const customer = await prismaAny.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                name: true,
                mobile: true,
                email: true,
                city: true,
                state: true,
                role: true,
            },
        });
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found.' });
        }
        if (customer.role !== 'CUSTOMER') {
            return res.status(403).json({ error: 'Only customer accounts can create enquiries.' });
        }
        let listing = null;
        if (listingId) {
            listing = await prismaAny.listing.findUnique({
                where: { id: listingId },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    price: true,
                    locationCity: true,
                    locationState: true,
                    partnerId: true,
                    partner: {
                        select: {
                            id: true,
                            name: true,
                            mobile: true,
                            whatsappNumber: true,
                            partnerProfile: {
                                select: {
                                    id: true,
                                    businessName: true,
                                    onboardingStatus: true,
                                    accountStatus: true,
                                    kycStatus: true,
                                    alternateMobile: true,
                                },
                            },
                        },
                    },
                },
            });
        }
        else {
            const partnerProfile = await prismaAny.partnerProfile.findUnique({
                where: { id: partnerProfileId },
                select: {
                    id: true,
                    businessName: true,
                    onboardingStatus: true,
                    accountStatus: true,
                    kycStatus: true,
                    alternateMobile: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            mobile: true,
                            whatsappNumber: true,
                        },
                    },
                },
            });
            if (!partnerProfile?.user?.id) {
                return res.status(404).json({ error: 'Approved partner not found.' });
            }
            listing = await prismaAny.listing.findFirst({
                where: {
                    partnerId: partnerProfile.user.id,
                    status: {
                        in: ['PUBLISHED', 'RESERVED', 'PAUSED', 'DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED'],
                    },
                },
                orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
                select: {
                    id: true,
                    title: true,
                    status: true,
                    price: true,
                    locationCity: true,
                    locationState: true,
                    partnerId: true,
                    partner: {
                        select: {
                            id: true,
                            name: true,
                            mobile: true,
                            whatsappNumber: true,
                            partnerProfile: {
                                select: {
                                    id: true,
                                    businessName: true,
                                    onboardingStatus: true,
                                    accountStatus: true,
                                    kycStatus: true,
                                    alternateMobile: true,
                                },
                            },
                        },
                    },
                },
            });
        }
        if (!listing?.partner?.id ||
            listing.partner.partnerProfile?.onboardingStatus !== 'APPROVED' ||
            listing.partner.partnerProfile?.accountStatus !== 'ACTIVE' ||
            listing.partner.partnerProfile?.kycStatus !== 'APPROVED') {
            return res.status(404).json({ error: 'Approved partner listing not found.' });
        }
        const leadRecipient = await resolvePublicLeadRecipient({
            alternateMobile: listing.partner.partnerProfile?.alternateMobile || null,
            user: {
                id: listing.partner.id,
                name: listing.partner.name,
                mobile: listing.partner.mobile,
                whatsappNumber: listing.partner.whatsappNumber,
            },
        });
        const lead = await prismaAny.lead.create({
            data: {
                listingId: listing.id,
                customerId: customer.id,
                dealerId: leadRecipient.recipientUserId,
                enquiryType: enquiryType === 'WHATSAPP' ? 'DEALER_WHATSAPP' : 'DEALER_CALL',
                listingTitleSnapshot: listing.title,
                listingStatusSnapshot: listing.status,
                listingPriceSnapshot: listing.price,
                listingLocationCitySnapshot: listing.locationCity,
                listingLocationStateSnapshot: listing.locationState,
                message: enquiryType === 'WHATSAPP'
                    ? `Customer requested WhatsApp contact for ${listing.title || 'listing'}.`
                    : `Customer requested phone call for ${listing.title || 'listing'}.`,
            },
            include: {
                customer: {
                    select: leadRelatedUserSelect,
                },
                listing: {
                    select: leadRelatedListingSelect,
                },
                dealer: {
                    select: leadRelatedUserSelect,
                },
            },
        });
        return res.status(201).json({
            message: 'Enquiry created successfully.',
            lead: formatLead(lead),
            routing: {
                mode: leadRecipient.routingMode,
                fallbackApplied: leadRecipient.fallbackApplied,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.createPublicContactLead = createPublicContactLead;
const getMyLeads = async (req, res, next) => {
    try {
        if (!req.user?.id || !['PARTNER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Lead access required.' });
        }
        if (req.user.role === 'EMPLOYEE' && !(await canEmployeeManageEnquiries(req.user.id))) {
            return res.status(403).json({ error: 'You do not have permission to access enquiries.' });
        }
        const requestedStatus = String(req.query.status || '').trim().toUpperCase();
        const search = String(req.query.search || '').trim();
        const statusFilter = LEAD_STATUSES.includes(requestedStatus)
            ? requestedStatus
            : null;
        const leadScope = req.user.role === 'SUPER_ADMIN' || req.user.role === 'EMPLOYEE'
            ? {}
            : {
                dealerId: req.user.id,
            };
        const summarySource = await prismaAny.lead.findMany({
            where: leadScope,
            select: { status: true },
        });
        const leads = await prismaAny.lead.findMany({
            where: {
                ...leadScope,
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(search
                    ? {
                        OR: [
                            {
                                listing: {
                                    title: {
                                        contains: search,
                                        mode: 'insensitive',
                                    },
                                },
                            },
                            {
                                listingTitleSnapshot: {
                                    contains: search,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                customer: {
                                    name: {
                                        contains: search,
                                        mode: 'insensitive',
                                    },
                                },
                            },
                            {
                                customer: {
                                    mobile: {
                                        contains: search,
                                        mode: 'insensitive',
                                    },
                                },
                            },
                            {
                                enquiryType: {
                                    contains: search,
                                    mode: 'insensitive',
                                },
                            },
                        ],
                    }
                    : {}),
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                customer: {
                    select: leadRelatedUserSelect,
                },
                listing: {
                    select: leadRelatedListingSelect,
                },
                dealer: {
                    select: leadRelatedUserSelect,
                },
            },
        });
        return res.json({
            summary: buildLeadSummary(summarySource),
            leads: leads.map(formatLead),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getMyLeads = getMyLeads;
const updateLeadStatus = async (req, res, next) => {
    try {
        if (!req.user?.id || !['PARTNER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Lead access required.' });
        }
        if (req.user.role === 'EMPLOYEE' && !(await canEmployeeManageEnquiries(req.user.id))) {
            return res.status(403).json({ error: 'You do not have permission to access enquiries.' });
        }
        const leadId = String(req.params.id || '').trim();
        const status = String(req.body?.status || '').trim().toUpperCase();
        if (!leadId) {
            return res.status(400).json({ error: 'Lead id is required.' });
        }
        if (!LEAD_STATUSES.includes(status)) {
            return res.status(400).json({ error: 'Invalid lead status.' });
        }
        const existingLead = await prismaAny.lead.findUnique({
            where: { id: leadId },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        mobile: true,
                        email: true,
                        city: true,
                        state: true,
                    },
                },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        price: true,
                        locationCity: true,
                        locationState: true,
                    },
                },
            },
        });
        if (!existingLead ||
            (req.user.role === 'PARTNER' && existingLead.dealerId !== req.user.id)) {
            return res.status(404).json({ error: 'Lead not found.' });
        }
        const updatedLead = await prismaAny.lead.update({
            where: { id: leadId },
            data: { status },
            include: {
                customer: {
                    select: leadRelatedUserSelect,
                },
                listing: {
                    select: leadRelatedListingSelect,
                },
                dealer: {
                    select: leadRelatedUserSelect,
                },
            },
        });
        return res.json({
            message: 'Lead status updated successfully.',
            lead: formatLead(updatedLead),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.updateLeadStatus = updateLeadStatus;
const getMyLeadBadges = async (req, res, next) => {
    try {
        if (!req.user?.id || !['PARTNER'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Partner access required.' });
        }
        const enquiriesCount = await prismaAny.lead.count({
            where: {
                dealerId: req.user.id,
                status: 'NEW',
            },
        });
        res.json({
            badges: {
                enquiries: enquiriesCount,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getMyLeadBadges = getMyLeadBadges;
//# sourceMappingURL=lead.controller.js.map