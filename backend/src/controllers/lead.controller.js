"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyLeadBadges = exports.addLeadActivity = exports.getLeadById = exports.updateLeadStatus = exports.getMyLeads = exports.createPublicContactLead = exports.createLead = void 0;
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
const formatDetailedLead = (lead) => {
    const base = formatLead(lead);
    const listingMedia = Array.isArray(lead.listing?.media)
        ? lead.listing.media.map((m) => ({
            id: m.id,
            url: m.url,
            type: m.type,
            isFeatured: m.isFeatured,
        }))
        : [];
    const listingDetails = {
        ...base.listing,
        categoryId: lead.listing?.categoryId,
        categoryName: lead.listing?.category?.name,
        brandName: lead.listing?.brand?.name,
        modelName: lead.listing?.model?.name,
        manufacturingYear: lead.listing?.manufacturingYear,
        operatingHours: lead.listing?.operatingHours,
        condition: lead.listing?.condition,
        description: lead.listing?.description,
        isNegotiable: lead.listing?.isNegotiable,
        media: listingMedia,
        featuredImage: listingMedia.find((m) => m.isFeatured)?.url || listingMedia[0]?.url || null,
    };
    const activities = Array.isArray(lead.activities)
        ? lead.activities.map((a) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            content: a.content || '',
            metadata: a.metadata || null,
            createdAt: a.createdAt,
            actor: a.actor
                ? {
                    id: a.actor.id,
                    name: a.actor.partnerProfile?.businessName || a.actor.name || 'Staff',
                    role: a.actor.role,
                }
                : null,
        }))
        : [];
    const synthesizedTimeline = [...activities];
    const hasCreatedActivity = activities.some((a) => a.type === 'CREATED');
    if (!hasCreatedActivity) {
        synthesizedTimeline.unshift({
            id: `synth-created-${lead.id}`,
            type: 'CREATED',
            title: 'Enquiry Received',
            content: lead.message || `Customer generated an enquiry (${lead.enquiryType}).`,
            metadata: { enquiryType: lead.enquiryType },
            createdAt: lead.createdAt,
            actor: {
                id: lead.customer?.id || '',
                name: lead.customer?.name || 'Customer',
                role: 'CUSTOMER',
            },
        });
    }
    const hasRoutingActivity = activities.some((a) => a.type === 'ROUTING_UPDATE');
    if (!hasRoutingActivity && lead.dealer) {
        synthesizedTimeline.push({
            id: `synth-routing-${lead.id}`,
            type: 'ROUTING_UPDATE',
            title: lead.dealer.role === 'SUPER_ADMIN' ? 'Routed to Platform Admin' : 'Routed to Seller',
            content: `Enquiry routed to ${base.recipient.name} (${base.recipient.mobile || base.recipient.email}).`,
            metadata: { mode: base.routing.mode },
            createdAt: lead.createdAt,
            actor: null,
        });
    }
    synthesizedTimeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return {
        ...base,
        customer: {
            ...base.customer,
            role: lead.customer?.role || 'CUSTOMER',
            createdAt: lead.customer?.createdAt || null,
        },
        listing: listingDetails,
        activities: synthesizedTimeline,
    };
};
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
const getLeadGroupKey = (lead) => {
    const customerKey = lead.customer?.id || lead.customer?.mobile || lead.customer?.email || 'customer';
    const listingKey = lead.listing?.id || lead.listingTitleSnapshot || 'listing';
    const dealerKey = lead.dealer?.id || 'dealer';
    return `${customerKey}::${listingKey}::${dealerKey}`;
};
const groupLeadsForInbox = (leads) => {
    const grouped = new Map();
    for (const lead of leads) {
        const key = getLeadGroupKey(lead);
        const existing = grouped.get(key);
        if (!existing) {
            grouped.set(key, {
                ...lead,
                duplicateCount: 1,
                duplicateLeadIds: [lead.id],
            });
            continue;
        }
        existing.duplicateCount += 1;
        existing.duplicateLeadIds.push(lead.id);
        const leadTime = lead.updatedAt ? new Date(lead.updatedAt).getTime() : new Date(lead.createdAt).getTime();
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : new Date(existing.createdAt).getTime();
        if (leadTime > existingTime) {
            grouped.set(key, {
                ...lead,
                duplicateCount: existing.duplicateCount,
                duplicateLeadIds: existing.duplicateLeadIds,
            });
        }
    }
    return Array.from(grouped.values()).sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
    });
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
        const leadMessage = message || `Dealer callback request for ${partnerProfile.businessName || partnerProfile.user.name || 'approved partner'} from ${fullName || firstName}.`;
        const existingLead = await prismaAny.lead.findFirst({
            where: {
                listingId: listing.id,
                customerId: customer.id,
                dealerId: leadRecipient.recipientUserId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        let lead;
        if (existingLead) {
            await prismaAny.leadActivity.create({
                data: {
                    leadId: existingLead.id,
                    type: 'FOLLOW_UP',
                    title: 'Repeat Enquiry',
                    content: leadMessage,
                },
            });
            lead = await prismaAny.lead.update({
                where: { id: existingLead.id },
                data: {
                    status: 'NEW',
                    updatedAt: new Date(),
                    enquiryType: 'DEALER_CALLBACK',
                    message: leadMessage,
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
        }
        else {
            lead = await prismaAny.lead.create({
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
                    message: leadMessage,
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
        }
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
        const leadMessage = enquiryType === 'WHATSAPP'
            ? `Customer requested WhatsApp contact for ${listing.title || 'listing'}.`
            : `Customer requested phone call for ${listing.title || 'listing'}.`;
        const existingLead = await prismaAny.lead.findFirst({
            where: {
                listingId: listing.id,
                customerId: customer.id,
                dealerId: leadRecipient.recipientUserId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        let lead;
        if (existingLead) {
            await prismaAny.leadActivity.create({
                data: {
                    leadId: existingLead.id,
                    type: 'FOLLOW_UP',
                    title: 'Repeat Enquiry',
                    content: leadMessage,
                },
            });
            lead = await prismaAny.lead.update({
                where: { id: existingLead.id },
                data: {
                    status: 'NEW',
                    updatedAt: new Date(),
                    enquiryType: enquiryType === 'WHATSAPP' ? 'DEALER_WHATSAPP' : 'DEALER_CALL',
                    message: leadMessage,
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
        }
        else {
            lead = await prismaAny.lead.create({
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
                    message: leadMessage,
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
        }
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
                updatedAt: 'desc',
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
        const groupedLeads = groupLeadsForInbox(leads);
        const groupedSummary = buildLeadSummary(groupedLeads.map((lead) => ({ status: lead.status })));
        return res.json({
            summary: groupedSummary,
            leads: groupedLeads.map((lead) => ({
                ...formatLead(lead),
                duplicateCount: lead.duplicateCount,
                duplicateLeadIds: lead.duplicateLeadIds,
            })),
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
        if (existingLead.status !== status) {
            const note = String(req.body?.note || '').trim();
            await prismaAny.leadActivity.create({
                data: {
                    leadId,
                    actorId: req.user.id,
                    type: 'STATUS_CHANGE',
                    title: `Status changed to ${status.replace(/_/g, ' ')}`,
                    content: note || `Lead status was updated from ${existingLead.status} to ${status}.`,
                    metadata: {
                        fromStatus: existingLead.status,
                        toStatus: status,
                        note: note || undefined,
                    },
                },
            }).catch((err) => console.error('Failed to record status change activity:', err));
        }
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
const getLeadById = async (req, res, next) => {
    try {
        if (!req.user?.id || !['PARTNER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Lead access required.' });
        }
        if (req.user.role === 'EMPLOYEE' && !(await canEmployeeManageEnquiries(req.user.id))) {
            return res.status(403).json({ error: 'You do not have permission to access enquiries.' });
        }
        const leadId = String(req.params.id || '').trim();
        if (!leadId) {
            return res.status(400).json({ error: 'Lead id is required.' });
        }
        const lead = await prismaAny.lead.findUnique({
            where: { id: leadId },
            include: {
                customer: {
                    select: {
                        ...leadRelatedUserSelect,
                        createdAt: true,
                    },
                },
                listing: {
                    select: {
                        ...leadRelatedListingSelect,
                        categoryId: true,
                        brandId: true,
                        modelId: true,
                        isNegotiable: true,
                        manufacturingYear: true,
                        operatingHours: true,
                        condition: true,
                        description: true,
                        category: { select: { id: true, name: true } },
                        brand: { select: { id: true, name: true } },
                        model: { select: { id: true, name: true } },
                        media: {
                            select: {
                                id: true,
                                url: true,
                                type: true,
                                isFeatured: true,
                            },
                        },
                    },
                },
                dealer: {
                    select: leadRelatedUserSelect,
                },
                activities: {
                    include: {
                        actor: {
                            select: {
                                id: true,
                                name: true,
                                role: true,
                                partnerProfile: {
                                    select: {
                                        businessName: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found.' });
        }
        if (req.user.role === 'PARTNER' &&
            lead.dealerId !== req.user.id &&
            lead.listing?.partner?.id !== req.user.id) {
            return res.status(403).json({ error: 'Access denied to this lead.' });
        }
        return res.json({
            lead: formatDetailedLead(lead),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getLeadById = getLeadById;
const addLeadActivity = async (req, res, next) => {
    try {
        if (!req.user?.id || !['PARTNER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Lead access required.' });
        }
        if (req.user.role === 'EMPLOYEE' && !(await canEmployeeManageEnquiries(req.user.id))) {
            return res.status(403).json({ error: 'You do not have permission to access enquiries.' });
        }
        const leadId = String(req.params.id || '').trim();
        const content = String(req.body?.content || '').trim();
        const type = String(req.body?.type || 'NOTE').trim().toUpperCase();
        const title = String(req.body?.title || '').trim() ||
            (type === 'CALL'
                ? 'Phone Call Log'
                : type === 'WHATSAPP'
                    ? 'WhatsApp Follow-up'
                    : type === 'INSPECTION'
                        ? 'Inspection Note'
                        : 'Internal Note');
        const metadata = req.body?.metadata || null;
        if (!leadId) {
            return res.status(400).json({ error: 'Lead id is required.' });
        }
        if (!content) {
            return res.status(400).json({ error: 'Note or activity content is required.' });
        }
        const lead = await prismaAny.lead.findUnique({
            where: { id: leadId },
            select: {
                id: true,
                dealerId: true,
                listing: {
                    select: {
                        partnerId: true,
                    },
                },
            },
        });
        if (!lead) {
            return res.status(404).json({ error: 'Lead not found.' });
        }
        if (req.user.role === 'PARTNER' &&
            lead.dealerId !== req.user.id &&
            lead.listing?.partnerId !== req.user.id) {
            return res.status(403).json({ error: 'Access denied to this lead.' });
        }
        const activity = await prismaAny.leadActivity.create({
            data: {
                leadId,
                actorId: req.user.id,
                type,
                title,
                content,
                metadata,
            },
            include: {
                actor: {
                    select: {
                        id: true,
                        name: true,
                        role: true,
                        partnerProfile: {
                            select: {
                                businessName: true,
                            },
                        },
                    },
                },
            },
        });
        return res.status(201).json({
            message: 'Activity recorded successfully.',
            activity: {
                id: activity.id,
                type: activity.type,
                title: activity.title,
                content: activity.content,
                metadata: activity.metadata,
                createdAt: activity.createdAt,
                actor: activity.actor
                    ? {
                        id: activity.actor.id,
                        name: activity.actor.partnerProfile?.businessName || activity.actor.name || 'Staff',
                        role: activity.actor.role,
                    }
                    : null,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.addLeadActivity = addLeadActivity;
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