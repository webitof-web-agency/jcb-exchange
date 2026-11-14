import prisma from '../../lib/prisma';
import { finalizeListingPaymentSale } from '../../utils/listingPaymentFinalization';
import { assertListingStatusChangeAllowed } from '../listingVehicleIdentity';
import { moderateListing } from '../listingModeration.service';
import { dispatchApprovedWhatsAppTemplate } from '../whatsappIntegration.service';
import { normalizeWhatsAppRecipientPhone } from '../../modules/whatsapp-core';
import { approveSellAccountRefund } from '../sellAccountRefund.service';
import {
  registerControlledActionExecutor,
  type ControlledProposalView,
} from './aiControlledAutomation.service';

const payloadText = (proposal: ControlledProposalView, key: string) => {
  const value = proposal.payload[key];
  return typeof value === 'string' ? value.trim() : '';
};

const requireRecord = async <T>(value: T | null, message: string): Promise<T> => {
  if (!value) throw new Error(message);
  return value;
};

const executePartnerKycDecision = async (proposal: ControlledProposalView, actorUserId: string) => {
  const status = payloadText(proposal, 'status');
  const reason = payloadText(proposal, 'reason');
  const partner = await requireRecord(
    await prisma.partnerProfile.findFirst({ where: { OR: [{ id: proposal.targetRef }, { userId: proposal.targetRef }] }, select: { id: true, userId: true, kycStatus: true } }),
    'Partner KYC case was not found.',
  );
  await prisma.$transaction(async (tx) => {
    if (status === 'APPROVED') {
      await tx.user.update({ where: { id: partner.userId }, data: { role: 'PARTNER' } });
    }
    await tx.partnerProfile.update({
      where: { id: partner.id },
      data: {
        kycStatus: status as any,
        onboardingStatus: status === 'APPROVED' ? 'APPROVED' : status === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : status === 'REJECTED' ? 'REJECTED' : 'REVIEW_PENDING',
        accountStatus: status === 'APPROVED' ? 'ACTIVE' : 'PENDING',
        approvedById: status === 'APPROVED' ? actorUserId : null,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      },
    });
    await tx.kycReviewLog.create({
      data: {
        partnerProfileId: partner.id,
        actorUserId,
        action: `AI_APPROVED_${status}`,
        comment: reason || null,
      },
    });
  });
  return { executionRef: `partner-kyc:${partner.id}` };
};

const executeAccountStatusChange = async (proposal: ControlledProposalView, actorUserId: string) => {
  const status = payloadText(proposal, 'status');
  if (proposal.targetRef === actorUserId) throw new Error('An operator cannot change their own account status.');
  const user = await requireRecord(
    await prisma.user.findUnique({ where: { id: proposal.targetRef }, select: { id: true, role: true, status: true, partnerProfile: { select: { id: true, accountStatus: true, onboardingStatus: true, kycStatus: true } } } }),
    'User account was not found.',
  );
  if (user.role === 'SUPER_ADMIN') throw new Error('Super admin account status cannot be changed through an AI action.');
  if (status === 'CLOSED' && user.partnerProfile) throw new Error('Partner archive workflow is required for closing a partner account.');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { status: status as any } });
    if (user.partnerProfile) {
      const partnerStatus = status === 'BLOCKED' ? 'BLOCKED' : status === 'SUSPENDED' ? 'SUSPENDED' : status === 'ACTIVE' || status === 'INACTIVE'
        ? (user.partnerProfile.accountStatus === 'ACTIVE' || (user.partnerProfile.onboardingStatus === 'APPROVED' && user.partnerProfile.kycStatus === 'APPROVED') ? 'ACTIVE' : 'PENDING')
        : 'PENDING';
      await tx.partnerProfile.update({ where: { id: user.partnerProfile.id }, data: { accountStatus: partnerStatus as any } });
    }
  });
  return { executionRef: `account-status:${user.id}` };
};

