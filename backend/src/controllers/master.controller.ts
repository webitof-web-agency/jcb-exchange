import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { getAppSettings } from '../utils/appSettings';
import {
  getApprovedPartnerProfileWhere,
  getMarketplaceSellerPresentation,
  getPublicListingStatuses,
  getPublicMarketplaceListingWhere,
  getPublicSellerWhere,
  isPublicMarketplaceListingVisible,
} from '../utils/publicListingVisibility';

const prismaAny = prisma as any;

const normalizePhoneNumber = (value?: string | null) => {
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

const resolvePublicLeadContact = ({
  useSellerContact,
  adminCallNumber,
  adminWhatsappNumber,
  sellerMobile,
  sellerAlternateMobile,
  sellerWhatsappNumber,
}: {
  useSellerContact: boolean;
  adminCallNumber?: string | null;
  adminWhatsappNumber?: string | null;
  sellerMobile?: string | null;
  sellerAlternateMobile?: string | null;
  sellerWhatsappNumber?: string | null;
}) => {
  const normalizedAdminCallNumber = normalizePhoneNumber(adminCallNumber);
  const normalizedAdminWhatsappNumber = normalizePhoneNumber(adminWhatsappNumber) || normalizedAdminCallNumber;
  const normalizedSellerCallNumber =
    normalizePhoneNumber(sellerMobile) || normalizePhoneNumber(sellerAlternateMobile);
  const normalizedSellerWhatsappNumber =
    normalizePhoneNumber(sellerWhatsappNumber) || normalizedSellerCallNumber;

  if (useSellerContact) {
    return {
      callNumber: normalizedSellerCallNumber || normalizedAdminCallNumber,
      whatsappNumber: normalizedSellerWhatsappNumber || normalizedAdminWhatsappNumber,
      routingMode: normalizedSellerCallNumber || normalizedSellerWhatsappNumber ? 'SELLER' : 'SUPER_ADMIN',
      fallbackApplied:
        (!!normalizedAdminCallNumber || !!normalizedAdminWhatsappNumber) &&
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
  const superAdminUser = await prisma.user.findFirst({
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
  const adminWhatsappNumber =
    normalizePhoneNumber(superAdminUser?.whatsappNumber) || adminCallNumber;

  return {
    adminCallNumber,
    adminWhatsappNumber,
  };
};

const getPartnerProfile = async (userId?: string) => {
  if (!userId) {
    return null;
  }

  return prismaAny.partnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
};

const isHiddenPublicCategory = (name?: string | null) =>
  name?.trim().toLowerCase() === 'uncategorized';

export const getCategories = async (req: Request, res: Response, next: NextFunction) => {
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
      data: categories.filter((category: { name?: string | null }) => !isHiddenPublicCategory(category.name)),
    });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const { name, iconId } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const normalizedName = String(name).trim();
    const existing = await prismaAny.category.findFirst({
      where: {
        partnerProfileId: null,
        name: normalizedName,
      },
      select: { id: true },
    });
    if (existing) return res.status(400).json({ error: 'Category already exists' });

    const category = await prismaAny.category.create({
      data: {
        name: normalizedName,
        iconId,
        partnerProfileId: null,
      },
      include: { icon: true },
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const id = req.params.id as string;
    const { name, iconId } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

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
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const id = req.params.id as string;

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
  } catch (error) {
    next(error);
  }
};

export const getBrands = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const brands = await prisma.brand.findMany({
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ success: true, data: brands });
  } catch (error) {
    next(error);
  }
};

export const createBrand = async (req: Request, res: Response, next: NextFunction) => {
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

    const existingBrand = await prisma.brand.findUnique({
      where: { name: normalizedName },
      select: { id: true },
    });

    if (existingBrand) {
      return res.status(400).json({ error: 'Brand already exists.' });
    }

    const brand = await prisma.brand.create({
      data: { name: normalizedName },
    });

    res.status(201).json({ success: true, data: brand });
  } catch (error) {
    next(error);
  }
};

export const updateBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const id = req.params.id as string;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Brand name is required.' });
    }

    const normalizedName = String(name).trim();
    if (!normalizedName) {
      return res.status(400).json({ error: 'Brand name is required.' });
    }

    const existingBrand = await prisma.brand.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingBrand) {
      return res.status(404).json({ error: 'Brand not found.' });
    }

    const duplicateBrand = await prisma.brand.findFirst({
      where: {
        id: { not: id },
        name: normalizedName,
      },
      select: { id: true },
    });

    if (duplicateBrand) {
      return res.status(400).json({ error: 'Brand already exists.' });
    }

    const brand = await prisma.brand.update({
      where: { id },
      data: { name: normalizedName },
    });

    res.status(200).json({ success: true, data: brand });
  } catch (error) {
    next(error);
  }
};

