import { AdminPermissionKey, ListingStatus, Role } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import {
  buildAuthUserPayload,
  buildOnboardingResponse,
  ensurePartnerProfileForUser,
  getPartnerOnboardingContext,
  saveOnboardingData,
} from './auth.controller';
import {
  FinanceSupportItem,
  getAppSettings,
  updatePlatformRuntimeSettings,
  updateFinanceSupportSettings,
  updateHeroImageSettings,
  updateInspectionSectionSettings,
  updateSiteLogoSettings,
} from '../utils/appSettings';
import { PushNotificationService } from '../services/pushNotification.service';
import { getCustomerPrimeAccessState, normalizePrimeValidityUnit } from '../utils/customerPrime';
import {
  approveCustomerPrimeSubscription,
  listCustomerPrimeSubscriptions,
  rejectCustomerPrimeSubscription,
  syncExpiredCustomerPrimeSubscriptions,
} from '../utils/customerPrimeSubscriptions';

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
  const adminWhatsappNumber = normalizePhoneNumber(
    superAdminUser?.whatsappNumber,
  );

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

const allowedListingStatuses = new Set<ListingStatus>([
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

const formatSellerTypeLabel = (value?: string | null) => {
  const normalized = (value || '').trim();
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
    expiresAt?: Date | null;
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
      return !!subscription.expiresAt && subscription.expiresAt >= new Date();
    });

    return hasActivePrimeSubscription ? 'Prime Customer' : 'Customer';
  }

  if (partner.role) {
    return formatSellerTypeLabel(partner.role);
  }

  return 'User';
};

const hasPartnerProfile = (user: any) => !!user?.partnerProfile;

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
} as const;

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
} as const;

const mapManagedUser = (user: any) => {
  const primeAccessState = getCustomerPrimeAccessState({
    role: user.role,
    subscriptions: (user.customerPrimeSubscriptions || []).map((subscription: any) => ({
      id: subscription.id,
      status: subscription.status,
      startedAt: subscription.startedAt,
      expiresAt: subscription.expiresAt,
    })),
  });

  return {
    id: user.id,
    name:
      user.partnerProfile?.businessName ||
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
      ? (user.customerPrimeSubscriptions || []).find((subscription: any) => subscription.id === primeAccessState.activeSubscriptionId)?.expiresAt || null
      : null,
    primeSubscriptionStatus: (user.customerPrimeSubscriptions || [])[0]?.status || null,
    adminTitle: user.adminProfile?.title || null,
    isRootAdmin: user.adminProfile?.isRootAdmin || false,
    permissions:
      user.customRole?.permissions && Array.isArray(user.customRole.permissions)
        ? user.customRole.permissions
        : (user.adminPermissions || []).map((item: { permission: string }) => item.permission),
    partnerType: user.partnerProfile?.partnerType || null,
    kycStatus: user.partnerProfile?.kycStatus || null,
    onboardingStatus: user.partnerProfile?.onboardingStatus || null,
    accountStatus: user.partnerProfile?.accountStatus || null,
    createdAt: user.createdAt,
    createdBy: user.createdBy || null,
    partnerProfile: user.partnerProfile || null,
  };
};

const getApprovedPartnerAccountStatus = ({
  currentAccountStatus,
  onboardingStatus,
  kycStatus,
}: {
  currentAccountStatus?: string | null | undefined;
  onboardingStatus?: string | null | undefined;
  kycStatus?: string | null | undefined;
}) => {
  if (currentAccountStatus === 'ACTIVE') {
    return 'ACTIVE';
  }

  if (onboardingStatus === 'APPROVED' && kycStatus === 'APPROVED') {
    return 'ACTIVE';
  }

  return 'PENDING';
};

