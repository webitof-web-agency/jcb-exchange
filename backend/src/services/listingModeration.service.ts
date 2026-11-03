import prisma from '../lib/prisma';
import { PushNotificationService } from './pushNotification.service';
import { dispatchMarketplaceWhatsApp } from './whatsappIntegration.service';
import { assertListingStatusChangeAllowed } from './listingVehicleIdentity';

// Unlist, suspend and block take a listing off the website without deleting it.
//
//   UNLISTED   the seller or an admin hid it; the seller can relist it themselves
//   SUSPENDED  an admin hid it until something is fixed; the seller can fix it and ask for review
//   BLOCKED    an admin hid it for good (fraud, stolen or fake vehicle); its vehicle and chassis
//              numbers cannot be listed again while it stays blocked (see listingVehicleIdentity)
//
// These statuses are only set and lifted here, so every change has a reason and an audit entry.

export const MODERATED_LISTING_STATUSES = ['UNLISTED', 'SUSPENDED', 'BLOCKED'] as const;

export const isModeratedListingStatus = (status: unknown) =>
  (MODERATED_LISTING_STATUSES as readonly string[]).includes(String(status || '').toUpperCase());

export type ListingModerationAction = 'UNLIST' | 'RELIST' | 'SUSPEND' | 'RESTORE' | 'BLOCK' | 'UNBLOCK' | 'REQUEST_REVIEW';

type Rule = {
  from: string[];
  to: string;
  /** Who may take the action. */
  by: 'ADMIN' | 'OWNER' | 'ADMIN_OR_OWNER';
  reasonRequired: boolean;
  /** Message to the seller when an admin takes the action. */
  notice: (title: string, reason: string) => string;
};

const LIVE = ['PUBLISHED', 'PAUSED', 'RESERVED'];

const RULES: Record<ListingModerationAction, Rule> = {
  UNLIST: {
    from: LIVE,
    to: 'UNLISTED',
    by: 'ADMIN_OR_OWNER',
    reasonRequired: false,
    notice: (title, reason) => `Your listing "${title}" was unlisted by JCB Exchange and is hidden from the website.${reason ? ` Reason: ${reason}` : ''} You can relist it from your listings.`,
  },
  RELIST: {
    from: ['UNLISTED'],
    to: 'PUBLISHED',
    by: 'ADMIN_OR_OWNER',
    reasonRequired: false,
    notice: (title) => `Your listing "${title}" is live on the website again.`,
  },
  SUSPEND: {
    from: ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'PUBLISHED', 'PAUSED', 'RESERVED', 'UNLISTED', 'REJECTED'],
    to: 'SUSPENDED',
    by: 'ADMIN',
    reasonRequired: true,
    notice: (title, reason) => `Your listing "${title}" was suspended by JCB Exchange and is hidden from the website. Reason: ${reason}. Fix the listing and send it for review.`,
  },
  RESTORE: {
    from: ['SUSPENDED'],
    to: 'PUBLISHED',
    by: 'ADMIN',
    reasonRequired: false,
    notice: (title) => `The suspension on your listing "${title}" was lifted. It is live on the website again.`,
  },
  BLOCK: {
    from: ['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'PUBLISHED', 'PAUSED', 'RESERVED', 'UNLISTED', 'SUSPENDED', 'REJECTED'],
    to: 'BLOCKED',
    by: 'ADMIN',
    reasonRequired: true,
    notice: (title, reason) => `Your listing "${title}" was blocked by JCB Exchange. Reason: ${reason}. Contact support if you think this is a mistake.`,
  },
  UNBLOCK: {
    from: ['BLOCKED'],
    to: 'UNLISTED',
    by: 'ADMIN',
    reasonRequired: false,
    notice: (title) => `Your listing "${title}" was unblocked. It is still hidden; relist it when you are ready.`,
  },
  REQUEST_REVIEW: {
    from: ['SUSPENDED'],
    to: 'PENDING_APPROVAL',
    by: 'OWNER',
    reasonRequired: false,
    notice: () => '',
  },
};

export class ListingModerationError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ListingModerationError';
  }
}

export const listingModerationActions = Object.keys(RULES) as ListingModerationAction[];

