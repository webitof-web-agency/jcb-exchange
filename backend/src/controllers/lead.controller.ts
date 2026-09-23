import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { normalizeListingMedia } from '../utils/mediaUrl';
import { getAppSettings } from '../utils/appSettings';
import { PushNotificationService } from '../services/pushNotification.service';
import { assertCustomerPrimeEligibility } from '../utils/customerPrimeSubscriptions';

const prismaAny = prisma as any;

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'INTERESTED',
  'INSPECTION_SCHEDULED',
  'WON',
  'LOST',
] as const;

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
  customerPrimeSubscriptions: {
    where: {
      status: 'ACTIVE',
    },
    select: {
      id: true,
      status: true,
      expiresAt: true,
    },
  },
} as const;

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
} as const;

const leadListingPaymentSelect = {
  id: true,
  listingId: true,
  buyerId: true,
  partnerId: true,
  method: true,
  status: true,
  amount: true,
  transactionRef: true,
  paymentNote: true,
  receiptUrl: true,
  submittedAt: true,
  reviewedAt: true,
  rejectionReason: true,
  listing: { select: { id: true, title: true, price: true, status: true } },
} as const;

const mapLeadListingPayment = (payment: any) => ({
  id: payment.id,
  listingId: payment.listingId,
  buyerId: payment.buyerId,
  partnerId: payment.partnerId,
  method: payment.method,
  status: payment.status,
  amount: Number(payment.amount || 0),
  transactionRef: payment.transactionRef || '',
  paymentNote: payment.paymentNote || '',
  receiptUrl: payment.receiptUrl || '',
  submittedAt: payment.submittedAt,
  reviewedAt: payment.reviewedAt,
  rejectionReason: payment.rejectionReason || '',
  isForCurrentListing: payment.isForCurrentListing === true,
  listing: payment.listing
    ? {
        id: payment.listing.id,
        title: payment.listing.title,
        price: Number(payment.listing.price || 0),
        status: payment.listing.status || '',
      }
    : null,
});

const canEmployeeManageEnquiries = async (userId: string) => {
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
    : (employee?.adminPermissions || []).map((item: { permission: string }) => item.permission);

  return permissions.includes('ALL_ACCESS') || permissions.includes('enquiries.manage');
};

const formatLead = (lead: any) => {
  const isSuperAdminRecipient = lead.dealer?.role === 'SUPER_ADMIN';

  let dynamicEnquiryType = lead.enquiryType;
  if (isSuperAdminRecipient) {
    if (lead.enquiryType === 'DEALER_WHATSAPP' || lead.enquiryType === 'SELLER_WHATSAPP' || lead.enquiryType === 'WHATSAPP') {
      dynamicEnquiryType = 'SUPER_ADMIN_WHATSAPP';
    } else if (lead.enquiryType === 'DEALER_CALL' || lead.enquiryType === 'SELLER_CALL' || lead.enquiryType === 'CALL') {
      dynamicEnquiryType = 'SUPER_ADMIN_CALL';
    } else if (lead.enquiryType === 'DEALER_CALLBACK' || lead.enquiryType === 'SELLER_CALLBACK' || lead.enquiryType === 'CALLBACK') {
      dynamicEnquiryType = 'SUPER_ADMIN_CALLBACK';
    }
  } else {
    if (lead.enquiryType === 'DEALER_WHATSAPP' || lead.enquiryType === 'WHATSAPP') {
      dynamicEnquiryType = 'SELLER_WHATSAPP';
    } else if (lead.enquiryType === 'DEALER_CALL' || lead.enquiryType === 'CALL') {
      dynamicEnquiryType = 'SELLER_CALL';
    } else if (lead.enquiryType === 'DEALER_CALLBACK' || lead.enquiryType === 'CALLBACK') {
      dynamicEnquiryType = 'SELLER_CALLBACK';
    }
  }

  const isPrime =
    lead.customer?.role === 'CUSTOMER' &&
    Array.isArray(lead.customer?.customerPrimeSubscriptions) &&
    lead.customer.customerPrimeSubscriptions.some(
      (sub: any) => sub.status === 'ACTIVE' && (!sub.expiresAt || new Date(sub.expiresAt) >= new Date())
    );

  return {
    id: lead.id,
    enquiryType: dynamicEnquiryType,
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
      isPrime: Boolean(isPrime),
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
      name:
        lead.dealer?.partnerProfile?.businessName ||
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
    listingOwner:
      lead.dealer?.role === 'SUPER_ADMIN'
        ? null
        : {
            id: lead.listing?.partner?.id || lead.dealer?.id || '',
            name:
              lead.listing?.partner?.partnerProfile?.businessName ||
              lead.listing?.partner?.name ||
              lead.dealer?.partnerProfile?.businessName ||
              lead.dealer?.name ||
              'Listing Seller',
            mobile: lead.listing?.partner?.mobile || lead.dealer?.mobile || '',
            whatsappNumber:
              lead.listing?.partner?.whatsappNumber || lead.dealer?.whatsappNumber || '',
            partnerType:
              lead.listing?.partner?.partnerProfile?.partnerType ||
              lead.dealer?.partnerProfile?.partnerType ||
              null,
          },
  };
};