const mapPartnerAccountStatus = ({
  status,
  currentAccountStatus,
  onboardingStatus,
  kycStatus,
}: {
  status: string;
  currentAccountStatus?: string | null | undefined;
  onboardingStatus?: string | null | undefined;
  kycStatus?: string | null | undefined;
}) => {
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

const createPartnerNotification = async ({
  userId,
  title,
  message,
  link,
  type,
}: {
  userId: string;
  title: string;
  message: string;
  link: string;
  type: string;
}) => {
  await prismaAny.notification.create({
    data: {
      userId,
      title,
      message,
      link,
      type,
    },
  });
  
  // Fire push notification asynchronously
  PushNotificationService.sendToUser(userId, {
    title,
    body: message,
    icon: '/icon.png',
    url: link
  }).catch(e => console.error('Push notification failed:', e));
};

export const getDashboardSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const [
      totalPartners,
      approvedPartners,
      pendingKyc,
      activeListings,
      recentPartners,
      recentUsersData,
      recentListingsData,
      totalEnquiries,
      categoryStats,
      recentListingsRaw,
      recentEnquiriesRaw
    ] = await Promise.all([
      prisma.user.count({
        where: {
          role: 'PARTNER',
        },
      }),
      prisma.user.count({
        where: {
          role: 'PARTNER',
          partnerProfile: {
            kycStatus: 'APPROVED',
          },
        },
      }),
      prisma.partnerProfile.count({
        where: {
          kycStatus: {
            in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
          },
        },
      }),
      prisma.listing.count({
        where: {
          status: 'PUBLISHED',
        },
      }),
      prisma.user.findMany({
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
      prisma.user.findMany({
        where: { role: 'PARTNER', createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
      prisma.listing.findMany({
        where: { createdAt: { gte: sixMonthsAgo } },
        select: { createdAt: true },
      }),
      prisma.lead.count(),
      prisma.listing.groupBy({
        by: ['categoryId'],
        _count: { id: true },
      }),
      prisma.listing.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { category: true, brand: true },
      }),
      prisma.lead.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { listing: true, customer: true },
      }),
    ]);

    const monthsMap: Record<string, { name: string; partners: number; listings: number }> = {};
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
      if (monthsMap[key]) monthsMap[key].partners += 1;
    });

    recentListingsData.forEach(l => {
      const key = `${l.createdAt.getFullYear()}-${l.createdAt.getMonth()}`;
      if (monthsMap[key]) monthsMap[key].listings += 1;
    });

    const graphData = Object.values(monthsMap);

    const categoryIds = categoryStats.map((c: any) => c.categoryId);
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    const categoryBreakdown = categoryStats.map((stat: any) => {
      const cat = categories.find((c: any) => c.id === stat.categoryId);
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
      recentApplications: recentPartners.map((partner: any) => ({
        id: partner.id,
        name: partner.partnerProfile?.businessName || partner.name || partner.email || 'Unnamed partner',
        email: partner.email,
        mobile: partner.mobile,
        partnerType: partner.partnerProfile?.partnerType || 'SHOWROOM',
        kycStatus: partner.partnerProfile?.kycStatus || 'NOT_STARTED',
        onboardingStatus: partner.partnerProfile?.onboardingStatus || 'ACCOUNT_CREATED',
        createdAt: partner.createdAt,
      })),
      recentListings: recentListingsRaw.map((listing: any) => ({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        status: listing.status,
        categoryName: listing.category?.name || 'N/A',
        brandName: listing.brand?.name || 'N/A',
        createdAt: listing.createdAt,
      })),
      recentEnquiries: recentEnquiriesRaw.map((enquiry: any) => ({
        id: enquiry.id,
        enquiryType: enquiry.enquiryType,
        status: enquiry.status,
        listingTitle: enquiry.listing?.title || enquiry.listingTitleSnapshot || 'N/A',
        customerName: enquiry.customer?.name || enquiry.customer?.mobile || 'Unknown',
        createdAt: enquiry.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getPlatformSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [settings, defaultSuperAdminContact, recentPrimePayments] = await Promise.all([
      getAppSettings(),
      getDefaultSuperAdminContact(),
      listCustomerPrimeSubscriptions({ take: 10 }),
    ]);

    res.json({
      googleAuth: {
        enabled: settings.googleAuth.enabled === true,
        clientId: settings.googleAuth.clientId || '',
        updatedAt: settings.googleAuth.updatedAt,
        updatedByUserId: settings.googleAuth.updatedByUserId,
      },
      mobileOtp: {
        enabled: settings.mobileOtp.enabled,
        apiKey: settings.mobileOtp.apiKey || '',
        senderId: settings.mobileOtp.senderId || '',
        templateId: settings.mobileOtp.templateId || '',
        templateMessage: settings.mobileOtp.templateMessage || '',
        updatedAt: settings.mobileOtp.updatedAt,
        updatedByUserId: settings.mobileOtp.updatedByUserId,
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
  } catch (error) {
    next(error);
  }
};

export const updatePlatformSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { googleClientId, googleAuthEnabled, mobileOtp, publicLeadRouting, customerPrime } = req.body as {
      googleClientId?: string;
      googleAuthEnabled?: boolean;
      mobileOtp?: {
        enabled?: boolean;
        apiKey?: string;
        senderId?: string;
        templateId?: string;
        templateMessage?: string;
      };
      publicLeadRouting?: {
        useSellerContact?: boolean;
      };
      customerPrime?: {
        enabled?: boolean;
        upiId?: string;
        amount?: number;
        validityValue?: number;
        validityUnit?: 'DAYS' | 'MONTHS' | 'days' | 'months';
      };
    };

    if (googleClientId === undefined && googleAuthEnabled === undefined && !mobileOtp && !publicLeadRouting && !customerPrime) {
      return res.status(400).json({
        error: 'No platform setting changes were provided.',
      });
    }

    const settingsPayload: Parameters<typeof updatePlatformRuntimeSettings>[0] = {
      updatedByUserId: req.user?.id || null,
    };

    if (googleClientId !== undefined || googleAuthEnabled !== undefined) {
      settingsPayload.googleAuthEnabled = googleAuthEnabled === true;
      if (googleClientId !== undefined) {
        settingsPayload.googleClientId = googleClientId;
      }
    }

    if (mobileOtp) {
      settingsPayload.mobileOtp = {
        enabled: mobileOtp.enabled === true,
        ...(mobileOtp.apiKey !== undefined ? { apiKey: mobileOtp.apiKey } : {}),
        ...(mobileOtp.senderId !== undefined ? { senderId: mobileOtp.senderId } : {}),
        ...(mobileOtp.templateId !== undefined ? { templateId: mobileOtp.templateId } : {}),
        ...(mobileOtp.templateMessage !== undefined
          ? { templateMessage: mobileOtp.templateMessage }
          : {}),
      };
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
          ? { validityUnit: normalizePrimeValidityUnit(customerPrime.validityUnit) }
          : {}),
        applyToCustomerRoleOnly: true,
        requireForCall: true,
        requireForWhatsapp: true,
        requireForSellListing: true,
      };
    }

    const [settings, defaultSuperAdminContact, recentPrimePayments] = await Promise.all([
      updatePlatformRuntimeSettings(settingsPayload),
      getDefaultSuperAdminContact(),
      listCustomerPrimeSubscriptions({ take: 10 }),
    ]);

    res.json({
      message: 'Platform settings updated successfully.',
      googleAuth: {
        enabled: settings.googleAuth.enabled === true,
        clientId: settings.googleAuth.clientId || '',
        updatedAt: settings.googleAuth.updatedAt,
        updatedByUserId: settings.googleAuth.updatedByUserId,
      },
      mobileOtp: {
        enabled: settings.mobileOtp.enabled,
        apiKey: settings.mobileOtp.apiKey || '',
        senderId: settings.mobileOtp.senderId || '',
        templateId: settings.mobileOtp.templateId || '',
        templateMessage: settings.mobileOtp.templateMessage || '',
        updatedAt: settings.mobileOtp.updatedAt,
        updatedByUserId: settings.mobileOtp.updatedByUserId,
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
  } catch (error) {
    next(error);
  }
};

export const getCustomerPrimePayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedStatus = String(req.query.status || '').trim().toUpperCase();
    const status =
      requestedStatus && ['PENDING', 'ACTIVE', 'REJECTED', 'EXPIRED', 'CANCELLED'].includes(requestedStatus)
        ? (requestedStatus as 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED' | 'CANCELLED')
        : undefined;

    const subscriptions = await listCustomerPrimeSubscriptions(
      status ? { status } : {},
    );

    res.json({
      payments: subscriptions,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCustomerPrimePaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id || '');
    const { status, rejectionReason } = req.body as {
      status?: string;
      rejectionReason?: string;
    };

    if (!id) {
      return res.status(400).json({ error: 'Payment request id is required.' });
    }

    if (!status || !['ACTIVE', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Valid payment status is required.' });
    }

    const subscription =
      status === 'ACTIVE'
        ? await approveCustomerPrimeSubscription({
          subscriptionId: id,
          approverUserId: req.user?.id || '',
        })
        : await rejectCustomerPrimeSubscription({
          subscriptionId: id,
          approverUserId: req.user?.id || '',
          rejectionReason: rejectionReason || null,
        });

    await createPartnerNotification({
      userId: subscription.userId,
      title: status === 'ACTIVE' ? 'Prime Subscription Activated' : 'Prime Payment Rejected',
      message:
        status === 'ACTIVE'
          ? 'Your payment has been verified and your Prime customer subscription is now active.'
          : subscription.rejectionReason || 'Your Prime payment proof could not be verified.',
      type: status === 'ACTIVE' ? 'PRIME_SUBSCRIPTION_ACTIVE' : 'PRIME_SUBSCRIPTION_REJECTED',
      link: '/profile',
    });

    res.json({
      message:
        status === 'ACTIVE'
          ? 'Prime customer payment approved successfully.'
          : 'Prime customer payment rejected successfully.',
      payment: subscription,
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
};

export const getFinanceSupportContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.json({
      items: settings.financeSupport.items,
    });
  } catch (error) {
    next(error);
  }
};

export const updateFinanceSupportContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = Array.isArray(req.body?.items) ? (req.body.items as Array<Partial<FinanceSupportItem>>) : [];

    const invalidItem = items.find((item) => !item?.name?.trim() || !item?.imageUrl?.trim());
    if (invalidItem) {
      return res.status(400).json({ error: 'Each finance support item must include a name and image.' });
    }

    const settings = await updateFinanceSupportSettings({
      items,
      updatedByUserId: req.user?.id || null,
    });

    res.json({
      message: 'Finance support items updated successfully.',
      items: settings.financeSupport.items,
    });
  } catch (error) {
    next(error);
  }
};

export const getHeroImageContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.json({
      imageUrl: settings.heroImage.imageUrl,
      headline: settings.heroImage.headline,
    });
  } catch (error) {
    next(error);
  }
};

export const getInspectionSectionContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.json(settings.inspectionSection);
  } catch (error) {
    next(error);
  }
};

export const getSiteLogoContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getAppSettings();

    res.json({
      imageUrl: settings.siteLogo.imageUrl,
      faviconUrl: settings.siteLogo.faviconUrl,
      manifestIconUrl: settings.siteLogo.manifestIconUrl,
      updatedAt: settings.siteLogo.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

export const updateHeroImageContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const imageUrl = req.body?.imageUrl;
    const headline = req.body?.headline;

    const settings = await updateHeroImageSettings({
      imageUrl,
      headline,
      updatedByUserId: req.user?.id || null,
    });

    res.json({
      message: 'Hero image updated successfully.',
      imageUrl: settings.heroImage.imageUrl,
      headline: settings.heroImage.headline,
    });
  } catch (error) {
    next(error);
  }
};

export const updateInspectionSectionContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const title = req.body?.title;
    const description = req.body?.description;
    const imageUrl = req.body?.imageUrl;

    const settings = await updateInspectionSectionSettings({
      title,
      description,
      imageUrl,
      updatedByUserId: req.user?.id || null,
    });

    res.json({
      message: 'Inspection section updated successfully.',
      ...settings.inspectionSection,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSiteLogoContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const imageUrl = req.body?.imageUrl;
    const faviconUrl = req.body?.faviconUrl;
    const manifestIconUrl = req.body?.manifestIconUrl;

    const settings = await updateSiteLogoSettings({
      imageUrl,
      faviconUrl,
      manifestIconUrl,
      updatedByUserId: req.user?.id || null,
    });

    res.json({
      message: 'Site logo updated successfully.',
      ...settings.siteLogo,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        role: {
          in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'],
        },
      },
      include: managedUserInclude as any,
      orderBy: [{ createdAt: 'desc' }],
    });

    res.json({
      users: (users as any[]).map(mapManagedUser),
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminPartners = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partners = await prisma.user.findMany({
      where: {
        role: 'PARTNER',
      } as any,
      include: managedUserInclude as any,
      orderBy: [{ createdAt: 'desc' }],
    });

    res.json({
      partners: (partners as any[]).filter(hasPartnerProfile).map(mapManagedUser),
    });
  } catch (error) {
    next(error);
  }
};

export const getCustomerVisitors = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await syncExpiredCustomerPrimeSubscriptions();

    const visitors = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        status: {
          not: 'CLOSED',
        },
      },
      include: managedUserInclude as any,
      orderBy: [{ createdAt: 'desc' }],
    });

    res.json({
      visitors: (visitors as any[]).map(mapManagedUser),
    });
  } catch (error) {
    next(error);
  }
};