export const deleteBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const id = req.params.id as string;

    const brand = await prisma.brand.findUnique({
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

    await prisma.brand.delete({
      where: { id },
    });

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
};

export const getModels = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brandId = String(req.params.brandId || '').trim();

    if (!brandId) {
      return res.status(400).json({ error: 'Brand ID is required.' });
    }

    const models = await prisma.model.findMany({
      where: { brandId },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ success: true, data: models });
  } catch (error) {
    next(error);
  }
};

export const getIcons = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const icons = await prisma.categoryIcon.findMany({
      orderBy: { name: 'asc' },
    });
    res.status(200).json({ success: true, data: icons });
  } catch (error) {
    next(error);
  }
};

export const createIcon = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, svgData } = req.body;
    if (!name || !svgData) return res.status(400).json({ error: 'Name and SVG data are required' });

    const existing = await prisma.categoryIcon.findUnique({ where: { name } });
    if (existing) return res.status(400).json({ error: 'Icon with this name already exists' });

    const icon = await prisma.categoryIcon.create({
      data: { name, svgData },
    });
    res.status(201).json({ success: true, data: icon });
  } catch (error) {
    next(error);
  }
};

export const getApprovedDealers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [settings, defaultSuperAdminContact, dealers] = await Promise.all([
      getAppSettings(),
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

    const data = dealers.map((dealer: any) => ({
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
  } catch (error) {
    next(error);
  }
};

export const getDealerById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [settings, defaultSuperAdminContact, dealer] = await Promise.all([
      getAppSettings(),
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
  } catch (error) {
    next(error);
  }
};

export const getDealerListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const listings = await prismaAny.listing.findMany({
      where: {
        ...getPublicMarketplaceListingWhere(),
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
      data: listings.map((listing: any) => ({
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
        thumbnailUrl:
          listing.media?.find((m: any) => m.isFeatured && m.type === 'IMAGE')?.url ||
          listing.media?.find((m: any) => m.type === 'IMAGE')?.url ||
          null,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getFinanceSupportItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.status(200).json({
      success: true,
      data: settings.financeSupport.items,
    });
  } catch (error) {
    next(error);
  }
};

export const getHeroImage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.status(200).json({
      success: true,
      data: settings.heroImage,
    });
  } catch (error) {
    next(error);
  }
};

export const getInspectionSection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.status(200).json({
      success: true,
      data: settings.inspectionSection,
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listings = await prismaAny.listing.findMany({
      where: getPublicMarketplaceListingWhere(),
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
      data: listings.map((listing: any) => ({
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
          name:
            listing.partner?.partnerProfile?.businessName ||
            listing.partner?.name ||
            'Verified Partner',
        },
        featuredImage:
          listing.media.find((media: any) => media.type === 'IMAGE' && media.isFeatured)?.url ||
          listing.media.find((media: any) => media.type === 'IMAGE')?.url ||
          null,
        mediaCount: listing.media.length,
        createdAt: listing.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getRecentListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listings = await prismaAny.listing.findMany({
      where: {
        status: {
          in: getPublicListingStatuses(),
        },
        partner: {
          OR: [
            {
              role: 'CUSTOMER',
              status: 'ACTIVE',
            },
            {
              partnerProfile: getApprovedPartnerProfileWhere(),
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
      data: listings.map((listing: any) => ({
        id: listing.id,
        title: listing.title,
        price: Number(listing.price || 0),
        locationCity: listing.locationCity,
        locationState: listing.locationState,
        status: listing.status,
        categoryName: listing.category?.name,
        brandName: listing.brand?.name,
        partnerName:
          listing.partner?.partnerProfile?.businessName ||
          listing.partner?.name ||
          'Verified Partner',
        featuredImage:
          listing.media.find((media: any) => media.type === 'IMAGE' && media.isFeatured)?.url ||
          listing.media.find((media: any) => media.type === 'IMAGE')?.url ||
          null,
        createdAt: listing.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getPublicCategories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit || ''), 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : null;

    const listings = await prismaAny.listing.findMany({
      where: {
        status: {
          in: getPublicListingStatuses(),
        },
        category: {
          partnerProfileId: null,
        },
        partner: getPublicSellerWhere(),
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

    const categoryMap = new Map<
      string,
      {
        id: string;
        name: string;
        count: number;
        featuredImage: string | null;
        icon: { id: string; name: string; svgData: string } | null;
      }
    >();

    for (const listing of listings) {
      if (!listing.category) {
        continue;
      }

      if (isHiddenPublicCategory(listing.category.name)) {
        continue;
      }

      const existing = categoryMap.get(listing.category.id);
      const featuredImage =
        listing.media.find((media: any) => media.type === 'IMAGE' && media.isFeatured)?.url ||
        listing.media.find((media: any) => media.type === 'IMAGE')?.url ||
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
  } catch (error) {
    next(error);
  }
};

export const getPublicSearchFilters = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listings = await prismaAny.listing.findMany({
      where: {
        status: {
          in: getPublicListingStatuses(),
        },
        category: {
          partnerProfileId: null,
        },
        partner: getPublicSellerWhere(),
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

    const categoryMap = new Map<string, { id: string; name: string; count: number }>();
    const locationMap = new Map<string, { name: string; count: number }>();

    for (const listing of listings) {
      if (listing.category) {
        if (isHiddenPublicCategory(listing.category.name)) {
          continue;
        }

        const existingCategory = categoryMap.get(listing.category.id);
        if (existingCategory) {
          existingCategory.count += 1;
        } else {
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
      } else {
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
  } catch (error) {
    next(error);
  }
};

export const getPublicListingById = async (req: Request, res: Response, next: NextFunction) => {
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

    if (
      !isPublicMarketplaceListingVisible({
        status: listing.status,
        partner: {
          role: listing.partner?.role,
          status: listing.partner?.status,
          partnerProfile: listing.partner?.partnerProfile,
        },
      })
    ) {
      return res.status(404).json({ success: false, error: 'Listing is not available.' });
    }

    const [settings, defaultSuperAdminContact] = await Promise.all([
      getAppSettings(),
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

    const sellerPresentation = getMarketplaceSellerPresentation({
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
      featuredImage:
        listing.media.find((media: any) => media.type === 'IMAGE' && media.isFeatured)?.url ||
        listing.media.find((media: any) => media.type === 'IMAGE')?.url ||
        null,
      mediaCount: listing.media.length,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    next(error);
  }
};

const viewCache = new Map<string, number>();

// Cleanup cache periodically to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of viewCache.entries()) {
    if (now - timestamp > 24 * 60 * 60 * 1000) {
      viewCache.delete(key);
    }
  }
}, 60 * 60 * 1000); // run every hour

const isBot = (userAgent: string) => {
  const bots = ['bot', 'spider', 'crawler', 'googlebot', 'bingbot', 'yandexbot', 'slurp', 'duckduckbot', 'baiduspider'];
  const ua = userAgent.toLowerCase();
  return bots.some(bot => ua.includes(bot));
};

export const incrementListingView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Listing ID is required.' });
    }

    const userAgent = (req.headers['user-agent'] as string) || '';
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || 'unknown';

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
  } catch (error) {
    // If the listing doesn't exist, we don't necessarily want to throw a hard error in the UI
    if ((error as any).code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Listing not found.' });
    }
    next(error);
  }
};


