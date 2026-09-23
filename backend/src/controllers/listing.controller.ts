import { Prisma } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { deleteFileFromDrive } from '../services/googleDrive.service';
import prisma from '../lib/prisma';
import { detachLeadsFromListing, getSoldAtValueForStatus, getSoldListingCutoff, setListingSoldAt } from '../utils/soldListingRetention';
import { assertCustomerPrimeEligibility } from '../utils/customerPrimeSubscriptions';
import { isPublicMarketplaceListingVisible } from '../utils/publicListingVisibility';
import { PushNotificationService } from '../services/pushNotification.service';
import { detectRazorpayModeFromKeyId, getAppSettings } from '../utils/appSettings';
import { finalizeListingPaymentSale } from '../utils/listingPaymentFinalization';
import { dispatchMarketplaceWhatsApp, dispatchPublishedWhatsApp } from '../services/whatsappIntegration.service';
import { dispatchPublishedSms } from '../services/smsIntegration.service';
import { shouldDispatchSmsPublishedBroadcast } from '../modules/sms-core';
import { syncListingRtoForListing } from '../services/listingRto.service';
import { getRenderableMediaUrl, normalizeListingMedia, normalizeRemoteMediaUrl } from '../utils/mediaUrl';
import { getDriveFileIdsToDelete } from '../utils/driveMediaLifecycle';

const prismaAny = prisma as any;
const latestListingRtoRecords = {
  orderBy: { updatedAt: 'desc' },
  take: 1,
};
const REVIEW_PENDING_STATUSES = ['PENDING_APPROVAL', 'CHANGES_REQUESTED'] as const;
const PUBLIC_LISTING_STATUSES = ['PUBLISHED', 'PAUSED', 'RESERVED', 'SOLD'] as const;

const isReviewPendingStatus = (status?: string | null) =>
  REVIEW_PENDING_STATUSES.includes(String(status || '').toUpperCase() as (typeof REVIEW_PENDING_STATUSES)[number]);

const isPublicListingStatus = (status?: string | null) =>
  PUBLIC_LISTING_STATUSES.includes(String(status || '').toUpperCase() as (typeof PUBLIC_LISTING_STATUSES)[number]);

const sanitizeListingPaymentSettings = (settings: Awaited<ReturnType<typeof getAppSettings>>['listingPayment']) => ({
  rtgs: {
    ...settings.rtgs,
    enabled: Boolean(
      settings.rtgs.enabled &&
      settings.rtgs.beneficiaryName &&
      settings.rtgs.bankName &&
      settings.rtgs.accountNumber &&
      settings.rtgs.ifscCode,
    ),
  },
  razorpay: {
    enabled: Boolean(
      settings.razorpay.enabled &&
      detectRazorpayModeFromKeyId(settings.razorpay.keyId) &&
      settings.razorpay.keySecret,
    ),
    keyId: settings.razorpay.keyId,
    mode: detectRazorpayModeFromKeyId(settings.razorpay.keyId) || settings.razorpay.mode,
  },
  phonepe: {
    enabled: Boolean(
      settings.phonepe.enabled &&
      settings.phonepe.clientId &&
      settings.phonepe.clientSecret &&
      settings.phonepe.clientVersion,
    ),
    mode: settings.phonepe.mode,
  },
});

const getPhonePeApiBaseUrl = (mode: 'TEST' | 'LIVE') =>
  mode === 'LIVE'
    ? 'https://api.phonepe.com/apis/pg'
    : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

class PhonePeGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhonePeGatewayError';
  }
}

const getPhonePeAuthToken = async (settings: Awaited<ReturnType<typeof getAppSettings>>['listingPayment']['phonepe']) => {
  try {
    const tokenResponse = await fetch(
      settings.mode === 'LIVE'
        ? 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: settings.clientId || '',
          client_version: settings.clientVersion || '1',
          client_secret: settings.clientSecret || '',
          grant_type: 'client_credentials',
        }),
      },
    );

    const tokenPayload = await tokenResponse.json() as { access_token?: string; token_type?: string; message?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new PhonePeGatewayError(tokenPayload.message || 'PhonePe authorization failed. Check Client ID, Client Secret, and Client Version.');
    }

    return `${tokenPayload.token_type || 'O-Bearer'} ${tokenPayload.access_token}`;
  } catch (error) {
    if (error instanceof PhonePeGatewayError) {
      throw error;
    }

    throw new PhonePeGatewayError('Unable to reach PhonePe payment gateway.');
  }
};