export const updateManagedUserAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const {
      name,
      email,
      mobile,
      city,
      state,
      title,
      permissions,
      customRoleId,
    } = req.body as {
      name?: string;
      email?: string;
      mobile?: string;
      city?: string;
      state?: string;
      title?: string;
      permissions?: string[];
      customRoleId?: string | null;
    };

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: managedUserInclude as any,
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

    const duplicateUser = await prisma.user.findFirst({
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

    await prisma.user.update({
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
      const normalizedCustomRoleId =
        typeof customRoleId === 'string' && customRoleId.trim() ? customRoleId.trim() : null;

      if (normalizedCustomRoleId) {
        const customRole = await prisma.customRole.findUnique({
          where: { id: normalizedCustomRoleId },
          select: { id: true },
        });

        if (!customRole) {
          return res.status(400).json({ error: 'Selected employee role was not found.' });
        }
      }

      const normalizedPermissions: AdminPermissionKey[] = Array.isArray(permissions)
        ? permissions.filter((permission): permission is AdminPermissionKey => allowedAdminPermissions.has(permission))
        : [];

      await prisma.user.update({
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

      await prisma.adminPermission.deleteMany({
        where: { adminUserId: id },
      });

      if (normalizedPermissions.length > 0) {
        await prisma.adminPermission.createMany({
          data: normalizedPermissions.map((permission) => ({
            adminUserId: id,
            permission,
          })),
        });
      }
    }

    if ((targetUser as any).partnerProfile) {
      await prismaAny.partnerProfile.updateMany({
        where: { userId: id },
        data: {
          ownerName: normalizedName,
        },
      });
    }

    const refreshedUser = await prisma.user.findUnique({
      where: { id },
      include: managedUserInclude as any,
    });

    res.json({
      message: 'User account updated successfully.',
      user: mapManagedUser(refreshedUser),
    });
  } catch (error) {
    next(error);
  }
};

export const resetManagedUserPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { password } = req.body as { password?: string };

    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (targetUser.role === 'SUPER_ADMIN' && (await prisma.adminProfile.findUnique({ where: { userId: id } }))?.isRootAdmin) {
      return res.status(400).json({ error: 'Protected root super admin passwords cannot be reset here.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id },
      data: {
        password: hashedPassword,
      },
    });

    res.json({
      message: 'Password reset successfully.',
      id,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteManagedUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    const targetUser = await prisma.user.findUnique({
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
      } as any,
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (targetUser.role === 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Super admin accounts cannot be deleted.' });
    }

    if (targetUser.role === 'CUSTOMER') {
      await prisma.user.update({
        where: { id },
        data: {
          status: 'CLOSED' as any,
        },
      });

      res.json({
        message: 'Visitor removed successfully.',
        id,
        archived: true,
      });
      return;
    }

    if ((targetUser as any).partnerProfile) {
      if (
        (targetUser as any)._count?.listings > 0 ||
        (targetUser as any)._count?.assignedLeads > 0 ||
        (targetUser as any)._count?.teamMemberships > 0
      ) {
        return res.status(400).json({
          error: 'This partner cannot be deleted because linked listings, leads, or team records already exist. Mark the account inactive or blocked instead.',
        });
      }

      const partnerProfileId = (targetUser as any).partnerProfile.id;

      await prisma.$transaction([
        prisma.adminPermission.deleteMany({ where: { adminUserId: id } }),
        prismaAny.partnerAgreement.deleteMany({ where: { partnerProfileId } }),
        prismaAny.partnerDeposit.deleteMany({ where: { partnerProfileId } }),
        prismaAny.kycReviewLog.deleteMany({ where: { partnerProfileId } }),
        prismaAny.kycDocument.deleteMany({ where: { partnerProfileId } }),
        prismaAny.partnerProfile.delete({ where: { userId: id } }),
        prisma.user.delete({ where: { id } }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.adminPermission.deleteMany({ where: { adminUserId: id } }),
        prismaAny.adminProfile.deleteMany({ where: { userId: id } }),
        prisma.user.delete({ where: { id } }),
      ]);
    }

    res.json({
      message: 'User deleted successfully.',
      id,
    });
  } catch (error) {
    next(error);
  }
};

export const createManagedUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      email,
      mobile,
      password,
      role,
      title,
      permissions,
      customRoleId,
      businessName,
      partnerType,
    } = req.body as {
      name?: string;
      email?: string;
      mobile?: string;
      password?: string;
      role?: Role;
      title?: string;
      permissions?: string[];
      customRoleId?: string | null;
      businessName?: string;
      partnerType?: string;
    };

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' });
    }

    if (role !== 'EMPLOYEE') {
      return res.status(400).json({ error: 'Only employee accounts can be created here.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const existingUser = await prisma.user.findFirst({
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

    const hashedPassword = await bcrypt.hash(password, 10);

    const normalizedCustomRoleId =
      typeof customRoleId === 'string' && customRoleId.trim() ? customRoleId.trim() : null;

    if (normalizedCustomRoleId) {
      const customRole = await prisma.customRole.findUnique({
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

    const createdUser = await prisma.user.create({
      data: {
        name,
        email,
        mobile: mobile || undefined,
        password: hashedPassword,
        role,
        customRoleId: role === 'EMPLOYEE' ? normalizedCustomRoleId : null,
        status: 'ACTIVE' as any,
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
      } as any,
      include: managedUserInclude as any,
    });

    res.status(201).json({
      message: 'Employee created successfully.',
      user: mapManagedUser(createdUser),
    });
  } catch (error) {
    next(error);
  }
};

export const createPartnerUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      name,
      email,
      mobile,
      password,
      businessName,
      partnerType,
    } = req.body as {
      name?: string;
      email?: string;
      mobile?: string;
      password?: string;
      businessName?: string;
      partnerType?: string;
    };

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const existingUser = await prisma.user.findFirst({
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

    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedMobile = mobile?.trim() || null;
    const normalizedBusinessName = businessName?.trim() || normalizedName;

    const createdUser = await prisma.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        mobile: normalizedMobile || undefined,
        password: hashedPassword,
        role: 'PARTNER',
        status: 'ACTIVE' as any,
        authProvider: 'LOCAL',
        createdById: req.user?.id,
      } as any,
      include: {
        partnerProfile: true,
      } as any,
    });

    await ensurePartnerProfileForUser(createdUser as any);

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

    const refreshedUser = await prisma.user.findUnique({
      where: { id: createdUser.id },
      include: managedUserInclude as any,
    });

    res.status(201).json({
      message: 'Partner created successfully.',
      user: mapManagedUser(refreshedUser),
    });
  } catch (error) {
    next(error);
  }
};

export const getPendingVerifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pendingPartners = await prisma.user.findMany({
      where: {
        partnerProfile: {
          is: {
            kycStatus: {
              in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'],
            } as any,
          },
        },
      } as any,
      include: managedUserInclude as any,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      verifications: (pendingPartners as any[]).map((partner) => ({
        id: partner.id,
        name: partner.partnerProfile?.businessName || partner.name || partner.email || 'Unnamed partner',
        email: partner.email,
        partnerType: partner.partnerProfile?.partnerType || 'SHOWROOM',
        appliedOn: partner.createdAt,
        status: partner.partnerProfile?.kycStatus || 'NOT_STARTED',
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const getVerificationDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    const partner = await prisma.user.findUnique({
      where: { id },
      include: verificationDetailInclude as any,
    });

    if (!partner || !(partner as any).partnerProfile) {
      return res.status(404).json({ error: 'Partner verification record not found.' });
    }

    const partnerProfile = (partner as any).partnerProfile;

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
        documents: (partnerProfile.kycDocuments || []).map((document: any) => ({
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
        agreements: (partnerProfile.agreements || []).map((agreement: any) => ({
          agreementType: agreement.agreementType,
          version: agreement.version,
          acceptedAt: agreement.acceptedAt,
        })),
        reviewHistory: (partnerProfile.kycReviews || []).map((review: any) => ({
          id: review.id,
          action: review.action,
          comment: review.comment,
          createdAt: review.createdAt,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminListings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = req.query.partnerId ? String(req.query.partnerId) : undefined;
    const listings = await prisma.listing.findMany({
      ...(partnerId ? { where: { partnerId } } : {}),
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
        category: {
          select: { id: true, name: true },
        },
        brand: {
          select: { id: true, name: true },
        },
        model: {
          select: { id: true, name: true },
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
        const listingMedia = (listing as any).media || [];

        return {
          id: listing.id,
          title: listing.title,
          dealer:
            listing.partner?.partnerProfile?.businessName ||
            listing.partner?.name ||
            listing.partner?.email ||
            'Unknown partner',
          dealerCategory: getDealerCategoryLabel(listing.partner),
          price: Number(listing.price),
          status: listing.status,
          createdAt: listing.createdAt,
          manufacturingYear: listing.manufacturingYear,
          locationState: listing.locationState,
          locationCity: listing.locationCity,
          category: (listing as any).category,
          brand: (listing as any).brand,
          model: (listing as any).model,
          condition: listing.condition,
          operatingHours: listing.operatingHours,
          views: listing.views,
          description: listing.description,
          additionalDescription: listing.additionalDescription,
          grossPower: listing.grossPower,
          isNegotiable: listing.isNegotiable,
          imageUrl: listingMedia.find((m: any) => m.type === 'IMAGE')?.url || null,
          media: listingMedia,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
};

export const updateVerificationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body as { status?: string };

    if (!status || !allowedVerificationStatuses.has(status)) {
      return res.status(400).json({ error: 'Invalid verification status.' });
    }

    const existingPartner = await prisma.user.findUnique({
      where: { id },
      include: {
        partnerProfile: true,
      } as any,
    });

    if (!existingPartner || !(existingPartner as any).partnerProfile) {
      return res.status(404).json({ error: 'Partner verification record not found.' });
    }

    const existingProfile = (existingPartner as any).partnerProfile;

    const profile = await prisma.$transaction(async (tx) => {
      const txAny = tx as any;

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
          onboardingStatus:
            status === 'APPROVED'
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
  } catch (error) {
    next(error);
  }
};

export const updateAdminListingStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body as { status?: ListingStatus };

    if (!status || !allowedListingStatuses.has(status)) {
      return res.status(400).json({ error: 'Invalid listing status.' });
    }

    const listing = await prisma.listing.update({
      where: { id },
      data: { status },
      include: {
        partner: {
          select: { id: true }
        }
      }
    });

    if (listing.partner?.id) {
      await (prisma as any).notification.create({
        data: {
          userId: listing.partner.id,
          title: 'Listing Status Updated',
          message: `Your listing "${listing.title}" status is now ${status}.`,
          type: 'LISTING_UPDATE',
          link: '/partner/listings',
        },
      });

      // Fire push notification asynchronously
      PushNotificationService.sendToUser(listing.partner.id, {
        title: 'Listing Status Updated',
        body: `Your listing "${listing.title}" status is now ${status}.`,
        icon: '/icon.png',
        url: '/partner/listings'
      }).catch(e => console.error('Push notification failed:', e));
    }

    res.json({
      message: 'Listing status updated successfully.',
      listing,
    });
  } catch (error) {
    next(error);
  }
};

export const updateAdminUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body as { status?: string };

    if (!status || !['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid user status.' });
    }

    const targetUser = await prisma.user.findUnique({
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

    await prisma.user.update({
      where: { id },
      data: { status: status as any },
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

    const refreshedUser = await prisma.user.findUnique({
      where: { id },
      include: managedUserInclude as any,
    });

    res.json({
      message: 'User status updated successfully.',
      user: mapManagedUser(refreshedUser),
    });
  } catch (error) {
    next(error);
  }
};

export const updatePartnerUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const {
      name,
      email,
      mobile,
      businessName,
      partnerType,
    } = req.body as {
      name?: string;
      email?: string;
      mobile?: string;
      businessName?: string;
      partnerType?: string;
    };

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: managedUserInclude as any,
    });

    if (!targetUser || !hasPartnerProfile(targetUser)) {
      return res.status(404).json({ error: 'Partner not found.' });
    }

    const partnerProfile =
      (targetUser as any).partnerProfile || (await ensurePartnerProfileForUser(targetUser as any));

    const normalizedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedMobile = mobile?.trim();
    const normalizedBusinessName = businessName?.trim();
    const normalizedPartnerType =
      partnerType && allowedPartnerTypes.has(partnerType) ? partnerType : null;

    if (!normalizedName || !normalizedEmail) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const duplicateUser = await prisma.user.findFirst({
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

    await prisma.user.update({
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

    const refreshedUser = await prisma.user.findUnique({
      where: { id },
      include: managedUserInclude as any,
    });

    res.json({
      message: 'Partner updated successfully.',
      user: mapManagedUser(refreshedUser),
    });
  } catch (error) {
    next(error);
  }
};

export const deletePartnerUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    const targetUser = await prisma.user.findUnique({
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
      } as any,
    });

    if (!targetUser || !(targetUser as any).partnerProfile) {
      return res.status(404).json({ error: 'Partner not found.' });
    }

    if ((targetUser as any)._count?.listings > 0 || (targetUser as any)._count?.assignedLeads > 0 || (targetUser as any)._count?.teamMemberships > 0) {
      return res.status(400).json({
        error: 'This partner cannot be deleted because linked listings, leads, or team records already exist. Mark the account inactive or blocked instead.',
      });
    }

    const partnerProfileId = (targetUser as any).partnerProfile.id;

    await prisma.$transaction([
      prismaAny.partnerAgreement.deleteMany({ where: { partnerProfileId } }),
      prismaAny.partnerDeposit.deleteMany({ where: { partnerProfileId } }),
      prismaAny.kycReviewLog.deleteMany({ where: { partnerProfileId } }),
      prismaAny.kycDocument.deleteMany({ where: { partnerProfileId } }),
      prismaAny.partnerProfile.delete({ where: { userId: id } }),
      prisma.user.delete({ where: { id } }),
    ]);

    res.json({
      message: 'Partner deleted successfully.',
      id,
    });
  } catch (error) {
    next(error);
  }
};

export const getAdminPartnerOnboarding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const partnerUser = await getPartnerOnboardingContext(id);

    if (!partnerUser) {
      return res.status(404).json({ error: 'Partner onboarding record not found.' });
    }

    const authUser = await buildAuthUserPayload(partnerUser);

    res.json({
      user: authUser,
      ...buildOnboardingResponse(partnerUser),
    });
  } catch (error) {
    next(error);
  }
};

export const saveAdminPartnerOnboarding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const {
      profile,
      kycDocuments = [],
      agreements = [],
      actionName,
      actionComment,
    } = req.body as any;

    if (!profile) {
      return res.status(400).json({ error: 'Profile section is required.' });
    }

    const existingPartner = await getPartnerOnboardingContext(id);

    if (!existingPartner) {
      return res.status(404).json({ error: 'Partner onboarding record not found.' });
    }

    await saveOnboardingData({
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

    const refreshedPartnerUser = await getPartnerOnboardingContext(id);

    if (!refreshedPartnerUser) {
      return res.status(404).json({ error: 'Partner onboarding record not found after save.' });
    }

    const authUser = await buildAuthUserPayload(refreshedPartnerUser);

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
      onboarding: buildOnboardingResponse(refreshedPartnerUser),
    });
  } catch (error) {
    next(error);
  }
};

export const submitAdminPartnerOnboarding = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const {
      profile,
      kycDocuments = [],
      agreements = [],
      actionComment,
    } = req.body as any;

    if (!profile) {
      return res.status(400).json({ error: 'Profile section is required.' });
    }

    const existingPartner = await getPartnerOnboardingContext(id);

    if (!existingPartner) {
      return res.status(404).json({ error: 'Partner onboarding record not found.' });
    }

    await saveOnboardingData({
      userId: id,
      userEmail: existingPartner.email,
      profile,
      kycDocuments,
      agreementTypes: agreements,
      submitForReview: true,
      actionName: 'SUPER_ADMIN_RESUBMITTED_ONBOARDING',
      actionComment: actionComment || 'Super admin resubmitted the onboarding package for review.',
    });

    const refreshedPartnerUser = await getPartnerOnboardingContext(id);

    if (!refreshedPartnerUser) {
      return res.status(404).json({ error: 'Partner onboarding record not found after submit.' });
    }

    const authUser = await buildAuthUserPayload(refreshedPartnerUser);

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
      onboarding: buildOnboardingResponse(refreshedPartnerUser),
    });
  } catch (error) {
    next(error);
  }
};

export const getModuleBadges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [enquiriesCount, verificationsCount, visitorsCount, recurrenceCount, listingsPendingApprovalCount] = await Promise.all([
      (prisma as any).lead.count({
        where: { status: 'NEW' },
      }),
      (prisma as any).user.count({
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
      (prisma as any).user.count({
        where: {
          role: 'CUSTOMER',
          createdAt: {
            gte: today,
          },
        },
      }),
      (prisma as any).customerPrimeSubscription.count(),
      (prisma as any).listing.count({
        where: {
          status: {
            in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED'],
          },
        },
      }),
    ]);

    res.json({
      badges: {
        enquiries: enquiriesCount,
        verifications: verificationsCount,
        visitors: visitorsCount,
        recurrence: recurrenceCount,
        listingsPendingApproval: listingsPendingApprovalCount,
      },
    });
  } catch (error) {
    next(error);
  }
};
