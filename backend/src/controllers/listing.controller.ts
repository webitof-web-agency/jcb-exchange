import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { detachLeadsFromListing, getSoldAtValueForStatus, setListingSoldAt } from '../utils/soldListingRetention';
import { assertCustomerPrimeEligibility } from '../utils/customerPrimeSubscriptions';

const prismaAny = prisma as any;
const REVIEW_PENDING_STATUSES = ['PENDING_APPROVAL', 'CHANGES_REQUESTED'] as const;
const PUBLIC_LISTING_STATUSES = ['PUBLISHED', 'PAUSED', 'RESERVED', 'SOLD'] as const;

const isReviewPendingStatus = (status?: string | null) =>
  REVIEW_PENDING_STATUSES.includes(String(status || '').toUpperCase() as (typeof REVIEW_PENDING_STATUSES)[number]);

const isPublicListingStatus = (status?: string | null) =>
  PUBLIC_LISTING_STATUSES.includes(String(status || '').toUpperCase() as (typeof PUBLIC_LISTING_STATUSES)[number]);

const getApprovedPartnerProfile = async (userId?: string) => {
  if (!userId) {
    return null;
  }

  const partnerProfile = await prismaAny.partnerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      onboardingStatus: true,
      accountStatus: true,
      kycStatus: true,
    },
  });

  if (
    !partnerProfile ||
    !(
    partnerProfile.onboardingStatus === 'APPROVED' &&
    partnerProfile.accountStatus === 'ACTIVE' &&
    partnerProfile.kycStatus === 'APPROVED'
    )
  ) {
    return null;
  }

  return partnerProfile;
};

const getSelectableCategory = async (categoryId: string, partnerProfileId: string) => {
  if (!categoryId) {
    return null;
  }

  return prismaAny.category.findFirst({
    where: {
      id: categoryId,
      OR: [
        { partnerProfileId: null },
        { partnerProfileId },
      ],
    },
    select: { id: true, name: true },
  });
};

const getOrCreateFallbackCategory = async (partnerProfileId: string) => {
  const existingCategory = await prismaAny.category.findFirst({
    where: {
      name: 'Uncategorized',
      OR: [
        { partnerProfileId: null },
        { partnerProfileId },
      ],
    },
    select: { id: true, name: true },
  });

  if (existingCategory) {
    return existingCategory;
  }

  return prismaAny.category.create({
    data: {
      partnerProfileId: null,
      name: 'Uncategorized',
    },
    select: { id: true, name: true },
  });
};

const normalizeText = (value: unknown) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const parseInteger = (value: unknown) => {
  const input = typeof value === 'number' ? value : Number(String(value || '').trim());
  return Number.isInteger(input) ? input : null;
};

const parseDecimal = (value: unknown) => {
  const input = typeof value === 'number' ? value : Number(String(value || '').trim());
  return Number.isFinite(input) && input >= 0 ? new Prisma.Decimal(input) : null;
};

const normalizeListingStatus = (value: unknown, fallback: string) => {
  const normalized = normalizeText(value).toUpperCase();

  if (
    [
      'DRAFT',
      'PENDING_APPROVAL',
      'CHANGES_REQUESTED',
      'PUBLISHED',
      'PAUSED',
      'RESERVED',
      'SOLD',
    ].includes(normalized)
  ) {
    return normalized;
  }

  if (normalized === 'AVAILABLE') {
    return 'PUBLISHED';
  }

  if (normalized === 'PENDING') {
    return 'PENDING_APPROVAL';
  }

  return fallback.toUpperCase();
};

const formatSellerTypeLabel = (value: string | null | undefined) => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return 'Unknown';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getDealerCategoryLabel = (partner?: {
  role?: string | null;
  partnerProfile?: {
    partnerType?: string | null;
  } | null;
  customerPrimeSubscriptions?: Array<{
    expiresAt?: string | Date | null;
  }> | null;
} | null) => {
  if (!partner) {
    return 'Unknown';
  }

  if (partner.role === 'PARTNER') {
    return partner.partnerProfile?.partnerType || 'Authorized Place';
  }

  if (partner.role === 'CUSTOMER') {
    const hasActivePrimeSubscription = partner.customerPrimeSubscriptions?.some((subscription) => {
      const expiresAt = subscription.expiresAt ? new Date(subscription.expiresAt) : null;
      return !!expiresAt && expiresAt >= new Date();
    });

    return hasActivePrimeSubscription ? 'Prime Customer' : 'Customer';
  }

  if (partner.role) {
    return formatSellerTypeLabel(partner.role);
  }

  return 'User';
};

