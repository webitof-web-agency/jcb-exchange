import prisma from '../lib/prisma';
import { GstVerificationError, gstVerificationService } from './gstVerification.service';
import { normalizeGstin, validateGstin } from './gstVerification.validation';
import { extractGstVerifiedProfileFields } from './gstVerifiedProfileFields';

type PartnerGstReverificationInput = {
  partnerUserId: string;
  actorUserId: string;
  gstin: unknown;
  reason: unknown;
};

type PartnerGstReverificationDependencies = {
  db?: any;
  verifyGstin?: (input: Record<string, unknown>, requestedById: string) => Promise<any>;
};

export class PartnerGstReverificationError extends Error {
  constructor(message: string, public readonly statusCode: number, public readonly code: string) {
    super(message);
    this.name = 'PartnerGstReverificationError';
  }
}

const validReason = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

/** Replaces the GST link only after an admin-triggered provider verification succeeds. */
export class PartnerGstReverificationService {
  private readonly db: any;
  private readonly verify: (input: Record<string, unknown>, requestedById: string) => Promise<any>;

  constructor(dependencies: PartnerGstReverificationDependencies = {}) {
    this.db = dependencies.db || prisma;
    this.verify = dependencies.verifyGstin || ((input, requestedById) => gstVerificationService.verifyGstin(input, requestedById));
  }

  async reverify(input: PartnerGstReverificationInput) {
    const partnerUserId = String(input.partnerUserId || '').trim();
    const actorUserId = String(input.actorUserId || '').trim();
    const reason = validReason(input.reason);
    const gstin = normalizeGstin(input.gstin);
    if (!partnerUserId || !actorUserId) throw new PartnerGstReverificationError('A valid partner and administrator are required.', 400, 'invalid_request');
    if (reason.length < 5 || reason.length > 1000) throw new PartnerGstReverificationError('Enter a GST re-verification reason between 5 and 1000 characters.', 400, 'invalid_reason');
    const validationError = validateGstin(gstin);
    if (validationError) throw new PartnerGstReverificationError(validationError, 400, 'invalid_gstin');

    const partner = await this.db.partnerProfile.findUnique({
      where: { userId: partnerUserId },
      select: { id: true, userId: true, gstNumber: true, gstVerificationRecordId: true, gstVerifiedAt: true },
    });
    if (!partner) throw new PartnerGstReverificationError('Partner not found.', 404, 'partner_not_found');

    let verification: any;
    try {
      verification = await this.verify({ gstin }, actorUserId);
    } catch (error) {
      if (error instanceof GstVerificationError) throw error;
      throw error;
    }
    const recordId = typeof verification?.record?.id === 'string' ? verification.record.id : '';
    if (!recordId || verification?.record?.status !== 'SUCCESS') {
      throw new PartnerGstReverificationError('GST verification did not produce a successful record.', 409, 'verification_not_successful');
    }

    const verifiedAt = new Date();
    const verifiedProfileFields = extractGstVerifiedProfileFields(verification.result);
    return this.db.$transaction(async (tx: any) => {
      const before = await tx.partnerProfile.findUnique({
        where: { id: partner.id },
        select: {
          gstNumber: true,
          gstVerificationRecordId: true,
          gstVerifiedAt: true,
          gstVerifiedMobile: true,
          gstVerifiedEmail: true,
          gstVerifiedAddress: true,
        },
      });
      if (!before) throw new PartnerGstReverificationError('Partner not found.', 404, 'partner_not_found');

      const profile = await tx.partnerProfile.update({
        where: { id: partner.id },
        data: {
          gstNumber: gstin,
          gstVerificationRecordId: recordId,
          gstVerifiedAt: verifiedAt,
          ...(verifiedProfileFields.mobile ? { gstVerifiedMobile: verifiedProfileFields.mobile } : {}),
          ...(verifiedProfileFields.email ? { gstVerifiedEmail: verifiedProfileFields.email } : {}),
          ...(verifiedProfileFields.address ? { gstVerifiedAddress: verifiedProfileFields.address } : {}),
        },
      });
      if (before.gstVerificationRecordId && before.gstVerificationRecordId !== recordId) {
        await tx.gstVerificationRecord.update({
          where: { id: before.gstVerificationRecordId },
          data: { supersededAt: verifiedAt, supersededByRecordId: recordId, supersededReason: reason },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId,
          entityType: 'PARTNER_PROFILE',
          entityId: partner.id,
          action: 'PARTNER_GST_REVERIFIED',
          beforeJson: {
            gstNumber: before.gstNumber || null,
            gstVerificationRecordId: before.gstVerificationRecordId || null,
            gstVerifiedAt: before.gstVerifiedAt || null,
          },
          afterJson: { gstNumber: gstin, gstVerificationRecordId: recordId, gstVerifiedAt: verifiedAt.toISOString(), reason },
        },
      });
      await tx.notification.create({
        data: {
          userId: partner.userId,
          title: 'GST verification updated',
          message: 'Your GST verification was updated by JCB Exchange. Log in to review your business profile.',
          type: 'PARTNER_GST_REVERIFIED',
          link: '/partner/kyc',
        },
      });
      return { profile, verificationRecordId: recordId, verifiedAt };
    });
  }
}

export const partnerGstReverificationService = new PartnerGstReverificationService();