const getRequestOrigin = (req: Request) => {
  const origin = req.get('origin') || req.get('referer');
  if (!origin) {
    return null;
  }

  try {
    const parsedUrl = new URL(origin);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch {
    return null;
  }
};

const getPaymentReadyListing = async (listingId: string) =>
  prismaAny.listing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      partnerId: true,
      partner: {
        select: {
          mobile: true,
          whatsappNumber: true,
          role: true,
          status: true,
          partnerProfile: {
            select: {
              onboardingStatus: true,
              accountStatus: true,
              kycStatus: true,
            },
          },
        },
      },
    },
  });

const findBlockingListingPayment = async (listingId: string, buyerId?: string) =>
  prismaAny.listingPaymentSubmission.findFirst({
    where: {
      listingId,
      OR: [
        { status: { in: ['PAID', 'APPROVED'] } },
        {
          status: 'PENDING_VERIFICATION',
          method: { not: 'PHONEPE' },
        },
      ],
      ...(buyerId ? { buyerId: { not: buyerId } } : {}),
    },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      status: true,
      method: true,
    },
  });

const assertListingCanAcceptPayment = (listing: Awaited<ReturnType<typeof getPaymentReadyListing>>) => {
  if (!listing) {
    return 'Listing not found.';
  }

  if (!isPublicMarketplaceListingVisible(listing as any)) {
    return 'Listing is not available for purchase.';
  }

  if (listing.status === 'SOLD') {
    return 'This listing is already sold.';
  }

  return null;
};

const isOwnedListingPubliclyVisible = (listing: {
  status?: string | null;
  soldAt?: Date | null;
  updatedAt?: Date | null;
  partner?: {
    role?: string | null;
    status?: string | null;
    partnerProfile?: {
      onboardingStatus?: string | null;
      accountStatus?: string | null;
      kycStatus?: string | null;
    } | null;
  } | null;
}) => {
  if (!isPublicMarketplaceListingVisible(listing)) {
    return false;
  }

  if (String(listing.status || '').toUpperCase() !== 'SOLD') {
    return true;
  }

  const cutoff = getSoldListingCutoff(new Date());
  if (listing.soldAt) {
    return listing.soldAt >= cutoff;
  }

  return !!listing.updatedAt && listing.updatedAt >= cutoff;
};

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

      const fileUrl = getRenderableMediaUrl(item);
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

const serializeListingMediaForResponse = <T extends { media?: unknown }>(listing: T) => ({
  ...listing,
  media: normalizeListingMedia(listing.media),
});

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

const extractSaleRecordPayload = (body: any) => {
  const source = body?.buyerDetails || body || {};
  const buyerName = normalizeText(source.buyerName);
  const buyerPhone = normalizeText(source.buyerPhone);
  const buyerCity = normalizeText(source.buyerCity);
  const buyerState = normalizeText(source.buyerState);
  const soldPrice = source.soldPrice || source.agreedPrice || source.price;
  const soldAt = source.soldAt;
  const invoiceNo = normalizeText(source.invoiceNo);
  const notes = normalizeText(source.notes);

  if (!buyerName || !buyerPhone) {
    return null;
  }

  const parsedPrice = parseDecimal(soldPrice) || new Prisma.Decimal(0);
  const parsedSoldAt = soldAt ? new Date(soldAt) : new Date();

  return {
    buyerName,
    buyerPhone,
    buyerCity: buyerCity || null,
    buyerState: buyerState || null,
    soldPrice: parsedPrice,
    soldAt: parsedSoldAt,
    invoiceNo: invoiceNo || null,
    notes: notes || null,
  };
};

const handleSaleRecordUpsert = async (listingId: string, status: string, body: any) => {
  if (status !== 'SOLD') {
    await prismaAny.saleRecord.deleteMany({
      where: { listingId },
    });
    return;
  }

  const payload = extractSaleRecordPayload(body);
  if (!payload) {
    return;
  }

  await prismaAny.saleRecord.upsert({
    where: { listingId },
    update: payload,
    create: {
      listingId,
      ...payload,
    },
  });
};