const normalizeMedia = (media: unknown) => {
  if (!Array.isArray(media)) {
    return [];
  }

  return media
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const fileUrl = normalizeText((item as any).fileUrl);
      const type = normalizeText((item as any).type).toUpperCase();
      const slot = normalizeText((item as any).slot).toLowerCase();
      const isFeatured = Boolean((item as any).isFeatured) || slot === 'front-view';

      if (!fileUrl || !['IMAGE', 'VIDEO'].includes(type)) {
        return null;
      }

      return {
        url: fileUrl,
        type,
        slot: slot || (type === 'IMAGE' && isFeatured ? 'front-view' : null),
        isFeatured,
      };
    })
    .filter(
      (item): item is { url: string; type: string; slot: string | null; isFeatured: boolean } =>
        item !== null
    );
};

const validateListingPayload = ({
  categoryId,
  brandName,
  modelName,
  title,
  price,
  manufacturingYear,
  locationState,
  locationCity,
  description,
  media,
}: {
  categoryId: string;
  brandName: string;
  modelName: string;
  title: string;
  price: Prisma.Decimal | null;
  manufacturingYear: number | null;
  locationState: string;
  locationCity: string;
  description: string;
  media: Array<{ url: string; type: string; slot: string | null; isFeatured: boolean }>;
}) => {
  return null;
};

const getEmployeePermissions = async (userId?: string) => {
  if (!userId) {
    return [];
  }

  const userObj = await prismaAny.user.findUnique({
    where: { id: userId },
    include: { customRole: true },
  });

  return userObj?.customRole?.permissions || [];
};

const getOwnedListingForUser = async (listingId: string, userId: string) => {
  const listing = await prismaAny.listing.findUnique({
    where: { id: listingId },
    include: {
      partner: {
        select: {
          id: true,
          role: true,
        },
      },
      media: true,
      category: {
        select: { id: true, name: true },
      },
      brand: {
        select: { id: true, name: true },
      },
      model: {
        select: { id: true, name: true },
      },
    },
  });

  if (!listing || listing.partnerId !== userId) {
    return null;
  }

  return listing;
};

const formatListingPriceInLakhs = (price: Prisma.Decimal | number | string) => {
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return 'Price on request';
  }

  return `Rs ${ (numericPrice / 100000).toFixed(2) } Lakh`;
};

const createCustomerListingNotifications = async ({
  listingId,
  creatorUserId,
  creatorRole,
  title,
  price,
  locationCity,
  locationState,
  categoryName,
}: {
  listingId: string;
  creatorUserId: string;
  creatorRole: string;
  title: string;
  price: Prisma.Decimal | number | string;
  locationCity: string;
  locationState: string;
  categoryName?: string | null;
}) => {
  const recipients = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      status: 'ACTIVE',
      ...(creatorRole === 'CUSTOMER' ? { id: { not: creatorUserId } } : {}),
    },
    select: {
      id: true,
    },
  });

  if (!recipients.length) {
    return;
  }

  const notificationTitle = `New vehicle listed: ${title}`;
  const notificationMessage = [
    categoryName || 'Equipment',
    formatListingPriceInLakhs(price),
    [locationCity, locationState].filter(Boolean).join(', '),
  ]
    .filter(Boolean)
    .join(' • ');

  await prisma.notification.createMany({
    data: recipients.map((recipient) => ({
      userId: recipient.id,
      title: notificationTitle,
      message: notificationMessage,
      type: 'NEW_LISTING',
      link: `/machines/${listingId}`,
    })),
  });
};