/** Actions this viewer may take on a listing in its current status (drives the menus). */
export const availableModerationActions = (status: unknown, viewer: { isAdmin: boolean; isOwner: boolean }) =>
  listingModerationActions.filter((action) => {
    const rule = RULES[action];
    if (!rule.from.includes(String(status || '').toUpperCase())) return false;
    if (rule.by === 'ADMIN') return viewer.isAdmin;
    if (rule.by === 'OWNER') return viewer.isOwner && !viewer.isAdmin;
    return viewer.isAdmin || viewer.isOwner;
  });

const ownerListingsPath = (role: unknown) => (String(role || '').toUpperCase() === 'CUSTOMER' ? '/profile/listings' : '/partner/listings');

const notifyOwner = async (listing: any, title: string, message: string, status: string) => {
  const owner = listing.partner;
  if (!owner?.id) return;
  const link = ownerListingsPath(owner.role);
  await prisma.notification.create({ data: { userId: owner.id, title, message, type: 'LISTING_UPDATE', link } });
  PushNotificationService.sendToUser(owner.id, { title, body: message, icon: '/icon.png', url: link, path: link, data: { path: link, url: link } })
    .catch((error) => console.error('Push notification failed:', error));
  if (String(owner.role || '').toUpperCase() === 'PARTNER') {
    void dispatchMarketplaceWhatsApp({
      eventCode: 'PARTNER_LISTING_STATUS_UPDATED',
      relatedEntityType: 'LISTING',
      relatedEntityId: listing.id,
      recipientType: 'PARTNER',
      recipientPhone: owner.whatsappNumber || owner.mobile,
      payloadSnapshot: { listingId: listing.id, listingTitle: listing.title, listingStatus: status },
    });
  }
};

export const moderateListing = async (input: {
  listingId: string;
  action: unknown;
  reason?: unknown;
  notify?: unknown;
  viewer: { id: string; isAdmin: boolean };
}) => {
  const action = String(input.action || '').toUpperCase() as ListingModerationAction;
  const rule = RULES[action];
  if (!rule) throw new ListingModerationError('Unknown listing action.');
  const reason = String(input.reason || '').trim().slice(0, 1000);

  const listing = await (prisma as any).listing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true,
      title: true,
      status: true,
      partnerId: true,
      registrationNumberKey: true,
      chassisNumberKey: true,
      partner: { select: { id: true, role: true, mobile: true, whatsappNumber: true } },
    },
  });
  const isOwner = Boolean(listing && listing.partnerId === input.viewer.id);
  if (!listing || (!input.viewer.isAdmin && !isOwner)) throw new ListingModerationError('Listing not found.', 404);
  if (!availableModerationActions(listing.status, { isAdmin: input.viewer.isAdmin, isOwner }).includes(action)) {
    const status = String(listing.status).replace(/_/g, ' ').toLowerCase();
    throw new ListingModerationError(
      rule.by === 'ADMIN' && !input.viewer.isAdmin
        ? 'Only JCB Exchange admins can do this.'
        : `This cannot be done while the listing is ${status}.`,
      rule.by === 'ADMIN' && !input.viewer.isAdmin ? 403 : 400,
    );
  }
  if (rule.reasonRequired && reason.length < 5) throw new ListingModerationError('Enter the reason (at least 5 characters). The seller sees it.');

  // Going live again must not sit beside another open listing of the same vehicle.
  if (rule.to === 'PUBLISHED') await assertListingStatusChangeAllowed(prisma, listing, rule.to, input.viewer.id);

  const hides = ['UNLISTED', 'SUSPENDED', 'BLOCKED'].includes(rule.to) && action !== 'UNBLOCK';
  const updated = await prisma.$transaction(async (tx) => {
    const next = await (tx as any).listing.update({
      where: { id: listing.id },
      data: {
        status: rule.to,
        moderationReason: hides ? reason || null : null,
        moderatedAt: hides ? new Date() : null,
        moderatedById: hides ? input.viewer.id : null,
      },
      select: { id: true, status: true, moderationReason: true, moderatedAt: true, moderatedById: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.viewer.id,
        entityType: 'LISTING',
        entityId: listing.id,
        action: `LISTING_${action}`,
        beforeJson: { status: listing.status },
        afterJson: { status: rule.to, reason: reason || null },
      },
    });
    return next;
  });

  const notify = input.notify === undefined ? true : Boolean(input.notify);
  if (notify && !isOwner && rule.by !== 'OWNER') {
    await notifyOwner(listing, 'Listing status updated', rule.notice(listing.title, reason), rule.to)
      .catch((error) => console.error('Listing moderation notification failed:', error));
  }
  return updated;
};
