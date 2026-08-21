"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementListingView = exports.getPublicListingById = exports.getPublicSearchFilters = exports.getPublicCategories = exports.getRecentListings = exports.getPublicListings = exports.getInspectionSection = exports.getHeroImage = exports.getFinanceSupportItems = exports.getDealerListings = exports.getDealerById = exports.getApprovedDealers = exports.createIcon = exports.getIcons = exports.getModels = exports.deleteBrand = exports.updateBrand = exports.createBrand = exports.getBrands = exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategories = void 0;
const prisma_1 = __importDefault(require("../lib/prisma"));
const appSettings_1 = require("../utils/appSettings");
const publicListingVisibility_1 = require("../utils/publicListingVisibility");
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
const resolvePublicLeadContact = ({ useSellerContact, adminCallNumber, adminWhatsappNumber, sellerMobile, sellerAlternateMobile, sellerWhatsappNumber, }) => {
    const normalizedAdminCallNumber = normalizePhoneNumber(adminCallNumber);
    const normalizedAdminWhatsappNumber = normalizePhoneNumber(adminWhatsappNumber) || normalizedAdminCallNumber;
    const normalizedSellerCallNumber = normalizePhoneNumber(sellerMobile) || normalizePhoneNumber(sellerAlternateMobile);
    const normalizedSellerWhatsappNumber = normalizePhoneNumber(sellerWhatsappNumber) || normalizedSellerCallNumber;
    if (useSellerContact) {
        return {
            callNumber: normalizedSellerCallNumber || normalizedAdminCallNumber,
            whatsappNumber: normalizedSellerWhatsappNumber || normalizedAdminWhatsappNumber,
            routingMode: normalizedSellerCallNumber || normalizedSellerWhatsappNumber ? 'SELLER' : 'SUPER_ADMIN',
            fallbackApplied: (!!normalizedAdminCallNumber || !!normalizedAdminWhatsappNumber) &&
                (!normalizedSellerCallNumber || !normalizedSellerWhatsappNumber),
        };
    }
    return {
        callNumber: normalizedAdminCallNumber,
        whatsappNumber: normalizedAdminWhatsappNumber,
        routingMode: 'SUPER_ADMIN',
        fallbackApplied: false,
    };
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
    const adminWhatsappNumber = normalizePhoneNumber(superAdminUser?.whatsappNumber) || adminCallNumber;
    return {
        adminCallNumber,
        adminWhatsappNumber,
    };
};
const getPartnerProfile = async (userId) => {
    if (!userId) {
        return null;
    }
    return prismaAny.partnerProfile.findUnique({
        where: { userId },
        select: { id: true },
    });
};
const isHiddenPublicCategory = (name) => name?.trim().toLowerCase() === 'uncategorized';
const getCategories = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const categories = await prismaAny.category.findMany({
            where: {
                partnerProfileId: null,
            },
            include: { icon: true },
            orderBy: { name: 'asc' },
        });
        res.status(200).json({
            success: true,
            data: categories.filter((category) => !isHiddenPublicCategory(category.name)),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const { name, iconId } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Name is required' });
        const normalizedName = String(name).trim();
        const existing = await prismaAny.category.findFirst({
            where: {
                partnerProfileId: null,
                name: normalizedName,
            },
            select: { id: true },
        });
        if (existing)
            return res.status(400).json({ error: 'Category already exists' });
        const category = await prismaAny.category.create({
            data: {
                name: normalizedName,
                iconId,
                partnerProfileId: null,
            },
            include: { icon: true },
        });
        res.status(201).json({ success: true, data: category });
    }
    catch (error) {
        next(error);
    }
};
exports.createCategory = createCategory;
const updateCategory = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const id = req.params.id;
        const { name, iconId } = req.body;
        if (!name)
            return res.status(400).json({ error: 'Name is required' });
        const normalizedName = String(name).trim();
        const existingCategory = await prismaAny.category.findFirst({
            where: {
                id,
                partnerProfileId: null,
            },
            select: { id: true },
        });
        if (!existingCategory) {
            return res.status(404).json({ error: 'Category not found.' });
        }
        const duplicateCategory = await prismaAny.category.findFirst({
            where: {
                id: { not: id },
                partnerProfileId: null,
                name: normalizedName,
            },
            select: { id: true },
        });
        if (duplicateCategory) {
            return res.status(400).json({ error: 'Category already exists' });
        }
        const category = await prismaAny.category.update({
            where: { id },
            data: { name: normalizedName, iconId },
            include: { icon: true },
        });
        res.status(200).json({ success: true, data: category });
    }
    catch (error) {
        next(error);
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const id = req.params.id;
        const category = await prismaAny.category.findFirst({
            where: {
                id,
                partnerProfileId: null,
            },
            select: {
                id: true,
                _count: {
                    select: {
                        listings: true,
                    },
                },
            },
        });
        if (!category) {
            return res.status(404).json({ error: 'Category not found.' });
        }
        if (category._count.listings > 0) {
            return res.status(400).json({ error: 'This category is already used in listings and cannot be deleted.' });
        }
        await prismaAny.category.delete({
            where: { id },
        });
        res.status(200).json({ success: true });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteCategory = deleteCategory;
const getBrands = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const brands = await prisma_1.default.brand.findMany({
            orderBy: { name: 'asc' },
        });
        res.status(200).json({ success: true, data: brands });
    }
    catch (error) {
        next(error);
    }
};
exports.getBrands = getBrands;
const createBrand = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Brand name is required.' });
        }
        const normalizedName = String(name).trim();
        if (!normalizedName) {
            return res.status(400).json({ error: 'Brand name is required.' });
        }
        const existingBrand = await prisma_1.default.brand.findUnique({
            where: { name: normalizedName },
            select: { id: true },
        });
        if (existingBrand) {
            return res.status(400).json({ error: 'Brand already exists.' });
        }
        const brand = await prisma_1.default.brand.create({
            data: { name: normalizedName },
        });
        res.status(201).json({ success: true, data: brand });
    }
    catch (error) {
        next(error);
    }
};
exports.createBrand = createBrand;
const updateBrand = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const id = req.params.id;
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Brand name is required.' });
        }
        const normalizedName = String(name).trim();
        if (!normalizedName) {
            return res.status(400).json({ error: 'Brand name is required.' });
        }
        const existingBrand = await prisma_1.default.brand.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!existingBrand) {
            return res.status(404).json({ error: 'Brand not found.' });
        }
        const duplicateBrand = await prisma_1.default.brand.findFirst({
            where: {
                id: { not: id },
                name: normalizedName,
            },
            select: { id: true },
        });
        if (duplicateBrand) {
            return res.status(400).json({ error: 'Brand already exists.' });
        }
        const brand = await prisma_1.default.brand.update({
            where: { id },
            data: { name: normalizedName },
        });
        res.status(200).json({ success: true, data: brand });
    }
    catch (error) {
        next(error);
    }
};
exports.updateBrand = updateBrand;
const deleteBrand = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const id = req.params.id;
        const brand = await prisma_1.default.brand.findUnique({
            where: { id },
            select: {
                id: true,
                _count: {
                    select: {
                        listings: true,
                        models: true,
                    },
                },
            },
        });
        if (!brand) {
            return res.status(404).json({ error: 'Brand not found.' });
        }
        if (brand._count.listings > 0 || brand._count.models > 0) {
            return res
                .status(400)
                .json({ error: 'This brand is already used in listings or models and cannot be deleted.' });
        }
        await prisma_1.default.brand.delete({
            where: { id },
        });
        res.status(200).json({ success: true });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteBrand = deleteBrand;
