// Tells the seller that an admin changed their listing's status: in-app notification, push, and the
// PARTNER_LISTING_STATUS_UPDATED WhatsApp/SMS automation. Used by every admin status route so the
// seller is notified whichever screen the admin used.
import prisma from '../lib/prisma';
import { PushNotificationService } from './pushNotification.service';
import { dispatchMarketplaceWhatsApp } from './whatsappIntegration.service';

const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'approved and live',
  CHANGES_REQUESTED: 'sent back for changes',
  PENDING_APPROVAL: 'pending approval',
  REJECTED: 'rejected',
  PAUSED: 'paused',
  RESERVED: 'reserved',
  SOLD: 'marked as sold',
  DRAFT: 'moved to draft',
};

export const notifySellerOfListingStatus = async (input: {
  listing: { id: string; title: string };
  partner: { id: string; mobile?: string | null; whatsappNumber?: string | null } | null | undefined;
  status: string;
  note?: string | null;
}) => {
  const { listing, partner, status } = input;
  if (!partner?.id) return;
  const label = STATUS_LABEL[status] || status.replaceAll('_', ' ').toLowerCase();
  const note = input.note?.trim();

  try {
    await (prisma as any).notification.create({
      data: {
        userId: partner.id,
        title: 'Listing Status Updated',
        message: `Your listing "${listing.title}" is ${label}.${note ? ` Note: ${note}` : ''}`,
        type: 'LISTING_UPDATE',
        link: '/partner/listings',
      },
    });
  } catch (error) {
    console.error('[listing-status] in-app notification failed', error);
  }

  PushNotificationService.sendToUser(partner.id, {
    title: 'Listing Status Updated',
    body: `Your listing "${listing.title}" is ${label}.`,
    icon: '/icon.png',
    url: '/partner/listings',
    path: '/partner/listings',
    data: { path: '/partner/listings', url: '/partner/listings' },
  }).catch((error) => console.error('[listing-status] push failed', error));

  void dispatchMarketplaceWhatsApp({
    eventCode: 'PARTNER_LISTING_STATUS_UPDATED',
    relatedEntityType: 'LISTING',
    relatedEntityId: listing.id,
    recipientType: 'PARTNER',
    recipientPhone: partner.whatsappNumber || partner.mobile,
    // Status in the dedupe suffix: each real status change notifies once, retries of the same one do not.
    dedupeSuffix: status,
    payloadSnapshot: { listingId: listing.id, listingTitle: listing.title, listingStatus: status },
  });
};