export const createListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const isCustomer = req.user.role === 'CUSTOMER';
    if (!isCustomer && req.user.role !== 'PARTNER') {
      return res.status(403).json({ error: 'Customer or approved partner access required.' });
    }

    if (isCustomer) {
      const primeEligibility = await assertCustomerPrimeEligibility({
        userId: req.user.id,
        role: req.user.role,
        feature: 'SELL_LISTING',
      });

      if (!primeEligibility.isAllowed) {
        return res.status(403).json({
          error: primeEligibility.pendingSubscription
            ? 'Your Prime payment is under review. Vehicle listing will unlock after verification.'
            : 'Prime customer subscription is required before posting vehicle listings.',
          code: primeEligibility.pendingSubscription ? 'PRIME_PAYMENT_PENDING' : 'PRIME_SUBSCRIPTION_REQUIRED',
        });
      }
    }

    let partnerProfileId = null;
    if (!isCustomer) {
      const partnerProfile = await getApprovedPartnerProfile(req.user.id);
      if (!partnerProfile) {
        return res.status(403).json({
          error: 'Your partner account must complete KYC and receive super admin approval before creating listings.',
        });
      }
      partnerProfileId = partnerProfile.id;
    }

    const {
      categoryId,
      brandName,
      modelName,
      title,
      status,
      price,
      isNegotiable,
      manufacturingYear,
      operatingHours,
      locationState,
      locationCity,
      condition,
      description,
      additionalDescription,
      grossPower,
      media,
    } = req.body || {};

    const normalizedCategoryId = normalizeText(categoryId);
    const normalizedBrandName = normalizeText(brandName) || 'Not specified';
    const normalizedModelName = normalizeText(modelName) || 'Not specified';
    const normalizedTitle = normalizeText(title);
    const normalizedStatus = normalizeListingStatus(status, 'PENDING_APPROVAL');
    const initialListingStatus = isCustomer || req.user.role === 'PARTNER' ? 'PENDING_APPROVAL' : normalizedStatus;
    const normalizedState = normalizeText(locationState) || 'Not specified';
    const normalizedCity = normalizeText(locationCity) || 'Not specified';
    const normalizedCondition = normalizeText(condition);
    const normalizedDescription = normalizeText(description);
    const normalizedAdditionalDescription = normalizeText(additionalDescription);
    const normalizedGrossPower = normalizeText(grossPower);
    const parsedYear = parseInteger(manufacturingYear) || new Date().getFullYear();
    const parsedOperatingHours = parseInteger(operatingHours);
    const parsedPrice = parseDecimal(price) || new Prisma.Decimal(0);
    const normalizedMedia = normalizeMedia(media);
    const soldAt = getSoldAtValueForStatus({ nextStatus: initialListingStatus });
    const payloadValidationError = validateListingPayload({
      categoryId: normalizedCategoryId,
      brandName: normalizedBrandName,
      modelName: normalizedModelName,
      title: normalizedTitle || `${normalizedBrandName} ${normalizedModelName}`.trim(),
      price: parsedPrice,
      manufacturingYear: parsedYear,
      locationState: normalizedState,
      locationCity: normalizedCity,
      description: normalizedDescription,
      media: normalizedMedia,
    });

    if (payloadValidationError) {
      return res.status(400).json({ error: payloadValidationError });
    }

    let category = await getSelectableCategory(normalizedCategoryId, partnerProfileId || '');

    if (!category) {
      category = await getOrCreateFallbackCategory(partnerProfileId || '');
    }

    const brand = await prismaAny.brand.upsert({
      where: { name: normalizedBrandName },
      update: {},
      create: { name: normalizedBrandName },
      select: { id: true, name: true },
    });

    let model = await prismaAny.model.findFirst({
      where: {
        brandId: brand.id,
        name: normalizedModelName,
      },
      select: { id: true, name: true },
    });

    if (!model) {
      model = await prismaAny.model.create({
        data: {
          brandId: brand.id,
          name: normalizedModelName,
        },
        select: { id: true, name: true },
      });
    }

    const listing = await prismaAny.listing.create({
      data: {
        partnerId: req.user.id,
        categoryId: category.id,
        brandId: brand.id,
        modelId: model.id,
        title: normalizedTitle || `${brand.name} ${model.name}`.trim() || 'Untitled listing',
        price: parsedPrice,
        isNegotiable: Boolean(isNegotiable),
        manufacturingYear: parsedYear,
        operatingHours: parsedOperatingHours,
        locationState: normalizedState,
        locationCity: normalizedCity,
        condition: normalizedCondition || null,
        description: normalizedDescription || null,
        additionalDescription: normalizedAdditionalDescription || null,
        grossPower: normalizedGrossPower || null,
        status: initialListingStatus,
        media: normalizedMedia.length
          ? {
              create: normalizedMedia,
            }
          : undefined,
      },
      include: {
        media: true,
        category: {
          select: { id: true, name: true },
        },
        brand: {
          select: { id: true, name: true },
        },
        model: {
          select: { id: true, name: true },
        },
      },
    });

    await setListingSoldAt(listing.id, soldAt);
    const responseListing = await getOwnedListingForUser(listing.id, req.user.id);

    return res.status(201).json({
      message: 'Listing submitted successfully. It will go live after admin approval.',
      listing: responseListing || listing,
    });
  } catch (error) {
    next(error);
  }
};