const executeLeadAssignment = async (proposal: ControlledProposalView, actorUserId: string) => {
  const ownerId = payloadText(proposal, 'ownerId');
  const [lead, owner] = await Promise.all([
    prisma.lead.findUnique({ where: { id: proposal.targetRef }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: ownerId, status: 'ACTIVE', role: { in: ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'] } }, select: { id: true } }),
  ]);
  await requireRecord(lead, 'CRM lead was not found.');
  await requireRecord(owner, 'The selected lead owner is not an active internal operator.');
  await prisma.$transaction([
    prisma.lead.update({ where: { id: proposal.targetRef }, data: { ownerId, assignedAt: new Date() } }),
    prisma.leadActivity.create({
      data: {
        leadId: proposal.targetRef,
        actorId: actorUserId,
        type: 'ROUTING_UPDATE',
        title: 'Lead assigned through approved AI action',
        content: null,
        metadata: { source: 'AI_APPROVED_ACTION' },
      },
    }),
  ]);
  return { executionRef: `lead-assignment:${proposal.targetRef}` };
};

const executePaymentReview = async (proposal: ControlledProposalView, actorUserId: string) => {
  const status = payloadText(proposal, 'status');
  const reason = payloadText(proposal, 'reason');
  const payment = await requireRecord(
    await prisma.listingPaymentSubmission.findUnique({ where: { id: proposal.targetRef }, select: { id: true, method: true, status: true } }),
    'Listing payment submission was not found.',
  );
  if (payment.method !== 'RTGS' || payment.status !== 'PENDING_VERIFICATION') {
    throw new Error('Only a pending RTGS payment can be reviewed through this action.');
  }
  await prisma.listingPaymentSubmission.update({
    where: { id: payment.id },
    data: {
      status: status as any,
      reviewedByUserId: actorUserId,
      reviewedAt: new Date(),
      rejectionReason: status === 'REJECTED' ? reason || 'Payment proof could not be verified.' : null,
    },
  });
  if (status === 'APPROVED') await finalizeListingPaymentSale(payment.id);
  return { executionRef: `payment-review:${payment.id}` };
};

const executePaymentRefundApproval = async (proposal: ControlledProposalView, actorUserId: string) => {
  const refund = await requireRecord(
    await prisma.sellAccountRefund.findUnique({ where: { id: proposal.targetRef }, select: { id: true, sellAccountId: true } }),
    'Sell-account refund was not found.',
  );
  const actor = await requireRecord(await prisma.user.findUnique({ where: { id: actorUserId }, select: { id: true, role: true } }), 'Executing operator was not found.');
  const updated = await approveSellAccountRefund(refund.sellAccountId, refund.id, { id: actor.id, role: actor.role });
  if (!updated) throw new Error('Sell-account refund could not be approved.');
  return { executionRef: `refund-approval:${refund.id}` };
};

const executeWhatsAppSend = async (proposal: ControlledProposalView) => {
  const templateId = payloadText(proposal, 'templateId');
  const lead = await requireRecord(
    await prisma.lead.findUnique({ where: { id: proposal.targetRef }, select: { id: true, listingTitleSnapshot: true, customer: { select: { mobile: true, whatsappNumber: true } } } }),
    'CRM lead was not found.',
  );
  const phone = normalizeWhatsAppRecipientPhone(lead.customer.whatsappNumber || lead.customer.mobile);
  if (!phone) throw new Error('The lead has no valid WhatsApp number.');
  const consent = await prisma.whatsAppConsent.findUnique({ where: { phone_category: { phone, category: 'MARKETING' } }, select: { optedIn: true } });
  if (!consent?.optedIn) throw new Error('The lead has not opted in to marketing WhatsApp messages.');
  const result = await dispatchApprovedWhatsAppTemplate({
    eventCode: 'WHATSAPP_CAMPAIGN',
    relatedEntityType: 'CRM_LEAD',
    relatedEntityId: lead.id,
    templateId,
    recipientType: 'CUSTOMER',
    recipientPhone: phone,
    payloadSnapshot: { listingTitle: lead.listingTitleSnapshot || undefined, source: 'AI_APPROVED_ACTION' },
  });
  return { executionRef: `whatsapp:${lead.id}:${result.messageLogId || 'queued'}` };
};

const executeListingStatusChange = async (proposal: ControlledProposalView, actorUserId: string) => {
  const status = payloadText(proposal, 'status');
  const reason = payloadText(proposal, 'reason');
  const listing = await requireRecord(
    await prisma.listing.findUnique({ where: { id: proposal.targetRef }, select: { id: true, status: true, title: true, registrationNumberKey: true, chassisNumberKey: true, partnerId: true } }),
    'Listing was not found.',
  );

  if (status === 'UNLISTED') {
    await moderateListing({ listingId: listing.id, action: 'UNLIST', reason, viewer: { id: actorUserId, isAdmin: true }, notify: true });
    return { executionRef: `listing-status:${listing.id}` };
  }
  if (status === 'PUBLISHED' && listing.status === 'UNLISTED') {
    await moderateListing({ listingId: listing.id, action: 'RELIST', viewer: { id: actorUserId, isAdmin: true }, notify: true });
    return { executionRef: `listing-status:${listing.id}` };
  }
  if (status === 'PUBLISHED') await assertListingStatusChangeAllowed(prisma, listing, status, actorUserId);
  await prisma.$transaction(async (tx) => {
    await tx.listing.update({ where: { id: listing.id }, data: { status: status as any, ...(status !== 'PUBLISHED' && reason ? { moderationReason: reason } : {}) } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        entityType: 'LISTING',
        entityId: listing.id,
        action: 'AI_APPROVED_LISTING_STATUS_CHANGE',
        beforeJson: { status: listing.status },
        afterJson: { status, reason: reason || null },
      },
    });
  });
  return { executionRef: `listing-status:${listing.id}` };
};

export const registerPhase2ControlledActionExecutors = () => {
  registerControlledActionExecutor('PARTNER_KYC_DECISION', executePartnerKycDecision);
  registerControlledActionExecutor('ACCOUNT_STATUS_CHANGE', executeAccountStatusChange);
  registerControlledActionExecutor('LEAD_ASSIGNMENT', executeLeadAssignment);
  registerControlledActionExecutor('PAYMENT_REVIEW', executePaymentReview);
  registerControlledActionExecutor('PAYMENT_REFUND', executePaymentRefundApproval);
  registerControlledActionExecutor('LISTING_STATUS_CHANGE', executeListingStatusChange);
  registerControlledActionExecutor('WHATSAPP_SEND', executeWhatsAppSend);
};

registerPhase2ControlledActionExecutors();