const getOwnedListingForUser = async (listingId: string, userId: string) => {
  const listing = await prismaAny.listing.findUnique({
    where: { id: listingId },
    include: {
      partner: {
        select: {
          id: true,
          role: true,
          status: true,
          partnerProfile: {
            select: {
              onboardingStatus: true,
              accountStatus: true,
              kycStatus: true,
            },
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
      saleRecord: true,
      rtoRecords: latestListingRtoRecords,
    },
  });

  if (!listing || listing.partnerId !== userId) {
    return null;
  }

  return {
    ...listing,
    isPubliclyVisible: isOwnedListingPubliclyVisible(listing),
  };
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

  const notificationTitle = `New ${categoryName || 'vehicle'} listed: ${title}`;
  const notificationMessage = [
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

  // Fire push notifications asynchronously
  PushNotificationService.sendToUsers(
    recipients.map(r => r.id),
    {
      title: notificationTitle,
      body: notificationMessage,
      icon: '/icon.png',
      url: `/machines/${listingId}`
    }
  ).catch(e => console.error('Push bulk failed:', e));
};

export const createListing = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const authenticatedUserId = req.user.id;

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
      address,
      condition,
      description,
      additionalDescription,
      grossPower,
      media,
    } = req.body || {};
    const rtoDetails = req.body?.rtoDetails;

    const normalizedCategoryId = normalizeText(categoryId);
    const normalizedBrandName = normalizeText(brandName) || 'Not specified';
    const normalizedModelName = normalizeText(modelName) || 'Not specified';
    const normalizedTitle = normalizeText(title);
    const normalizedStatus = normalizeListingStatus(status, 'PENDING_APPROVAL');
    const initialListingStatus = isCustomer || req.user.role === 'PARTNER' ? 'PENDING_APPROVAL' : normalizedStatus;
    const normalizedState = normalizeText(locationState) || 'Not specified';
    const normalizedCity = normalizeText(locationCity) || 'Not specified';
    const normalizedAddress = normalizeText(address);
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

    const listing = await prismaAny.$transaction(async (tx: any) => {
      const createdListing = await tx.listing.create({
        data: {
          partnerId: authenticatedUserId,
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
          address: normalizedAddress || null,
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
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          model: { select: { id: true, name: true } },
        },
      });

      if (rtoDetails && typeof rtoDetails === 'object') {
        await syncListingRtoForListing(tx, createdListing.id, rtoDetails);
      }

      return createdListing;
    });

    await setListingSoldAt(listing.id, soldAt);
    await handleSaleRecordUpsert(listing.id, initialListingStatus, req.body);
    const responseListing = await getOwnedListingForUser(listing.id, req.user.id);

    // The customer listing push notifications are fired inside createCustomerListingNotifications
    return res.status(201).json({
      message: 'Listing submitted successfully. It will go live after admin approval.',
      listing: serializeListingMediaForResponse(responseListing || listing),
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

    const requestedId = req.query.id ? String(req.query.id).trim() : '';
    const requestedPrefix = req.query.prefix ? String(req.query.prefix).trim() : '';
    const where =
      ['PARTNER', 'CUSTOMER'].includes(req.user.role)
        ? {
            partnerId: req.user.id,
            ...(requestedId ? { id: requestedId } : {}),
            ...(!requestedId && requestedPrefix ? { id: { startsWith: requestedPrefix } } : {}),
          }
        : ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)
          ? {
              ...(requestedId ? { id: requestedId } : {}),
              ...(!requestedId && requestedPrefix ? { id: { startsWith: requestedPrefix } } : {}),
            }
          : null;
    const compact = String(req.query.compact || '').toLowerCase() === 'true';

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
            status: true,
            partnerProfile: {
              select: {
                businessName: true,
                partnerType: true,
                onboardingStatus: true,
                accountStatus: true,
                kycStatus: true,
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
          ...(compact ? { where: { type: 'IMAGE' }, take: 1 } : {}),
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
        saleRecord: true,
        rtoRecords: latestListingRtoRecords,
      },
    });

    return res.json({
      listings: listings.map((listing: any) => ({
        ...serializeListingMediaForResponse(listing),
        isPubliclyVisible: isOwnedListingPubliclyVisible(listing),
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
        saleRecord: true,
        rtoRecords: latestListingRtoRecords,
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
        ...serializeListingMediaForResponse(listing),
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

      if (String(existingListing.status || '').toUpperCase() === 'SOLD') {
        return res.status(403).json({
          error: 'Sold customer listings are view-only and cannot be edited after sale.',
        });
      }
    }

    const requestBody = req.body || {};
    const hasOwnField = (field: string) => Object.prototype.hasOwnProperty.call(requestBody, field);
    const rtoDetails = requestBody.rtoDetails;

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
      address,
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
    const nextStatus = isAdmin
      ? normalizedStatus
      : hasOwnField('status') && !isReviewPendingStatus(existingListing.status)
        ? normalizedStatus
        : (existingListing.status || 'PENDING_APPROVAL');
    const normalizedState = normalizeText(locationState) || existingListing.locationState || 'Not specified';
    const normalizedCity = normalizeText(locationCity) || existingListing.locationCity || 'Not specified';
    const normalizedAddress = hasOwnField('address')
      ? normalizeText(address)
      : (existingListing.address || '');
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

    const driveFileIdsToDelete: string[] = hasMediaField
      ? getDriveFileIdsToDelete(
          existingListing.media.map((item: { url: string }) => item.url),
          normalizedMedia.map((item: { url: string }) => item.url),
        )
      : [];

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

    const updatedListing = await prismaAny.$transaction(async (tx: any) => {
      if (hasMediaField) {
        await tx.media.deleteMany({ where: { listingId } });
      }

      const nextListing = await tx.listing.update({
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
        address: normalizedAddress || null,
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

      if (rtoDetails && typeof rtoDetails === 'object') {
        await syncListingRtoForListing(tx, nextListing.id, rtoDetails);
      }

      return nextListing;
    });

    await setListingSoldAt(updatedListing.id, soldAt);
    await handleSaleRecordUpsert(updatedListing.id, nextStatus, req.body);

    await Promise.all(driveFileIdsToDelete.map((fileId) => deleteFileFromDrive(fileId)));

    const responseListing = await getOwnedListingForUser(updatedListing.id, req.user.id);

    return res.json({
      message: isAdmin
        ? 'Listing updated successfully.'
        : isPublicListingStatus(existingListing.status)
          ? 'Listing updated successfully. Your approved listing remains live.'
          : 'Listing updated successfully. Approval status is unchanged.',
      listing: serializeListingMediaForResponse(responseListing || updatedListing),
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

    if (req.user.role === 'CUSTOMER' && String(existingListing.status || '').toUpperCase() === 'SOLD') {
      return res.status(403).json({
        error: 'Sold customer listings are view-only and cannot be deleted after sale.',
      });
    }

    const oldMediaUrls = await prismaAny.$transaction(async (tx: any) => {
      await detachLeadsFromListing(tx, existingListing);

      const oldMedia = await tx.media.findMany({
        where: { listingId },
        select: { url: true }
      });

      await tx.media.deleteMany({
        where: { listingId },
      });

      await tx.listing.delete({
        where: { id: listingId },
      });

      return oldMedia.map((media: { url: string }) => media.url);
    });

    const driveFileIdsToDelete = getDriveFileIdsToDelete(oldMediaUrls, []);
    await Promise.all(driveFileIdsToDelete.map((fileId) => deleteFileFromDrive(fileId)));

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

    if (shouldDispatchSmsPublishedBroadcast({ previousStatus: existingListing.status, nextStatus: requestedStatus })) {
      const publishedPayload = {
        listingId: updatedListing.id,
        listingTitle: updatedListing.title,
        vehicleShortTitle: [updatedListing.manufacturingYear, updatedListing.brand?.name, updatedListing.model?.name]
          .filter((value) => value !== undefined && value !== null && String(value).trim())
          .join(' ') || updatedListing.title,
        listingStatus: updatedListing.status,
        categoryName: updatedListing.category?.name,
        brandName: updatedListing.brand?.name,
        modelName: updatedListing.model?.name,
        locationCity: updatedListing.locationCity,
        locationState: updatedListing.locationState,
      };
      void dispatchPublishedSms({
        eventCode: 'MARKETPLACE_NEW_LISTING_PUBLISHED',
        relatedEntityType: 'LISTING',
        relatedEntityId: updatedListing.id,
        payloadSnapshot: publishedPayload,
      });
      void dispatchPublishedWhatsApp({
        eventCode: 'MARKETPLACE_NEW_LISTING_PUBLISHED',
        relatedEntityType: 'LISTING',
        relatedEntityId: updatedListing.id,
        payloadSnapshot: publishedPayload,
      });
    }

    return res.json({
      message:
        requestedStatus === 'PUBLISHED'
          ? 'Listing approved and published successfully.'
          : 'Listing marked as changes requested.',
      listing: {
        ...serializeListingMediaForResponse(updatedListing),
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

      if (String(existingListing.status || '').toUpperCase() === 'SOLD') {
        return res.status(403).json({
          error: 'Sold customer listings are view-only and cannot change availability after sale.',
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
    await handleSaleRecordUpsert(updatedListing.id, normalizedStatus, req.body);

    const responseListing = await getOwnedListingForUser(updatedListing.id, req.user.id);

    return res.json({
      message: 'Availability updated successfully.',
      listing: serializeListingMediaForResponse(responseListing || updatedListing),
    });
  } catch (error) {
    next(error);
  }
};

export const getListingPaymentSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const listingId = String(req.params.id || '').trim();
    const listing = await getPaymentReadyListing(listingId);
    const listingError = assertListingCanAcceptPayment(listing);

    if (listingError) {
      return res.status(listingError === 'Listing not found.' ? 404 : 400).json({ error: listingError });
    }

    const settings = (await getAppSettings()).listingPayment;
    const publicSettings = sanitizeListingPaymentSettings(settings);

    const existingSubmission = req.user?.id
      ? await prismaAny.listingPaymentSubmission.findFirst({
          where: {
            listingId: listing!.id,
            buyerId: req.user.id,
            OR: [
              { status: { in: ['PAID', 'APPROVED'] } },
              {
                status: 'PENDING_VERIFICATION',
                method: { not: 'PHONEPE' },
              },
            ],
          },
          orderBy: { submittedAt: 'desc' },
          select: {
            id: true,
            method: true,
            status: true,
            amount: true,
            transactionRef: true,
            receiptUrl: true,
            paymentNote: true,
            submittedAt: true,
          },
        })
      : null;

    res.json({
      success: true,
      listing: {
        id: listing!.id,
        title: listing!.title,
        amount: Number(listing!.price || 0),
      },
      paymentSettings: publicSettings,
      existingSubmission: existingSubmission
        ? {
            ...existingSubmission,
            amount: Number(existingSubmission.amount || 0),
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

const mapPartnerListingPaymentSubmission = (payment: any) => ({
  ...payment,
  amount: Number(payment.amount || 0),
  listing: payment.listing
    ? {
      ...payment.listing,
      price: Number(payment.listing.price || 0),
    }
    : null,
});

export const getPartnerListingPaymentSubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'PARTNER') {
      return res.status(403).json({ error: 'Partner account is required.' });
    }

    const payments = await prismaAny.listingPaymentSubmission.findMany({
      where: {
        partnerId: req.user.id,
      },
      orderBy: {
        submittedAt: 'desc',
      },
      take: 100,
      select: {
        id: true,
        method: true,
        status: true,
        amount: true,
        transactionRef: true,
        receiptUrl: true,
        paymentNote: true,
        razorpayPaymentId: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
            mobile: true,
          },
        },
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
          },
        },
      },
    });

    res.json({
      success: true,
      payments: payments.map(mapPartnerListingPaymentSubmission),
    });
  } catch (error) {
    next(error);
  }
};

export const getCustomerListingPaymentSubmissions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Customer account is required.' });
    }

    const payments = await prismaAny.listingPaymentSubmission.findMany({
      where: {
        buyerId: req.user.id,
      },
      orderBy: {
        submittedAt: 'desc',
      },
      take: 100,
      select: {
        id: true,
        method: true,
        status: true,
        amount: true,
        transactionRef: true,
        receiptUrl: true,
        paymentNote: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            status: true,
          },
        },
      },
    });

    res.json({
      success: true,
      payments: payments.map(mapPartnerListingPaymentSubmission),
    });
  } catch (error) {
    next(error);
  }
};

export const createListingRazorpayOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Buy Now payments are available for customers only.' });
    }

    const listingId = String(req.params.id || '').trim();
    const listing = await getPaymentReadyListing(listingId);
    const listingError = assertListingCanAcceptPayment(listing);

    if (listingError) {
      return res.status(listingError === 'Listing not found.' ? 404 : 400).json({ error: listingError });
    }

    if (listing!.partnerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot buy your own listing.' });
    }

    const blockingPayment = await findBlockingListingPayment(listing!.id);
    if (blockingPayment) {
      return res.status(409).json({ error: 'This listing already has a payment in progress or completed.' });
    }

    const settings = (await getAppSettings()).listingPayment;
    if (!settings.razorpay.enabled || !settings.razorpay.keyId || !settings.razorpay.keySecret) {
      return res.status(400).json({ error: 'Razorpay is not configured for listing payments.' });
    }

    const amountInPaise = Math.round(Number(listing!.price || 0) * 100);
    if (!amountInPaise || amountInPaise <= 0) {
      return res.status(400).json({ error: 'Listing amount is invalid.' });
    }

    const credentials = Buffer.from(`${settings.razorpay.keyId}:${settings.razorpay.keySecret}`).toString('base64');
    const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: `listing_${listing!.id.slice(0, 24)}`,
        notes: {
          listingId: listing!.id,
          buyerId: req.user.id,
        },
      }),
    });

    const orderPayload = await orderResponse.json() as { id?: string; error?: { description?: string } };
    if (!orderResponse.ok || !orderPayload.id) {
      return res.status(502).json({ error: orderPayload.error?.description || 'Unable to create Razorpay order.' });
    }

    res.json({
      success: true,
      order: {
        id: orderPayload.id,
        amount: amountInPaise,
        currency: 'INR',
        keyId: settings.razorpay.keyId,
        listingTitle: listing!.title,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createListingPhonePeOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Buy Now payments are available for customers only.' });
    }

    const listingId = String(req.params.id || '').trim();
    const listing = await getPaymentReadyListing(listingId);
    const listingError = assertListingCanAcceptPayment(listing);

    if (listingError) {
      return res.status(listingError === 'Listing not found.' ? 404 : 400).json({ error: listingError });
    }

    if (listing!.partnerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot buy your own listing.' });
    }

    const blockingPayment = await findBlockingListingPayment(listing!.id);
    if (blockingPayment) {
      return res.status(409).json({ error: 'This listing already has a payment in progress or completed.' });
    }

    const settings = (await getAppSettings()).listingPayment;
    if (!settings.phonepe.enabled || !settings.phonepe.clientId || !settings.phonepe.clientSecret || !settings.phonepe.clientVersion) {
      return res.status(400).json({ error: 'PhonePe is not configured for listing payments.' });
    }

    const amountInPaise = Math.round(Number(listing!.price || 0) * 100);
    if (!amountInPaise || amountInPaise < 100) {
      return res.status(400).json({ error: 'Listing amount is invalid.' });
    }

    const requestOrigin = getRequestOrigin(req);
    if (!requestOrigin) {
      return res.status(400).json({ error: 'Unable to resolve checkout return URL.' });
    }

    const merchantOrderId = `listing_${listing!.id.slice(0, 18)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const redirectUrl = `${requestOrigin}/payments/phonepe-return?listingId=${encodeURIComponent(listing!.id)}&merchantOrderId=${encodeURIComponent(merchantOrderId)}`;
    const authorization = await getPhonePeAuthToken(settings.phonepe);
    const orderResponse = await fetch(`${getPhonePeApiBaseUrl(settings.phonepe.mode)}/checkout/v2/pay`, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchantOrderId,
        amount: amountInPaise,
        expireAfter: 1200,
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: `JCB Exchange listing payment: ${listing!.title}`,
          merchantUrls: {
            redirectUrl,
          },
        },
        metaInfo: {
          udf1: listing!.id,
          udf2: req.user.id,
        },
      }),
    });

    const orderPayload = await orderResponse.json() as { orderId?: string; state?: string; redirectUrl?: string; message?: string };
    if (!orderResponse.ok || !orderPayload.redirectUrl) {
      return res.status(502).json({ error: orderPayload.message || 'Unable to create PhonePe payment.' });
    }

    await prismaAny.listingPaymentSubmission.updateMany({
      where: {
        listingId: listing!.id,
        buyerId: req.user.id,
        method: 'PHONEPE',
        status: 'PENDING_VERIFICATION',
      },
      data: {
        status: 'FAILED',
        rejectionReason: 'Customer restarted PhonePe checkout before completion.',
      },
    });

    await prismaAny.listingPaymentSubmission.create({
      data: {
        listingId: listing!.id,
        buyerId: req.user.id,
        partnerId: listing!.partnerId,
        method: 'PHONEPE',
        status: 'PENDING_VERIFICATION',
        amount: listing!.price,
        transactionRef: merchantOrderId,
        phonepeMerchantOrderId: merchantOrderId,
        phonepeOrderId: orderPayload.orderId || null,
        settingsSnapshot: sanitizeListingPaymentSettings(settings),
      },
    });

    res.json({
      success: true,
      order: {
        merchantOrderId,
        orderId: orderPayload.orderId || null,
        amount: amountInPaise,
        currency: 'INR',
        redirectUrl: orderPayload.redirectUrl,
        listingTitle: listing!.title,
      },
    });
  } catch (error) {
    if (error instanceof PhonePeGatewayError) {
      return res.status(502).json({ error: error.message });
    }

    next(error);
  }
};

export const verifyListingPhonePeOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Buy Now payments are available for customers only.' });
    }

    const listingId = String(req.params.id || '').trim();
    const merchantOrderId = String(req.body?.merchantOrderId || '').trim();

    if (!merchantOrderId) {
      return res.status(400).json({ error: 'PhonePe merchant order ID is required.' });
    }

    const existingPayment = await prismaAny.listingPaymentSubmission.findFirst({
      where: {
        listingId,
        buyerId: req.user.id,
        phonepeMerchantOrderId: merchantOrderId,
        method: 'PHONEPE',
      },
      orderBy: { submittedAt: 'desc' },
    });

    if (!existingPayment) {
      return res.status(404).json({ error: 'PhonePe payment record was not found.' });
    }

    const settings = (await getAppSettings()).listingPayment;
    if (!settings.phonepe.enabled || !settings.phonepe.clientId || !settings.phonepe.clientSecret || !settings.phonepe.clientVersion) {
      return res.status(400).json({ error: 'PhonePe is not configured for listing payments.' });
    }

    const authorization = await getPhonePeAuthToken(settings.phonepe);
    const statusResponse = await fetch(
      `${getPhonePeApiBaseUrl(settings.phonepe.mode)}/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=true`,
      {
        method: 'GET',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
      },
    );

    const statusPayload = await statusResponse.json() as {
      orderId?: string;
      state?: string;
      amount?: number;
      message?: string;
      paymentDetails?: Array<{ transactionId?: string; state?: string }>;
    };

    if (!statusResponse.ok) {
      return res.status(502).json({ error: statusPayload.message || 'Unable to verify PhonePe payment status.' });
    }

    const latestTransaction = statusPayload.paymentDetails?.find((detail) => detail.state === 'COMPLETED') || statusPayload.paymentDetails?.[0];
    const nextStatus = statusPayload.state === 'COMPLETED'
      ? 'PAID'
      : statusPayload.state === 'FAILED'
        ? 'FAILED'
        : 'PENDING_VERIFICATION';

    const payment = await prismaAny.listingPaymentSubmission.update({
      where: { id: existingPayment.id },
      data: {
        status: nextStatus,
        transactionRef: latestTransaction?.transactionId || merchantOrderId,
        phonepeOrderId: statusPayload.orderId || existingPayment.phonepeOrderId || null,
        phonepeTransactionId: latestTransaction?.transactionId || existingPayment.phonepeTransactionId || null,
        settingsSnapshot: sanitizeListingPaymentSettings(settings),
      },
      select: {
        id: true,
        method: true,
        status: true,
        amount: true,
        transactionRef: true,
        submittedAt: true,
      },
    });

    if (nextStatus === 'PAID') {
      await finalizeListingPaymentSale(payment.id);
    }

    res.json({
      success: true,
      message: nextStatus === 'PAID'
        ? 'Payment captured successfully.'
        : nextStatus === 'FAILED'
          ? 'PhonePe payment failed.'
          : 'PhonePe payment is still pending.',
      payment: {
        ...payment,
        amount: Number(payment.amount || 0),
      },
      phonepe: {
        state: statusPayload.state || 'PENDING',
        merchantOrderId,
      },
    });
  } catch (error) {
    if (error instanceof PhonePeGatewayError) {
      return res.status(502).json({ error: error.message });
    }

    next(error);
  }
};

export const submitListingPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ error: 'Buy Now payments are available for customers only.' });
    }

    const listingId = String(req.params.id || '').trim();
    const method = String(req.body?.method || '').trim().toUpperCase();
    const transactionRef = String(req.body?.transactionRef || '').trim();
    const receiptUrl = String(req.body?.receiptUrl || '').trim();
    const paymentNote = String(req.body?.paymentNote || '').trim();
    const razorpayOrderId = String(req.body?.razorpayOrderId || '').trim();
    const razorpayPaymentId = String(req.body?.razorpayPaymentId || '').trim();
    const razorpaySignature = String(req.body?.razorpaySignature || '').trim();

    if (!['RTGS', 'RAZORPAY'].includes(method)) {
      return res.status(400).json({ error: 'Valid payment method is required.' });
    }

    const listing = await getPaymentReadyListing(listingId);
    const listingError = assertListingCanAcceptPayment(listing);

    if (listingError) {
      return res.status(listingError === 'Listing not found.' ? 404 : 400).json({ error: listingError });
    }

    if (listing!.partnerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot buy your own listing.' });
    }

    const existingPending = await prismaAny.listingPaymentSubmission.findFirst({
      where: {
        listingId: listing!.id,
        buyerId: req.user.id,
        OR: [
          { status: { in: ['PAID', 'APPROVED'] } },
          {
            status: 'PENDING_VERIFICATION',
            method: { not: 'PHONEPE' },
          },
        ],
      },
    });

    const blockingPayment = await findBlockingListingPayment(listing!.id, req.user.id);

    if (existingPending) {
      return res.status(400).json({
        error: ['PAID', 'APPROVED'].includes(existingPending.status)
          ? 'You have already purchased this machine.'
          : 'Payment verification is already pending for this machine. Duplicate submissions are not allowed.',
      });
    }

    if (blockingPayment) {
      return res.status(409).json({ error: 'This listing already has a payment in progress or completed.' });
    }

    const settings = (await getAppSettings()).listingPayment;
    if (method === 'RTGS' && !settings.rtgs.enabled) {
      return res.status(400).json({ error: 'RTGS payment is not enabled.' });
    }

    if (method === 'RAZORPAY' && !settings.razorpay.enabled) {
      return res.status(400).json({ error: 'Razorpay payment is not enabled.' });
    }

    if (method === 'RTGS' && (!transactionRef || !normalizeRemoteMediaUrl(receiptUrl))) {
      return res.status(400).json({ error: 'UTR/reference number and receipt upload are required.' });
    }

    if (method === 'RAZORPAY') {
      if (!settings.razorpay.keySecret || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ error: 'Valid Razorpay payment proof is required.' });
      }

      const expectedSignature = crypto
        .createHmac('sha256', settings.razorpay.keySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (expectedSignature !== razorpaySignature) {
        return res.status(400).json({ error: 'Razorpay signature verification failed.' });
      }
    }

    const payment = await prismaAny.listingPaymentSubmission.create({
      data: {
        listingId: listing!.id,
        buyerId: req.user.id,
        partnerId: listing!.partnerId,
        method,
        status: method === 'RAZORPAY' ? 'PAID' : 'PENDING_VERIFICATION',
        amount: listing!.price,
        transactionRef: transactionRef || razorpayPaymentId || null,
        paymentNote: paymentNote || null,
        receiptUrl: method === 'RTGS' ? receiptUrl : null,
        razorpayOrderId: razorpayOrderId || null,
        razorpayPaymentId: razorpayPaymentId || null,
        razorpaySignature: method === 'RAZORPAY' ? razorpaySignature : null,
        settingsSnapshot: sanitizeListingPaymentSettings(settings),
      },
      select: {
        id: true,
        method: true,
        status: true,
        amount: true,
        transactionRef: true,
        receiptUrl: true,
        submittedAt: true,
      },
    });

    if (method === 'RAZORPAY') {
      await finalizeListingPaymentSale(payment.id);
    }

    try {
      const listingTitle = listing?.title || 'Vehicle Listing';
      const formattedAmount = payment.amount ? `₹${Number(payment.amount).toLocaleString('en-IN')}` : '';

      await prismaAny.notification.create({
        data: {
          userId: req.user.id,
          title: 'Payment Receipt Submitted',
          message: `Your payment receipt ${formattedAmount ? `of ${formattedAmount} ` : ''}for "${listingTitle}" has been submitted and is under verification.`,
          link: '/profile',
          type: 'PAYMENT_SUBMITTED',
        },
      });

      PushNotificationService.sendToUser(req.user.id, {
        title: 'Payment Receipt Submitted',
        body: `Your payment receipt ${formattedAmount ? `of ${formattedAmount} ` : ''}for "${listingTitle}" has been submitted and is under verification.`,
        icon: '/icon.png',
        url: '/profile',
        path: '/profile',
        data: { path: '/profile', url: '/profile' },
      }).catch((e) => console.error('Push notification failed:', e));

      const buyer = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { mobile: true, whatsappNumber: true },
      });
      void dispatchMarketplaceWhatsApp({
        eventCode: 'LISTING_PAYMENT_SUBMITTED',
        relatedEntityType: 'LISTING_PAYMENT_SUBMISSION',
        relatedEntityId: payment.id,
        recipientType: 'CUSTOMER',
        recipientPhone: buyer?.whatsappNumber || buyer?.mobile,
        payloadSnapshot: { paymentId: payment.id, listingId: listing!.id, listingTitle, method: payment.method },
      });
      if (method === 'RAZORPAY') {
        void dispatchMarketplaceWhatsApp({
          eventCode: 'LISTING_PAYMENT_APPROVED',
          relatedEntityType: 'LISTING_PAYMENT_SUBMISSION',
          relatedEntityId: payment.id,
          recipientType: 'CUSTOMER',
          recipientPhone: buyer?.whatsappNumber || buyer?.mobile,
          payloadSnapshot: { paymentId: payment.id, listingId: listing!.id, listingTitle, paymentStatus: 'PAID' },
        });
        void dispatchMarketplaceWhatsApp({
          eventCode: 'LISTING_PAYMENT_APPROVED',
          relatedEntityType: 'LISTING_PAYMENT_SUBMISSION',
          relatedEntityId: payment.id,
          recipientType: 'PARTNER',
          recipientPhone: listing!.partner?.whatsappNumber || listing!.partner?.mobile,
          payloadSnapshot: { paymentId: payment.id, listingId: listing!.id, listingTitle, paymentStatus: 'PAID', recipientRole: 'PARTNER' },
        });
      }
    } catch (notifErr) {
      console.error('Failed to create payment submission notification:', notifErr);
    }

    res.status(201).json({
      success: true,
      message: method === 'RAZORPAY'
        ? 'Payment captured successfully.'
        : 'Payment receipt submitted successfully. Verification is pending.',
      payment: {
        ...payment,
        amount: Number(payment.amount || 0),
      },
    });
  } catch (error) {
    next(error);
  }
};