export const getListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role === 'EMPLOYEE') {
      const permissions = await getEmployeePermissions(req.user.id);
      if (!permissions.includes('ALL_ACCESS') && !permissions.includes('listings.read')) {
        return res.status(403).json({ error: 'Listing access is not available for this account.' });
      }
    }

    const where =
      ['PARTNER', 'CUSTOMER'].includes(req.user.role)
        ? { partnerId: req.user.id }
        : ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)
          ? {}
          : null;

    if (!where) {
      return res.status(403).json({ error: 'Listing access is not available for this account.' });
    }

    const listings = await prismaAny.listing.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            partnerProfile: {
              select: {
                businessName: true,
                partnerType: true,
              },
            },
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
          },
        },
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
      },
    });

    return res.json({
      listings: listings.map((listing: any) => ({
        ...listing,
        dealer:
          listing.partner?.partnerProfile?.businessName ||
          listing.partner?.name ||
          listing.partner?.email ||
          'Unknown partner',
        dealerCategory: getDealerCategoryLabel(listing.partner),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getListingById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const listing = await prismaAny.listing.findUnique({
      where: { id: String(req.params.id || '') },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            partnerProfile: {
              select: {
                businessName: true,
                partnerType: true,
              },
            },
            customerPrimeSubscriptions: {
              where: {
                status: 'ACTIVE',
              },
              take: 1,
            },
          },
        },
        media: true,
        category: {
          select: { id: true, name: true },
        },
        brand: {
          select: { id: true, name: true },
        },
        model: {
          select: { id: true, name: true },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    const canAccessOwnedListing =
      ['PARTNER', 'CUSTOMER'].includes(req.user.role) && listing.partnerId === req.user.id;
    const canAccessAllListings = ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role);

    if (!canAccessOwnedListing && !canAccessAllListings) {
      return res.status(403).json({ error: 'You do not have access to this listing.' });
    }

    return res.json({
      listing: {
        ...listing,
        dealer:
          listing.partner?.partnerProfile?.businessName ||
          listing.partner?.name ||
          listing.partner?.email ||
          'Unknown partner',
        dealerCategory: getDealerCategoryLabel(listing.partner),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['PARTNER', 'CUSTOMER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Customer, partner, or admin access required.' });
    }

    if (req.user.role === 'EMPLOYEE') {
      const permissions = await getEmployeePermissions(req.user.id);
      if (
        !permissions.includes('ALL_ACCESS') &&
        !permissions.includes('listings.update') &&
        !permissions.includes('listings.approve')
      ) {
        return res.status(403).json({ error: 'You do not have permission to edit listings.' });
      }
    }

    const listingId = String(req.params.id || '');
    const isAdmin = ['SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role);
    const existingListing = isAdmin
      ? await prismaAny.listing.findUnique({
          where: { id: listingId },
          include: {
            category: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
            model: { select: { id: true, name: true } },
            media: true,
          },
        })
      : await getOwnedListingForUser(listingId, req.user.id);
      
    const isCustomer = req.user.role === 'CUSTOMER';
    const partnerProfile = isCustomer || isAdmin ? null : await getApprovedPartnerProfile(req.user.id);

    if (!existingListing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (!isAdmin && !isCustomer && !partnerProfile) {
      return res.status(403).json({
        error: 'Your partner account must complete KYC and receive super admin approval before updating listings.',
      });
    }

    if (isCustomer) {
      const primeEligibility = await assertCustomerPrimeEligibility({
        userId: req.user.id,
        role: req.user.role,
        feature: 'SELL_LISTING',
      });

      if (!primeEligibility.isAllowed) {
        return res.status(403).json({
          error: primeEligibility.pendingSubscription
            ? 'Your Prime payment is under review. Listing updates will unlock after verification.'
            : 'Prime customer subscription is required before updating vehicle listings.',
          code: primeEligibility.pendingSubscription ? 'PRIME_PAYMENT_PENDING' : 'PRIME_SUBSCRIPTION_REQUIRED',
        });
      }
    }

    const requestBody = req.body || {};
    const hasOwnField = (field: string) => Object.prototype.hasOwnProperty.call(requestBody, field);

    const {
      categoryId,
      brandName,
      modelName,
      title,
      status,
      price,
      isNegotiable,
      manufacturingYear,
      operatingHours,
      locationState,
      locationCity,
      condition,
      description,
      additionalDescription,
      grossPower,
      media,
    } = requestBody;

    const normalizedCategoryId = normalizeText(categoryId);
    const normalizedBrandName = normalizeText(brandName) || existingListing.brand?.name || 'Not specified';
    const normalizedModelName = normalizeText(modelName) || existingListing.model?.name || 'Not specified';
    const normalizedTitle = normalizeText(title);
    const normalizedStatus = normalizeListingStatus(status, existingListing.status || 'DRAFT');
    const nextStatus = isAdmin ? normalizedStatus : (existingListing.status || 'PENDING_APPROVAL');
    const normalizedState = normalizeText(locationState) || existingListing.locationState || 'Not specified';
    const normalizedCity = normalizeText(locationCity) || existingListing.locationCity || 'Not specified';
    const normalizedCondition = hasOwnField('condition') ? normalizeText(condition) : existingListing.condition;
    const normalizedDescription = hasOwnField('description') ? normalizeText(description) : existingListing.description;
    const normalizedAdditionalDescription = hasOwnField('additionalDescription')
      ? normalizeText(additionalDescription)
      : existingListing.additionalDescription;
    const normalizedGrossPower = hasOwnField('grossPower') ? normalizeText(grossPower) : existingListing.grossPower;
    const parsedYear = parseInteger(manufacturingYear) || existingListing.manufacturingYear || new Date().getFullYear();
    const parsedOperatingHours = hasOwnField('operatingHours')
      ? parseInteger(operatingHours)
      : existingListing.operatingHours;
    const parsedPrice = hasOwnField('price')
      ? parseDecimal(price) || new Prisma.Decimal(existingListing.price || 0)
      : new Prisma.Decimal(existingListing.price || 0);
    const hasMediaField = hasOwnField('media');
    const normalizedMedia = hasMediaField
      ? normalizeMedia(media)
      : existingListing.media.map((item: { url: string; type: string; isFeatured: boolean }) => ({
          url: item.url,
          type: item.type,
          slot: (item as any).slot || (item.isFeatured && item.type === 'IMAGE' ? 'front-view' : null),
          isFeatured: item.isFeatured,
        }));
    const nextIsNegotiable = hasOwnField('isNegotiable')
      ? Boolean(isNegotiable)
      : Boolean(existingListing.isNegotiable);
    const soldAt = getSoldAtValueForStatus({
      nextStatus,
      previousStatus: existingListing.status,
      previousSoldAt: existingListing.soldAt,
    });
    const payloadValidationError = validateListingPayload({
      categoryId: normalizedCategoryId || existingListing.category?.id || '',
      brandName: normalizedBrandName,
      modelName: normalizedModelName,
      title: normalizedTitle || `${normalizedBrandName} ${normalizedModelName}`.trim(),
      price: parsedPrice,
      manufacturingYear: parsedYear,
      locationState: normalizedState,
      locationCity: normalizedCity,
      description: normalizedDescription,
      media: normalizedMedia,
    });

    if (payloadValidationError) {
      return res.status(400).json({ error: payloadValidationError });
    }

    let category = normalizedCategoryId
      ? await getSelectableCategory(normalizedCategoryId, partnerProfile?.id || '')
      : existingListing.category;

    if (!category) {
      category = await getOrCreateFallbackCategory(partnerProfile?.id || '');
    }

    const brand = await prismaAny.brand.upsert({
      where: { name: normalizedBrandName },
      update: {},
      create: { name: normalizedBrandName },
      select: { id: true, name: true },
    });

    let model = await prismaAny.model.findFirst({
      where: {
        brandId: brand.id,
        name: normalizedModelName,
      },
      select: { id: true, name: true },
    });

    if (!model) {
      model = await prismaAny.model.create({
        data: {
          brandId: brand.id,
          name: normalizedModelName,
        },
        select: { id: true, name: true },
      });
    }

    if (hasMediaField) {
      await prismaAny.media.deleteMany({
        where: { listingId },
      });
    }

    const updatedListing = await prismaAny.listing.update({
      where: { id: listingId },
      data: {
        categoryId: category.id,
        brandId: brand.id,
        modelId: model.id,
        title: normalizedTitle || `${brand.name} ${model.name}`.trim() || 'Untitled listing',
        price: parsedPrice,
        isNegotiable: nextIsNegotiable,
        manufacturingYear: parsedYear,
        operatingHours: parsedOperatingHours,
        locationState: normalizedState,
        locationCity: normalizedCity,
        condition: normalizedCondition || null,
        description: normalizedDescription || null,
        additionalDescription: normalizedAdditionalDescription || null,
        grossPower: normalizedGrossPower || null,
        status: nextStatus,
        media: hasMediaField && normalizedMedia.length
          ? {
              create: normalizedMedia,
            }
          : undefined,
      },
      include: {
        media: true,
        category: {
          select: { id: true, name: true },
        },
        brand: {
          select: { id: true, name: true },
        },
        model: {
          select: { id: true, name: true },
        },
      },
    });

    await setListingSoldAt(updatedListing.id, soldAt);

    const responseListing = await getOwnedListingForUser(updatedListing.id, req.user.id);

    return res.json({
      message: isAdmin
        ? 'Listing updated successfully.'
        : isPublicListingStatus(existingListing.status)
          ? 'Listing updated successfully. Your approved listing remains live.'
          : 'Listing updated successfully. Approval status is unchanged.',
      listing: responseListing || updatedListing,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['PARTNER', 'CUSTOMER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (req.user.role === 'EMPLOYEE') {
      const permissions = await getEmployeePermissions(req.user.id);
      if (!permissions.includes('ALL_ACCESS') && !permissions.includes('listings.delete')) {
        return res.status(403).json({ error: 'You do not have permission to delete listings.' });
      }
    }

    const listingId = String(req.params.id || '');
    const isAdmin = ['SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role);
    const existingListing = isAdmin
      ? await prismaAny.listing.findUnique({
          where: { id: listingId },
          include: {
            partner: {
              select: {
                id: true,
                role: true,
              },
            },
          },
        })
      : await getOwnedListingForUser(listingId, req.user.id);

    if (!existingListing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (existingListing.partner?.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super admin listings cannot be deleted.' });
    }

    await prismaAny.$transaction(async (tx: any) => {
      await detachLeadsFromListing(tx, existingListing);

      await tx.media.deleteMany({
        where: { listingId },
      });

      await tx.listing.delete({
        where: { id: listingId },
      });
    });

    return res.json({ message: 'Listing deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

export const updateListingStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !['SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin approval access required.' });
    }

    if (req.user.role === 'EMPLOYEE') {
      const permissions = await getEmployeePermissions(req.user.id);
      if (!permissions.includes('ALL_ACCESS') && !permissions.includes('listings.approve')) {
        return res.status(403).json({ error: 'You do not have permission to approve listings.' });
      }
    }

    const listingId = String(req.params.id || '');
    const requestedStatus = normalizeListingStatus(req.body?.status, '');

    if (!['PUBLISHED', 'CHANGES_REQUESTED'].includes(requestedStatus)) {
      return res.status(400).json({ error: 'Invalid approval status.' });
    }

    const existingListing = await prismaAny.listing.findUnique({
      where: { id: listingId },
      include: {
        media: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        model: { select: { id: true, name: true } },
      },
    });

    if (!existingListing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (!isReviewPendingStatus(existingListing.status) && requestedStatus === 'PUBLISHED') {
      return res.status(400).json({ error: 'Only pending listings can be approved.' });
    }

    const soldAt = getSoldAtValueForStatus({
      nextStatus: requestedStatus,
      previousStatus: existingListing.status,
      previousSoldAt: existingListing.soldAt,
    });

    const updatedListing = await prismaAny.listing.update({
      where: { id: listingId },
      data: { status: requestedStatus },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            partnerProfile: {
              select: {
                businessName: true,
                partnerType: true,
              },
            },
            customerPrimeSubscriptions: {
              where: { status: 'ACTIVE' },
              take: 1,
            },
          },
        },
        media: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        model: { select: { id: true, name: true } },
      },
    });

    await setListingSoldAt(updatedListing.id, soldAt);

    if (requestedStatus === 'PUBLISHED' && !isPublicListingStatus(existingListing.status)) {
      await createCustomerListingNotifications({
        listingId: updatedListing.id,
        creatorUserId: updatedListing.partnerId,
        creatorRole: updatedListing.partner?.role || 'PARTNER',
        title: updatedListing.title,
        price: updatedListing.price,
        locationCity: updatedListing.locationCity,
        locationState: updatedListing.locationState,
        categoryName: updatedListing.category?.name,
      });
    }

    return res.json({
      message:
        requestedStatus === 'PUBLISHED'
          ? 'Listing approved and published successfully.'
          : 'Listing marked as changes requested.',
      listing: {
        ...updatedListing,
        dealer:
          updatedListing.partner?.partnerProfile?.businessName ||
          updatedListing.partner?.name ||
          updatedListing.partner?.email ||
          'Unknown partner',
        dealerCategory: getDealerCategoryLabel(updatedListing.partner),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateListingAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['PARTNER', 'CUSTOMER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Customer, partner, or admin access required.' });
    }

    if (req.user.role === 'EMPLOYEE') {
      const permissions = await getEmployeePermissions(req.user.id);
      if (!permissions.includes('ALL_ACCESS') && !permissions.includes('listings.update')) {
        return res.status(403).json({ error: 'You do not have permission to edit listings.' });
      }
    }

    const listingId = String(req.params.id || '');
    const { status } = req.body;
    const isAdmin = ['SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role);

    const existingListing = isAdmin
      ? await prismaAny.listing.findUnique({ where: { id: listingId } })
      : await getOwnedListingForUser(listingId, req.user.id);
      
    if (!existingListing) {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (req.user.role === 'CUSTOMER') {
      const primeEligibility = await assertCustomerPrimeEligibility({
        userId: req.user.id,
        role: req.user.role,
        feature: 'SELL_LISTING',
      });

      if (!primeEligibility.isAllowed) {
        return res.status(403).json({
          error: primeEligibility.pendingSubscription
            ? 'Your Prime payment is under review. Listing changes will unlock after verification.'
            : 'Prime customer subscription is required before changing listing availability.',
          code: primeEligibility.pendingSubscription ? 'PRIME_PAYMENT_PENDING' : 'PRIME_SUBSCRIPTION_REQUIRED',
        });
      }
    }

    const normalizedStatus = normalizeListingStatus(status, existingListing.status || 'DRAFT');

    if (!isAdmin) {
      if (normalizedStatus === 'PENDING_APPROVAL') {
        return res.status(400).json({ error: 'Approval status is controlled by admin and cannot be changed here.' });
      }

      if (isReviewPendingStatus(existingListing.status)) {
        return res.status(400).json({ error: 'This listing is awaiting approval. Availability can be updated after approval.' });
      }
    }

    const soldAt = getSoldAtValueForStatus({
      nextStatus: normalizedStatus,
      previousStatus: existingListing.status,
      previousSoldAt: existingListing.soldAt,
    });

    const updatedListing = await prismaAny.listing.update({
      where: { id: listingId },
      data: {
        status: normalizedStatus,
      },
      include: {
        media: true,
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        model: { select: { id: true, name: true } },
      }
    });

    await setListingSoldAt(updatedListing.id, soldAt);

    const responseListing = await getOwnedListingForUser(updatedListing.id, req.user.id);

    return res.json({
      message: 'Availability updated successfully.',
      listing: responseListing || updatedListing,
    });
  } catch (error) {
    next(error);
  }
};