const getModels = async (req, res, next) => {
    try {
        const brandId = String(req.params.brandId || '').trim();
        if (!brandId) {
            return res.status(400).json({ error: 'Brand ID is required.' });
        }
        const models = await prisma_1.default.model.findMany({
            where: { brandId },
            orderBy: { name: 'asc' },
        });
        res.status(200).json({ success: true, data: models });
    }
    catch (error) {
        next(error);
    }
};
exports.getModels = getModels;
const getIcons = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const icons = await prisma_1.default.categoryIcon.findMany({
            orderBy: { name: 'asc' },
        });
        res.status(200).json({ success: true, data: icons });
    }
    catch (error) {
        next(error);
    }
};
exports.getIcons = getIcons;
const createIcon = async (req, res, next) => {
    try {
        const { name, svgData } = req.body;
        if (!name || !svgData)
            return res.status(400).json({ error: 'Name and SVG data are required' });
        const existing = await prisma_1.default.categoryIcon.findUnique({ where: { name } });
        if (existing)
            return res.status(400).json({ error: 'Icon with this name already exists' });
        const icon = await prisma_1.default.categoryIcon.create({
            data: { name, svgData },
        });
        res.status(201).json({ success: true, data: icon });
    }
    catch (error) {
        next(error);
    }
};
exports.createIcon = createIcon;
const getApprovedDealers = async (req, res, next) => {
    try {
        const [settings, defaultSuperAdminContact, dealers] = await Promise.all([
            (0, appSettings_1.getAppSettings)(),
            getDefaultSuperAdminContact(),
            prismaAny.partnerProfile.findMany({
                where: {
                    accountStatus: 'ACTIVE',
                    onboardingStatus: 'APPROVED',
                    kycStatus: 'APPROVED',
                },
                select: {
                    id: true,
                    businessName: true,
                    businessLogoUrl: true,
                    district: true,
                    businessAddress: true,
                    alternateMobile: true,
                    user: {
                        select: {
                            mobile: true,
                            name: true,
                            whatsappNumber: true,
                        },
                    },
                    partnerType: true,
                    workingHours: true,
                    yearsInBusiness: true,
                    businessDescription: true,
                    contactPreference: true,
                    websiteUrl: true,
                    createdAt: true,
                },
                orderBy: {
                    businessName: 'asc',
                },
            }),
        ]);
        const data = dealers.map((dealer) => ({
            ...dealer,
            publicContact: resolvePublicLeadContact({
                useSellerContact: settings.publicLeadRouting.useSellerContact,
                adminCallNumber: defaultSuperAdminContact.adminCallNumber,
                adminWhatsappNumber: defaultSuperAdminContact.adminWhatsappNumber,
                sellerMobile: dealer.user?.mobile,
                sellerAlternateMobile: dealer.alternateMobile,
                sellerWhatsappNumber: dealer.user?.whatsappNumber,
            }),
        }));
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
};
exports.getApprovedDealers = getApprovedDealers;
const getDealerById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [settings, defaultSuperAdminContact, dealer] = await Promise.all([
            (0, appSettings_1.getAppSettings)(),
            getDefaultSuperAdminContact(),
            prismaAny.partnerProfile.findFirst({
                where: {
                    id,
                    accountStatus: 'ACTIVE',
                    onboardingStatus: 'APPROVED',
                    kycStatus: 'APPROVED',
                },
                select: {
                    id: true,
                    businessName: true,
                    businessLogoUrl: true,
                    district: true,
                    businessAddress: true,
                    alternateMobile: true,
                    user: {
                        select: {
                            mobile: true,
                            name: true,
                            whatsappNumber: true,
                        },
                    },
                    partnerType: true,
                    workingHours: true,
                    yearsInBusiness: true,
                    businessDescription: true,
                    contactPreference: true,
                    websiteUrl: true,
                    createdAt: true,
                },
            }),
        ]);
        if (!dealer) {
            return res.status(404).json({ success: false, message: 'Dealer not found' });
        }
        const data = {
            ...dealer,
            publicContact: resolvePublicLeadContact({
                useSellerContact: settings.publicLeadRouting.useSellerContact,
                adminCallNumber: defaultSuperAdminContact.adminCallNumber,
                adminWhatsappNumber: defaultSuperAdminContact.adminWhatsappNumber,
                sellerMobile: dealer.user?.mobile,
                sellerAlternateMobile: dealer.alternateMobile,
                sellerWhatsappNumber: dealer.user?.whatsappNumber,
            }),
        };
        res.status(200).json({ success: true, data });
    }
    catch (error) {
        next(error);
    }
};
exports.getDealerById = getDealerById;
const getDealerListings = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listings = await prismaAny.listing.findMany({
            where: {
                ...(0, publicListingVisibility_1.getPublicMarketplaceListingWhere)(),
                partner: {
                    partnerProfile: {
                        id,
                    },
                },
            },
            include: {
                media: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                category: {
                    select: { id: true, name: true },
                },
                brand: {
                    select: { id: true, name: true },
                },
                model: {
                    select: { id: true, name: true },
                },
                partner: {
                    select: {
                        id: true,
                        name: true,
                        customerPrimeSubscriptions: {
                            where: {
                                status: 'ACTIVE',
                                expiresAt: {
                                    gte: new Date(),
                                },
                            },
                            select: {
                                expiresAt: true,
                            },
                        },
                        partnerProfile: {
                            select: {
                                businessName: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                {
                    createdAt: 'desc',
                },
            ],
        });
        res.status(200).json({
            success: true,
            data: listings.map((listing) => ({
                id: listing.id,
                title: listing.title,
                price: Number(listing.price || 0),
                isNegotiable: Boolean(listing.isNegotiable),
                manufacturingYear: listing.manufacturingYear,
                operatingHours: listing.operatingHours,
                locationCity: listing.locationCity,
                locationState: listing.locationState,
                condition: listing.condition,
                grossPower: listing.grossPower,
                status: listing.status,
                createdAt: listing.createdAt,
                brandName: listing.brand?.name,
                modelName: listing.model?.name,
                categoryName: listing.category?.name,
                categoryId: listing.category?.id,
                sellerName: listing.partner?.partnerProfile?.businessName || listing.partner?.name,
                sellerType: listing.partner?.customerPrimeSubscriptions?.length > 0 ? 'PRIME' : 'STANDARD',
                sellerId: listing.partner?.id,
                thumbnailUrl: listing.media?.find((m) => m.isFeatured && m.type === 'IMAGE')?.url ||
                    listing.media?.find((m) => m.type === 'IMAGE')?.url ||
                    null,
            })),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getDealerListings = getDealerListings;
const getFinanceSupportItems = async (req, res, next) => {
    try {
        const settings = await (0, appSettings_1.getAppSettings)();
        res.status(200).json({
            success: true,
            data: settings.financeSupport.items,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getFinanceSupportItems = getFinanceSupportItems;
const getHeroImage = async (req, res, next) => {
    try {
        const settings = await (0, appSettings_1.getAppSettings)();
        res.status(200).json({
            success: true,
            data: settings.heroImage,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getHeroImage = getHeroImage;
const getInspectionSection = async (req, res, next) => {
    try {
        const settings = await (0, appSettings_1.getAppSettings)();
        res.status(200).json({
            success: true,
            data: settings.inspectionSection,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getInspectionSection = getInspectionSection;
const getPublicListings = async (req, res, next) => {
    try {
        const listings = await prismaAny.listing.findMany({
            where: (0, publicListingVisibility_1.getPublicMarketplaceListingWhere)(),
            include: {
                media: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                category: {
                    select: { id: true, name: true },
                },
                brand: {
                    select: { id: true, name: true },
                },
                model: {
                    select: { id: true, name: true },
                },
                partner: {
                    select: {
                        id: true,
                        name: true,
                        customerPrimeSubscriptions: {
                            where: {
                                status: 'ACTIVE',
                                expiresAt: {
                                    gte: new Date(),
                                },
                            },
                            select: {
                                expiresAt: true,
                            },
                        },
                        partnerProfile: {
                            select: {
                                businessName: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                {
                    createdAt: 'desc',
                },
            ],
        });
        res.status(200).json({
            success: true,
            data: listings.map((listing) => ({
                id: listing.id,
                title: listing.title,
                price: Number(listing.price || 0),
                isNegotiable: Boolean(listing.isNegotiable),
                manufacturingYear: listing.manufacturingYear,
                operatingHours: listing.operatingHours,
                locationCity: listing.locationCity,
                locationState: listing.locationState,
                condition: listing.condition,
                description: listing.description,
                status: listing.status,
                category: listing.category,
                brand: listing.brand,
                model: listing.model,
                partner: {
                    id: listing.partner?.id,
                    name: listing.partner?.partnerProfile?.businessName ||
                        listing.partner?.name ||
                        'Verified Partner',
                },
                featuredImage: listing.media.find((media) => media.type === 'IMAGE' && media.isFeatured)?.url ||
                    listing.media.find((media) => media.type === 'IMAGE')?.url ||
                    null,
                mediaCount: listing.media.length,
                createdAt: listing.createdAt,
            })),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPublicListings = getPublicListings;
const getRecentListings = async (req, res, next) => {
    try {
        const listings = await prismaAny.listing.findMany({
            where: {
                status: {
                    in: (0, publicListingVisibility_1.getPublicListingStatuses)(),
                },
                partner: {
                    OR: [
                        {
                            role: 'CUSTOMER',
                            status: 'ACTIVE',
                        },
                        {
                            partnerProfile: (0, publicListingVisibility_1.getApprovedPartnerProfileWhere)(),
                        },
                    ],
                },
            },
            include: {
                media: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                category: {
                    select: { name: true },
                },
                brand: {
                    select: { name: true },
                },
                partner: {
                    select: {
                        name: true,
                        customerPrimeSubscriptions: {
                            where: {
                                status: 'ACTIVE',
                                expiresAt: {
                                    gte: new Date(),
                                },
                            },
                            select: {
                                expiresAt: true,
                            },
                        },
                        partnerProfile: {
                            select: {
                                businessName: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 4,
        });
        res.status(200).json({
            success: true,
            data: listings.map((listing) => ({
                id: listing.id,
                title: listing.title,
                price: Number(listing.price || 0),
                locationCity: listing.locationCity,
                locationState: listing.locationState,
                status: listing.status,
                categoryName: listing.category?.name,
                brandName: listing.brand?.name,
                partnerName: listing.partner?.partnerProfile?.businessName ||
                    listing.partner?.name ||
                    'Verified Partner',
                featuredImage: listing.media.find((media) => media.type === 'IMAGE' && media.isFeatured)?.url ||
                    listing.media.find((media) => media.type === 'IMAGE')?.url ||
                    null,
                createdAt: listing.createdAt,
            })),
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getRecentListings = getRecentListings;
const getPublicCategories = async (req, res, next) => {
    try {
        const requestedLimit = Number.parseInt(String(req.query.limit || ''), 10);
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : null;
        const listings = await prismaAny.listing.findMany({
            where: {
                status: {
                    in: (0, publicListingVisibility_1.getPublicListingStatuses)(),
                },
                category: {
                    partnerProfileId: null,
                },
                partner: (0, publicListingVisibility_1.getPublicSellerWhere)(),
            },
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                media: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                category: {
                    include: {
                        icon: {
                            select: {
                                id: true,
                                name: true,
                                svgData: true,
                            },
                        },
                    },
                },
            },
        });
        const categoryMap = new Map();
        for (const listing of listings) {
            if (!listing.category) {
                continue;
            }
            if (isHiddenPublicCategory(listing.category.name)) {
                continue;
            }
            const existing = categoryMap.get(listing.category.id);
            const featuredImage = listing.media.find((media) => media.type === 'IMAGE' && media.isFeatured)?.url ||
                listing.media.find((media) => media.type === 'IMAGE')?.url ||
                null;
            if (!existing) {
                categoryMap.set(listing.category.id, {
                    id: listing.category.id,
                    name: listing.category.name,
                    count: 1,
                    featuredImage,
                    icon: listing.category.icon
                        ? {
                            id: listing.category.icon.id,
                            name: listing.category.icon.name,
                            svgData: listing.category.icon.svgData,
                        }
                        : null,
                });
                continue;
            }
            existing.count += 1;
        }
        const data = Array.from(categoryMap.values())
            .sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }
            return left.name.localeCompare(right.name);
        })
            .slice(0, limit ?? undefined);
        return res.status(200).json({
            success: true,
            data,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPublicCategories = getPublicCategories;
const getPublicSearchFilters = async (req, res, next) => {
    try {
        const listings = await prismaAny.listing.findMany({
            where: {
                status: {
                    in: (0, publicListingVisibility_1.getPublicListingStatuses)(),
                },
                category: {
                    partnerProfileId: null,
                },
                partner: (0, publicListingVisibility_1.getPublicSellerWhere)(),
            },
            select: {
                locationCity: true,
                locationState: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });
        const categoryMap = new Map();
        const locationMap = new Map();
        for (const listing of listings) {
            if (listing.category) {
                if (isHiddenPublicCategory(listing.category.name)) {
                    continue;
                }
                const existingCategory = categoryMap.get(listing.category.id);
                if (existingCategory) {
                    existingCategory.count += 1;
                }
                else {
                    categoryMap.set(listing.category.id, {
                        id: listing.category.id,
                        name: listing.category.name,
                        count: 1,
                    });
                }
            }
            const locationLabel = [listing.locationCity, listing.locationState].filter(Boolean).join(', ');
            if (!locationLabel) {
                continue;
            }
            const existingLocation = locationMap.get(locationLabel);
            if (existingLocation) {
                existingLocation.count += 1;
            }
            else {
                locationMap.set(locationLabel, {
                    name: locationLabel,
                    count: 1,
                });
            }
        }
        const categories = Array.from(categoryMap.values()).sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }
            return left.name.localeCompare(right.name);
        });
        const locations = Array.from(locationMap.values()).sort((left, right) => {
            if (right.count !== left.count) {
                return right.count - left.count;
            }
            return left.name.localeCompare(right.name);
        });
        res.status(200).json({
            success: true,
            data: {
                categories,
                locations,
            },
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPublicSearchFilters = getPublicSearchFilters;
const getPublicListingById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ success: false, error: 'Listing ID is required.' });
        }
        const listing = await prismaAny.listing.findUnique({
            where: { id },
            include: {
                media: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
                category: {
                    select: { id: true, name: true },
                },
                brand: {
                    select: { id: true, name: true },
                },
                model: {
                    select: { id: true, name: true },
                },
                partner: {
                    select: {
                        id: true,
                        role: true,
                        status: true,
                        name: true,
                        mobile: true,
                        email: true,
                        whatsappNumber: true,
                        customerPrimeSubscriptions: {
                            where: {
                                status: 'ACTIVE',
                                expiresAt: {
                                    gte: new Date(),
                                },
                            },
                            select: {
                                expiresAt: true,
                            },
                        },
                        partnerProfile: {
                            select: {
                                businessName: true,
                                partnerType: true,
                                onboardingStatus: true,
                                accountStatus: true,
                                kycStatus: true,
                                district: true,
                                businessAddress: true,
                                workingHours: true,
                                alternateMobile: true,
                                businessLogoUrl: true,
                                businessDescription: true,
                            },
                        },
                    },
                },
            },
        });
        if (!listing) {
            return res.status(404).json({ success: false, error: 'Listing not found.' });
        }
        if (!(0, publicListingVisibility_1.isPublicMarketplaceListingVisible)({
            status: listing.status,
            partner: {
                role: listing.partner?.role,
                status: listing.partner?.status,
                partnerProfile: listing.partner?.partnerProfile,
            },
        })) {
            return res.status(404).json({ success: false, error: 'Listing is not available.' });
        }
        const [settings, defaultSuperAdminContact] = await Promise.all([
            (0, appSettings_1.getAppSettings)(),
            getDefaultSuperAdminContact(),
        ]);
        const publicContact = resolvePublicLeadContact({
            useSellerContact: settings.publicLeadRouting.useSellerContact,
            adminCallNumber: defaultSuperAdminContact.adminCallNumber,
            adminWhatsappNumber: defaultSuperAdminContact.adminWhatsappNumber,
            sellerMobile: listing.partner?.mobile,
            sellerAlternateMobile: listing.partner?.partnerProfile?.alternateMobile,
            sellerWhatsappNumber: listing.partner?.whatsappNumber,
        });
        const sellerPresentation = (0, publicListingVisibility_1.getMarketplaceSellerPresentation)({
            role: listing.partner?.role,
            name: listing.partner?.name,
            partnerProfile: listing.partner?.partnerProfile,
            customerPrimeSubscriptions: listing.partner?.customerPrimeSubscriptions,
        });
        const responseData = {
            id: listing.id,
            title: listing.title,
            price: Number(listing.price || 0),
            isNegotiable: Boolean(listing.isNegotiable),
            manufacturingYear: listing.manufacturingYear,
            operatingHours: listing.operatingHours,
            locationCity: listing.locationCity,
            locationState: listing.locationState,
            condition: listing.condition,
            description: listing.description,
            additionalDescription: listing.additionalDescription,
            grossPower: listing.grossPower,
            status: listing.status,
            views: listing.views,
            category: listing.category,
            brand: listing.brand,
            model: listing.model,
            partner: {
                id: listing.partner?.id,
                name: sellerPresentation.displayName,
                partnerType: sellerPresentation.partnerType,
                customerCategory: sellerPresentation.partnerType === 'PRIME_CUSTOMER' ? 'PRIME_CUSTOMER' : 'STANDARD_CUSTOMER',
                district: listing.partner?.partnerProfile?.district,
                address: listing.partner?.partnerProfile?.businessAddress,
                mobile: listing.partner?.mobile,
                whatsapp: listing.partner?.whatsappNumber || listing.partner?.mobile,
                alternateMobile: listing.partner?.partnerProfile?.alternateMobile,
                logo: listing.partner?.partnerProfile?.businessLogoUrl,
                description: listing.partner?.partnerProfile?.businessDescription,
                workingHours: listing.partner?.partnerProfile?.workingHours,
            },
            publicContact,
            media: listing.media,
            featuredImage: listing.media.find((media) => media.type === 'IMAGE' && media.isFeatured)?.url ||
                listing.media.find((media) => media.type === 'IMAGE')?.url ||
                null,
            mediaCount: listing.media.length,
            createdAt: listing.createdAt,
            updatedAt: listing.updatedAt,
        };
        res.status(200).json({
            success: true,
            data: responseData,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPublicListingById = getPublicListingById;
const viewCache = new Map();
// Cleanup cache periodically to avoid memory leaks
setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of viewCache.entries()) {
        if (now - timestamp > 24 * 60 * 60 * 1000) {
            viewCache.delete(key);
        }
    }
}, 60 * 60 * 1000); // run every hour
const isBot = (userAgent) => {
    const bots = ['bot', 'spider', 'crawler', 'googlebot', 'bingbot', 'yandexbot', 'slurp', 'duckduckbot', 'baiduspider'];
    const ua = userAgent.toLowerCase();
    return bots.some(bot => ua.includes(bot));
};
const incrementListingView = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ success: false, error: 'Listing ID is required.' });
        }
        const userAgent = req.headers['user-agent'] || '';
        const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        // 1. Bot Protection
        if (isBot(userAgent)) {
            const listing = await prismaAny.listing.findUnique({ where: { id }, select: { views: true } });
            return res.status(200).json({ success: true, data: { views: listing?.views || 0 } });
        }
        // 2. IP / Unique View Tracking (24 hour limit)
        const cacheKey = `${ip}_${id}`;
        const lastViewed = viewCache.get(cacheKey);
        const now = Date.now();
        if (lastViewed && (now - lastViewed < 86400000)) {
            // Already viewed by this IP in the last 24h, just return current count without incrementing
            const listing = await prismaAny.listing.findUnique({ where: { id }, select: { views: true } });
            return res.status(200).json({ success: true, data: { views: listing?.views || 0 } });
        }
        // Record the view in cache
        viewCache.set(cacheKey, now);
        const listing = await prismaAny.listing.update({
            where: { id },
            data: {
                views: {
                    increment: 1,
                },
            },
            select: { views: true },
        });
        res.status(200).json({
            success: true,
            data: { views: listing.views },
        });
    }
    catch (error) {
        // If the listing doesn't exist, we don't necessarily want to throw a hard error in the UI
        if (error.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Listing not found.' });
        }
        next(error);
    }
};
exports.incrementListingView = incrementListingView;
//# sourceMappingURL=master.controller.js.map