const formatDetailedLead = (lead: any) => {
  const base = formatLead(lead);

  const listingMedia = normalizeListingMedia(lead.listing?.media);

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
    featuredImage: listingMedia.find((m: any) => m.isFeatured)?.url || listingMedia[0]?.url || null,
  };

  const activities = Array.isArray(lead.activities)
    ? lead.activities.map((a: any) => ({
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

  const synthesizedTimeline: Array<any> = [...activities];

  const hasCreatedActivity = activities.some((a: any) => a.type === 'CREATED');
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

  const hasRoutingActivity = activities.some((a: any) => a.type === 'ROUTING_UPDATE');
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
    listingPayments: Array.isArray(lead.listingPayments)
      ? lead.listingPayments.map(mapLeadListingPayment)
      : [],
    activities: synthesizedTimeline,
  };
};

const buildLeadSummary = (leads: Array<{ status: string }>) => {
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

type LeadInboxRecord = {
  id: string;
  enquiryType: string;
  message: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  customer: any;
  listing: any;
  dealer: any;
  listingTitleSnapshot?: string | null;
};

const getLeadGroupKey = (lead: LeadInboxRecord) => {
  const customerKey = lead.customer?.id || lead.customer?.mobile || lead.customer?.email || 'customer';
  const listingKey = lead.listing?.id || lead.listingTitleSnapshot || 'listing';
  const dealerKey = lead.dealer?.id || 'dealer';
  return `${customerKey}::${listingKey}::${dealerKey}`;
};

const groupLeadsForInbox = (leads: LeadInboxRecord[]) => {
  const grouped = new Map<
    string,
    LeadInboxRecord & { duplicateCount: number; duplicateLeadIds: string[] }
  >();

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

const resolvePublicLeadRecipient = async (partnerProfile: {
  alternateMobile?: string | null;
  user: {
    id: string;
    name?: string | null;
    mobile?: string | null;
    whatsappNumber?: string | null;
  };
}) => {
  const [settings, superAdminUser] = await Promise.all([
    getAppSettings(),
    prisma.user.findFirst({
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

  const normalizedSellerCallNumber =
    normalizePhoneNumber(partnerProfile.user.mobile) || normalizePhoneNumber(partnerProfile.alternateMobile);
  const normalizedSellerWhatsappNumber =
    normalizePhoneNumber(partnerProfile.user.whatsappNumber) || normalizedSellerCallNumber;
  const sellerCanReceivePublicLead = Boolean(normalizedSellerCallNumber || normalizedSellerWhatsappNumber);
  const useSellerContact = settings.publicLeadRouting.useSellerContact === true;

  if (useSellerContact && sellerCanReceivePublicLead) {
    return {
      recipientUserId: partnerProfile.user.id,
      routingMode: 'SELLER' as const,
      fallbackApplied: false,
    };
  }

  if (superAdminUser?.id) {
    return {
      recipientUserId: superAdminUser.id,
      routingMode: 'SUPER_ADMIN' as const,
      fallbackApplied: useSellerContact && !sellerCanReceivePublicLead,
    };
  }

  return {
    recipientUserId: partnerProfile.user.id,
    routingMode: 'SELLER' as const,
    fallbackApplied: false,
  };
};

export const createLead = async (req: Request, res: Response, next: NextFunction) => {
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

    if (
      !partnerProfile ||
      partnerProfile.onboardingStatus !== 'APPROVED' ||
      partnerProfile.accountStatus !== 'ACTIVE' ||
      partnerProfile.kycStatus !== 'APPROVED' ||
      !partnerProfile.user?.id
    ) {
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

    const calculatedEnquiryType =
      leadRecipient.routingMode === 'SUPER_ADMIN' ? 'SUPER_ADMIN_CALLBACK' : 'SELLER_CALLBACK';

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
          enquiryType: calculatedEnquiryType,
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
    } else {
      lead = await prismaAny.lead.create({
        data: {
          listingId: listing.id,
          customerId: customer.id,
          dealerId: leadRecipient.recipientUserId,
          enquiryType: calculatedEnquiryType,
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

    if (leadRecipient?.recipientUserId) {
      PushNotificationService.sendToUser(leadRecipient.recipientUserId, {
        title: 'New Machine Lead Received!',
        body: `${fullName || 'A customer'} requested a callback for ${listing.title || 'your listing'}.`,
        data: {
          path: '/leads',
        },
      }).catch((err) => console.error('Lead FCM push error:', err));
    }

    return res.status(201).json({
      message: 'Callback request submitted successfully.',
      lead: formatLead(lead),
      routing: {
        mode: leadRecipient.routingMode,
        fallbackApplied: leadRecipient.fallbackApplied,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPublicContactLead = async (req: Request, res: Response, next: NextFunction) => {
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

    const primeEligibility = await assertCustomerPrimeEligibility({
      userId: customer.id,
      role: customer.role,
      feature: enquiryType as 'CALL' | 'WHATSAPP',
    });
    if (!primeEligibility.isAllowed) {
      return res.status(403).json({
        error: `An active Prime subscription is required for ${enquiryType === 'CALL' ? 'Call' : 'WhatsApp'} access.`,
        code: 'PRIME_SUBSCRIPTION_REQUIRED',
      });
    }

    let listing: any = null;

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
    } else {
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

    if (
      !listing?.partner?.id ||
      listing.partner.partnerProfile?.onboardingStatus !== 'APPROVED' ||
      listing.partner.partnerProfile?.accountStatus !== 'ACTIVE' ||
      listing.partner.partnerProfile?.kycStatus !== 'APPROVED'
    ) {
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

    const calculatedPublicEnquiryType =
      leadRecipient.routingMode === 'SUPER_ADMIN'
        ? enquiryType === 'WHATSAPP'
          ? 'SUPER_ADMIN_WHATSAPP'
          : 'SUPER_ADMIN_CALL'
        : enquiryType === 'WHATSAPP'
        ? 'SELLER_WHATSAPP'
        : 'SELLER_CALL';

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
          enquiryType: calculatedPublicEnquiryType,
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
    } else {
      lead = await prismaAny.lead.create({
        data: {
          listingId: listing.id,
          customerId: customer.id,
          dealerId: leadRecipient.recipientUserId,
          enquiryType: calculatedPublicEnquiryType,
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

    if (leadRecipient?.recipientUserId) {
      PushNotificationService.sendToUser(leadRecipient.recipientUserId, {
        title: 'New Machine Enquiry!',
        body: `${customer.name || 'A customer'} initiated a ${enquiryType} enquiry for ${listing.title || 'your listing'}.`,
        data: {
          path: '/leads',
        },
      }).catch((err) => console.error('Enquiry FCM push error:', err));
    }

    // Keep the Superadmin informed even when the public lead was routed to a partner.
    // This is internal audit data; it never blocks the customer's enquiry.
    try {
      const superAdmin = await prismaAny.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } });
      const route = leadRecipient.routingMode === 'SELLER'
        ? 'PARTNER'
        : leadRecipient.fallbackApplied
          ? 'FALLBACK_SUPER_ADMIN'
          : 'SUPER_ADMIN';
      await prismaAny.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'ROUTING_UPDATE',
          actorId: superAdmin?.id || null,
          title: 'Lead routing recorded',
          content: route === 'PARTNER'
            ? 'Lead was routed to the partner; Superadmin copy recorded.'
            : `Lead was routed to Superadmin${route === 'FALLBACK_SUPER_ADMIN' ? ' because partner contact was unavailable.' : '.'}`,
          metadata: { route, primaryRecipientUserId: leadRecipient.recipientUserId, superadminCopied: Boolean(superAdmin?.id) },
        },
      });
      if (superAdmin?.id && superAdmin.id !== leadRecipient.recipientUserId) {
        PushNotificationService.sendToUser(superAdmin.id, {
          title: 'Lead routed to partner',
          body: `${customer.name || 'A customer'} initiated a ${enquiryType} enquiry for ${listing.title || 'a listing'}.`,
          data: { path: '/superadmin/enquiries' },
        }).catch((err) => console.error('Superadmin lead copy FCM error:', err));
      }
    } catch (err) {
      console.error('Lead routing audit error:', err);
    }

    return res.status(201).json({
      message: 'Enquiry created successfully.',
      lead: formatLead(lead),
      routing: {
        mode: leadRecipient.routingMode,
        fallbackApplied: leadRecipient.fallbackApplied,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getMyLeads = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['PARTNER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Lead access required.' });
    }

    if (req.user.role === 'EMPLOYEE' && !(await canEmployeeManageEnquiries(req.user.id))) {
      return res.status(403).json({ error: 'You do not have permission to access enquiries.' });
    }

    const requestedStatus = String(req.query.status || '').trim().toUpperCase();
    const search = String(req.query.search || '').trim();
    const statusFilter = LEAD_STATUSES.includes(requestedStatus as (typeof LEAD_STATUSES)[number])
      ? requestedStatus
      : null;

    const leadScope =
      req.user.role === 'SUPER_ADMIN' || req.user.role === 'EMPLOYEE'
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

    const groupedLeads = groupLeadsForInbox(leads as LeadInboxRecord[]);
    const groupedSummary = buildLeadSummary(groupedLeads.map((lead) => ({ status: lead.status })));

    return res.json({
      summary: groupedSummary,
      leads: groupedLeads.map((lead) => ({
        ...formatLead(lead),
        duplicateCount: lead.duplicateCount,
        duplicateLeadIds: lead.duplicateLeadIds,
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const updateLeadStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id || !['PARTNER', 'SUPER_ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Lead access required.' });
    }

    if (req.user.role === 'EMPLOYEE' && !(await canEmployeeManageEnquiries(req.user.id))) {
      return res.status(403).json({ error: 'You do not have permission to access enquiries.' });
    }

    const leadId = String(req.params.id || '').trim();
    const status = String(req.body?.status || '').trim().toUpperCase();
    const note = String(req.body?.note || '').trim();

    if (!leadId) {
      return res.status(400).json({ error: 'Lead id is required.' });
    }

    if (!LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
      return res.status(400).json({ error: 'Invalid lead status.' });
    }

    if (status === 'LOST' && !note) {
      return res.status(400).json({ error: 'Loss note is required when closing a deal as lost.' });
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

    if (
      !existingLead ||
      (req.user.role === 'PARTNER' && existingLead.dealerId !== req.user.id)
    ) {
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

    let activityPayload: {
      id: string;
      type: string;
      title: string;
      content: string;
      metadata: unknown;
      createdAt: Date;
      actor: {
        id: string;
        name: string;
        role: string;
      } | null;
    } | null = null;

    if (existingLead.status !== status) {
      const isLostDeal = status === 'LOST';
      const activity = await prismaAny.leadActivity.create({
        data: {
          leadId,
          actorId: req.user.id,
          type: 'STATUS_CHANGE',
          title: isLostDeal
            ? 'Deal Closed - Lost'
            : `Status changed to ${status.replace(/_/g, ' ')}`,
          content:
            isLostDeal
              ? note || 'Deal was closed as lost.'
              : `Lead status was updated from ${existingLead.status} to ${status}.`,
          metadata: {
            fromStatus: existingLead.status,
            toStatus: status,
            note: isLostDeal ? note || undefined : undefined,
            isLostDeal,
          },
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
      }).catch((err: any) => {
        console.error('Failed to record status change activity:', err);
        return null;
      });

      if (activity) {
        activityPayload = {
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
        };
      }

      if (existingLead.customerId) {
        PushNotificationService.sendToUser(existingLead.customerId, {
          title: 'Enquiry Status Updated',
          body: `Your machine enquiry status is now ${status.replace(/_/g, ' ')}.`,
          data: {
            path: '/leads',
          },
        }).catch((err) => console.error('Lead status FCM push error:', err));
      }
    }

    return res.json({
      message: 'Lead status updated successfully.',
      lead: formatLead(updatedLead),
      activity: activityPayload,
    });
  } catch (error) {
    next(error);
  }
};

export const getLeadById = async (req: Request, res: Response, next: NextFunction) => {
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

    if (
      req.user.role === 'PARTNER' &&
      lead.dealerId !== req.user.id &&
      lead.listing?.partner?.id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Access denied to this lead.' });
    }

    const listingPayments = await prismaAny.listingPaymentSubmission.findMany({
      where: {
        buyerId: lead.customerId,
      },
      orderBy: { submittedAt: 'desc' },
      take: 25,
      select: leadListingPaymentSelect,
    });

    const sortedListingPayments = listingPayments
      .map((payment: any) => ({
        ...payment,
        isForCurrentListing: Boolean(lead.listingId && payment.listingId === lead.listingId),
      }))
      .sort((first: any, second: any) => {
        if (first.isForCurrentListing !== second.isForCurrentListing) {
          return first.isForCurrentListing ? -1 : 1;
        }

        return new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
      });

    return res.json({
      lead: formatDetailedLead({
        ...lead,
        listingPayments: sortedListingPayments,
      }),
    });
  } catch (error) {
    next(error);
  }
};

export const addLeadActivity = async (req: Request, res: Response, next: NextFunction) => {
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
    const title =
      String(req.body?.title || '').trim() ||
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

    if (
      req.user.role === 'PARTNER' &&
      lead.dealerId !== req.user.id &&
      lead.listing?.partnerId !== req.user.id
    ) {
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
  } catch (error) {
    next(error);
  }
};

export const getMyLeadBadges = async (req: Request, res: Response, next: NextFunction) => {
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
  } catch (error) {
    next(error);
  }
};
