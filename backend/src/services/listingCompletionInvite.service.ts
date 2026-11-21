import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { assertVehicleIdentityAvailable, lockVehicleIdentityKeys, toVehicleIdentityKey } from './listingVehicleIdentity';
import { deleteFileFromDrive, extractDriveFileId } from './googleDrive.service';
import { canSubmitCompletionForPartnerReview } from './listingCompletionReviewPolicy';
import { syncListingRtoForListing, validateListingRtoDetails } from './listingRto.service';
import { getListingCompletionMediaSlot, isListingCompletionMediaSlot } from './listingCompletionMediaPolicy';
import type { ListingCompletionOwnerPayload } from './listingCompletionOwnerPayload';

const DEFAULT_TTL_HOURS = 72;
const MAX_TTL_HOURS = 168;

export type ListingCompletionInviteStatus = 'ACTIVE' | 'SUBMITTED' | 'EXPIRED' | 'REVOKED';

export class ListingCompletionInviteError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'EXPIRED' | 'USED' | 'REVOKED' | 'INVALID_STATE' | 'FORBIDDEN',
  ) {
    super(message);
    this.name = 'ListingCompletionInviteError';
  }
}

export const createListingCompletionToken = () => randomBytes(32).toString('base64url');

export const hashListingCompletionToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const isListingCompletionInviteUsable = (
  invite: { status: string; expiresAt: Date },
  now = new Date(),
) => invite.status === 'ACTIVE' && invite.expiresAt.getTime() > now.getTime();

const normalizeTtlHours = (ttlHours?: number) => {
  if (ttlHours == null) return DEFAULT_TTL_HOURS;
  if (!Number.isInteger(ttlHours) || ttlHours < 1 || ttlHours > MAX_TTL_HOURS) {
    throw new ListingCompletionInviteError('Expiry must be between 1 and 168 hours.', 'INVALID_STATE');
  }
  return ttlHours;
};

const deleteTemporaryDriveFiles = async (urls: string[]) => {
  const fileIds = [...new Set(urls.map((url) => extractDriveFileId(url)).filter((id): id is string => Boolean(id)))];
  await Promise.all(fileIds.map((fileId) => deleteFileFromDrive(fileId).catch((error) => {
    console.error('Failed to remove expired listing-completion media from Drive:', fileId, error);
  })));
};

const getUnclaimedUploadUrls = async (db: typeof prisma, inviteId: string) => {
  const uploads = await db.listingCompletionUpload.findMany({
    where: { inviteId, claimedAt: null },
    select: { fileUrl: true },
  });
  return uploads.map((upload) => upload.fileUrl);
};

const getInviteWithListing = async (token: string) => {
  const tokenHash = hashListingCompletionToken(token.trim());
  const invite = await prisma.listingCompletionInvite.findUnique({
    where: { tokenHash },
    include: {
      listing: {
        select: {
          id: true,
          partnerId: true,
          status: true,
          title: true,
          ownerName: true,
          price: true,
          manufacturingYear: true,
          locationState: true,
          locationCity: true,
          address: true,
          condition: true,
          description: true,
          additionalDescription: true,
          grossPower: true,
          engineNumber: true,
          isNegotiable: true,
          operatingHours: true,
          registrationNumberKey: true,
          chassisNumberKey: true,
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          model: { select: { id: true, name: true } },
          media: { select: { id: true, url: true, type: true, slot: true, isFeatured: true } },
          rtoRecords: {
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: {
              vehicleNumber: true,
              vehicleType: true,
              vehicleModel: true,
              hirePurchaseStatus: true,
              financerName: true,
              taxStatus: true,
              taxValidUntil: true,
              fitnessStatus: true,
              fitnessValidUntil: true,
              insuranceStatus: true,
              insuranceValidUntil: true,
              pucStatus: true,
              pucValidUntil: true,
              hsrpStatus: true,
              hsrpNumber: true,
              rtoOffice: true,
              rtoAgentName: true,
              rtoExpenses: true,
              vehicleMaintenanceCost: true,
              hourRunning: true,
            },
          },
        },
      },
      uploads: {
        where: { claimedAt: null },
      select: { id: true, fileUrl: true, fileName: true, mimeType: true, mediaType: true, slot: true },
      },
    },
  });

  if (!invite) throw new ListingCompletionInviteError('This completion link is invalid.', 'NOT_FOUND');
  if (invite.status === 'SUBMITTED') throw new ListingCompletionInviteError('This completion link has already been used.', 'USED');
  if (invite.status === 'REVOKED') throw new ListingCompletionInviteError('This completion link has been revoked.', 'REVOKED');
  if (invite.status === 'EXPIRED' || invite.expiresAt <= new Date()) {
    if (invite.status === 'ACTIVE') {
      await prisma.listingCompletionInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
    }
    const temporaryFiles = await getUnclaimedUploadUrls(prisma, invite.id);
    await prisma.listingCompletionUpload.deleteMany({ where: { inviteId: invite.id, claimedAt: null } });
    await deleteTemporaryDriveFiles(temporaryFiles);
    throw new ListingCompletionInviteError('This completion link has expired.', 'EXPIRED');
  }
  if (invite.listing.status !== 'DRAFT') {
    throw new ListingCompletionInviteError('This vehicle listing is no longer open for completion.', 'INVALID_STATE');
  }

  return { invite, tokenHash };
};

export const createListingCompletionInvite = async ({
  listingId,
  partnerId,
  ttlHours,
}: {
  listingId: string;
  partnerId: string;
  ttlHours?: number;
}) => {
  const ttl = normalizeTtlHours(ttlHours);
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { id: true, partnerId: true, status: true },
  });

  if (!listing || listing.partnerId !== partnerId) {
    throw new ListingCompletionInviteError('Listing not found.', 'NOT_FOUND');
  }
  if (listing.status !== 'DRAFT') {
    throw new ListingCompletionInviteError('A completion link can only be created for a draft listing.', 'INVALID_STATE');
  }

  const submittedInvite = await prisma.listingCompletionInvite.findFirst({
    where: { listingId, partnerId, status: 'SUBMITTED' as any },
    select: { id: true },
  });
  if (submittedInvite) {
    throw new ListingCompletionInviteError(
      'This vehicle has already been completed by the owner and is waiting for partner review.',
      'INVALID_STATE',
    );
  }

  const token = createListingCompletionToken();
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);
  const { invite, temporaryFiles } = await prisma.$transaction(async (tx) => {
    const staleInvites = await tx.listingCompletionInvite.findMany({
      where: { listingId, partnerId, status: 'ACTIVE' },
      select: { id: true },
    });
    const staleFiles = staleInvites.length
      ? await tx.listingCompletionUpload.findMany({
          where: { inviteId: { in: staleInvites.map((item) => item.id) }, claimedAt: null },
          select: { fileUrl: true },
        })
      : [];
    await tx.listingCompletionInvite.updateMany({
      where: { listingId, partnerId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await tx.listingCompletionUpload.deleteMany({
      where: { inviteId: { in: staleInvites.map((item) => item.id) }, claimedAt: null },
    });
    return {
      invite: await tx.listingCompletionInvite.create({
      data: { listingId, partnerId, tokenHash: hashListingCompletionToken(token), expiresAt },
      select: { id: true, expiresAt: true },
      }),
      temporaryFiles: staleFiles.map((item) => item.fileUrl),
    };
  });
  await deleteTemporaryDriveFiles(temporaryFiles);

  return { ...invite, token };
};

export const getListingCompletionInvite = async (token: string) => {
  const { invite } = await getInviteWithListing(token);
  await prisma.listingCompletionInvite.update({
    where: { id: invite.id },
    data: { lastAccessedAt: new Date() },
  });
  return {
    inviteId: invite.id,
    expiresAt: invite.expiresAt,
    listing: invite.listing,
    uploads: invite.uploads,
  };
};

export const revokeListingCompletionInvite = async ({ listingId, partnerId }: { listingId: string; partnerId: string }) => {
  const { result, temporaryFiles } = await prisma.$transaction(async (tx) => {
    const invites = await tx.listingCompletionInvite.findMany({ where: { listingId, partnerId, status: 'ACTIVE' }, select: { id: true } });
    const uploads = invites.length
      ? await tx.listingCompletionUpload.findMany({ where: { inviteId: { in: invites.map((invite) => invite.id) }, claimedAt: null }, select: { fileUrl: true } })
      : [];
    const update = await tx.listingCompletionInvite.updateMany({
      where: { listingId, partnerId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await tx.listingCompletionUpload.deleteMany({ where: { inviteId: { in: invites.map((invite) => invite.id) }, claimedAt: null } });
    return { result: update, temporaryFiles: uploads.map((upload) => upload.fileUrl) };
  });
  await deleteTemporaryDriveFiles(temporaryFiles);
  return result.count;
};

export const getActiveListingCompletionInvite = async ({ listingId, partnerId }: { listingId: string; partnerId: string }) =>
  prisma.listingCompletionInvite.findFirst({
    where: { listingId, partnerId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, expiresAt: true, createdAt: true },
  });

export type ListingCompletionPayload = ListingCompletionOwnerPayload;

export const submitListingCompletion = async (token: string, payload: ListingCompletionPayload) => {
  // Resolve expiry and clean any abandoned uploads before entering the one-time submit transaction.
  await getInviteWithListing(token);
  const tokenHash = hashListingCompletionToken(token.trim());
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const invite = await tx.listingCompletionInvite.findUnique({
      where: { tokenHash },
      include: { listing: { select: { id: true, status: true, media: { select: { id: true, type: true, slot: true } } } } },
    });
    if (!invite) throw new ListingCompletionInviteError('This completion link is invalid.', 'NOT_FOUND');
    if (invite.status === 'SUBMITTED') throw new ListingCompletionInviteError('This completion link has already been used.', 'USED');
    if (invite.status === 'REVOKED') throw new ListingCompletionInviteError('This completion link has been revoked.', 'REVOKED');
    if (invite.status === 'EXPIRED' || invite.expiresAt <= now) {
      if (invite.status === 'ACTIVE') await tx.listingCompletionInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new ListingCompletionInviteError('This completion link has expired.', 'EXPIRED');
    }
    if (invite.listing.status !== 'DRAFT') throw new ListingCompletionInviteError('This vehicle listing is no longer open for completion.', 'INVALID_STATE');

    const claimed = await tx.listingCompletionInvite.updateMany({
      where: { id: invite.id, status: 'ACTIVE', expiresAt: { gt: now } },
      data: { status: 'SUBMITTED', usedAt: now },
    });
    if (claimed.count !== 1) throw new ListingCompletionInviteError('This completion link has already been used.', 'USED');

    const identityKeys = {
      registrationNumberKey: payload.registrationNo === undefined ? null : toVehicleIdentityKey(payload.registrationNo),
      chassisNumberKey: payload.chassisOrSerialNo === undefined ? null : toVehicleIdentityKey(payload.chassisOrSerialNo),
    };
    await lockVehicleIdentityKeys(tx, identityKeys);
    await assertVehicleIdentityAvailable(tx, {
      ...identityKeys,
      excludeListingId: invite.listingId,
      ownerUserId: invite.partnerId,
      viewerUserId: invite.partnerId,
    });

    const uploads = await tx.listingCompletionUpload.findMany({
      where: { inviteId: invite.id, claimedAt: null },
      select: { id: true, fileUrl: true, mediaType: true, slot: true },
    });
    const hasExistingPhoto = invite.listing.media.some((media) => !String(media.type || '').toUpperCase().includes('VIDEO'));
    const hasUploadedPhoto = uploads.some((upload) => !String(upload.mediaType || '').toUpperCase().includes('VIDEO'));
    if (!hasExistingPhoto && !hasUploadedPhoto) {
      throw new ListingCompletionInviteError('At least one vehicle photo is required before submission.', 'INVALID_STATE');
    }
    const hasFrontPhoto = invite.listing.media.some((media) => media.type === 'IMAGE' && (!media.slot || media.slot === 'front-view'))
      || uploads.some((upload) => upload.mediaType === 'IMAGE' && upload.slot === 'front-view');
    if (!hasFrontPhoto) {
      throw new ListingCompletionInviteError('A front vehicle photo is required before submission.', 'INVALID_STATE');
    }
    const hasVideo = invite.listing.media.some((media) => media.type === 'VIDEO')
      || uploads.some((upload) => upload.mediaType === 'VIDEO' && upload.slot === 'walkaround-video');
    if (!hasVideo) {
      throw new ListingCompletionInviteError('A walkaround video is required before submission.', 'INVALID_STATE');
    }
    const listingData: Prisma.ListingUpdateInput = {
      // The external owner completes only this private draft. The partner must
      // review the completed data and explicitly submit the listing to the admin queue.
      status: 'DRAFT',
      ...(payload.title === undefined ? {} : { title: payload.title }),
      ...(payload.ownerName === undefined ? {} : { ownerName: payload.ownerName || null }),
      ...(payload.price === undefined ? {} : { price: payload.price }),
      ...(payload.manufacturingYear === undefined ? {} : { manufacturingYear: payload.manufacturingYear }),
      ...(payload.locationState === undefined ? {} : { locationState: payload.locationState }),
      ...(payload.locationCity === undefined ? {} : { locationCity: payload.locationCity }),
      ...(payload.address === undefined ? {} : { address: payload.address || null }),
      ...(payload.condition === undefined ? {} : { condition: payload.condition || null }),
      ...(payload.additionalDescription === undefined ? {} : { additionalDescription: payload.additionalDescription || null }),
      ...(payload.grossPower === undefined ? {} : { grossPower: payload.grossPower || null }),
      ...(payload.engineNumber === undefined ? {} : { engineNumber: payload.engineNumber || null }),
      ...(payload.isNegotiable === undefined ? {} : { isNegotiable: payload.isNegotiable }),
      ...(payload.operatingHours === undefined ? {} : { operatingHours: payload.operatingHours }),
      ...(payload.registrationNo === undefined ? {} : { registrationNumberKey: identityKeys.registrationNumberKey }),
      ...(payload.chassisOrSerialNo === undefined ? {} : { chassisNumberKey: identityKeys.chassisNumberKey }),
      ...(payload.description === undefined ? {} : {
        description: [
          payload.description,
          payload.registrationDate ? `Registration date: ${payload.registrationDate}` : '',
          payload.registrationUpto ? `Registration upto: ${payload.registrationUpto}` : '',
          payload.registrationNo ? `Registration No: ${payload.registrationNo}` : '',
          payload.ownerName ? `Owner name: ${payload.ownerName}` : '',
          payload.chassisOrSerialNo ? `Chassis / Serial: ${payload.chassisOrSerialNo}` : '',
          payload.previousOwners ? `Owners: ${payload.previousOwners}` : '',
          payload.fuelType ? `Fuel: ${payload.fuelType}` : '',
          payload.transmission ? `Transmission: ${payload.transmission}` : '',
          payload.pinCode ? `PIN: ${payload.pinCode}` : '',
          payload.nearbyLandmark ? `Landmark: ${payload.nearbyLandmark}` : '',
          payload.rtoDetails?.insuranceValidUntil ? `Insurance expiry: ${payload.rtoDetails.insuranceValidUntil}` : '',
        ].filter(Boolean).join('\n') || null,
      }),
      ...(uploads.length ? {
        media: {
          create: uploads.map((upload, index) => ({
            url: upload.fileUrl,
            type: upload.mediaType,
            slot: upload.slot,
            isFeatured: index === 0,
          })),
        },
      } : {}),
    };
    const listing = await tx.listing.update({
      where: { id: invite.listingId },
      data: listingData,
      select: { id: true, status: true, title: true },
    });
    const rtoPayload = payload.rtoDetails
      ? {
          ...payload.rtoDetails,
          ...(payload.registrationNo === undefined ? {} : { registrationNo: payload.registrationNo }),
          ...(payload.operatingHours === undefined ? {} : { operatingHours: payload.operatingHours }),
        }
      : undefined;
    if (rtoPayload && !validateListingRtoDetails(rtoPayload)) await syncListingRtoForListing(tx, invite.listingId, rtoPayload);
    if (uploads.length) await tx.listingCompletionUpload.updateMany({ where: { inviteId: invite.id, claimedAt: null }, data: { claimedAt: now } });
    return listing;
  }, { maxWait: 10_000, timeout: 60_000 });
};

export const submitListingCompletionForPartnerReview = async ({ listingId, partnerId }: {
  listingId: string;
  partnerId: string;
}) => {
  const db = prisma as any;
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
      model: { select: { name: true } },
      media: { select: { type: true } },
      rtoRecords: { orderBy: { updatedAt: 'desc' }, take: 1 },
      completionInvites: {
        where: { status: 'SUBMITTED' },
        orderBy: { usedAt: 'desc' },
        take: 1,
        select: { id: true, status: true, usedAt: true },
      },
    },
  });

  const submittedInvite = listing?.completionInvites?.[0];
  if (!listing || listing.partnerId !== partnerId) {
    throw new ListingCompletionInviteError('Listing not found.', 'NOT_FOUND');
  }
  if (!canSubmitCompletionForPartnerReview({ listingStatus: listing.status, inviteStatus: submittedInvite?.status })) {
    throw new ListingCompletionInviteError(
      listing.status === 'DRAFT'
        ? 'The owner must submit the private completion link before partner review.'
        : 'This listing is no longer waiting for partner review.',
      'INVALID_STATE',
    );
  }

  const requiredTextFields: Array<[unknown, string]> = [
    [listing.category?.name, 'Category'],
    [listing.brand?.name, 'Brand'],
    [listing.model?.name, 'Model'],
    [listing.title, 'Title'],
    [listing.locationState, 'State'],
    [listing.locationCity, 'City'],
    [listing.address, 'Address'],
  ];
  const missingField = requiredTextFields.find(([value]) => {
    const text = String(value || '').trim();
    return !text || /^not specified$/i.test(text);
  });
  if (missingField) {
    throw new ListingCompletionInviteError(`${missingField[1]} is required before sending this listing for admin approval.`, 'INVALID_STATE');
  }

  if (!Number.isFinite(Number(listing.price)) || Number(listing.price) <= 0) {
    throw new ListingCompletionInviteError('Price is required before sending this listing for admin approval.', 'INVALID_STATE');
  }
  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(listing.manufacturingYear) || listing.manufacturingYear < 1950 || listing.manufacturingYear > currentYear + 1) {
    throw new ListingCompletionInviteError('A valid manufacturing year is required before sending this listing for admin approval.', 'INVALID_STATE');
  }
  if (!Number.isInteger(listing.operatingHours) || Number(listing.operatingHours) <= 0) {
    throw new ListingCompletionInviteError('Hours Running is required before sending this listing for admin approval.', 'INVALID_STATE');
  }

  const imageCount = listing.media.filter((item: { type: string }) => item.type === 'IMAGE').length;
  const videoCount = listing.media.filter((item: { type: string }) => item.type === 'VIDEO').length;
  if (!imageCount) {
    throw new ListingCompletionInviteError('At least one vehicle image is required before admin approval.', 'INVALID_STATE');
  }
  if (!videoCount) {
    throw new ListingCompletionInviteError('A vehicle video is required before admin approval.', 'INVALID_STATE');
  }

  const rto = listing.rtoRecords?.[0];
  const rtoError = validateListingRtoDetails({
    registrationNo: rto?.vehicleNumber,
    vehicleType: rto?.vehicleType,
    vehicleModel: rto?.vehicleModel,
    operatingHours: listing.operatingHours,
    hirePurchaseStatus: rto?.hirePurchaseStatus,
    financerName: rto?.financerName,
    taxStatus: rto?.taxStatus,
    taxValidUntil: rto?.taxValidUntil,
    fitnessStatus: rto?.fitnessStatus,
    fitnessValidUntil: rto?.fitnessValidUntil,
    insuranceStatus: rto?.insuranceStatus,
    insuranceValidUntil: rto?.insuranceValidUntil,
    pucStatus: rto?.pucStatus,
    pucValidUntil: rto?.pucValidUntil,
    hsrpStatus: rto?.hsrpStatus,
    rtoOffice: rto?.rtoOffice,
  });
  if (rtoError) {
    throw new ListingCompletionInviteError(`${rtoError} before sending this listing for admin approval.`, 'INVALID_STATE');
  }

  const updated = await db.listing.updateMany({
    where: { id: listingId, partnerId, status: 'DRAFT' },
    data: { status: 'PENDING_APPROVAL' },
  });
  if (updated.count !== 1) {
    throw new ListingCompletionInviteError('This listing changed state before partner review was submitted.', 'INVALID_STATE');
  }

  return db.listing.findUnique({ where: { id: listingId }, select: { id: true, status: true, title: true } });
};

export const createListingCompletionUpload = async ({
  token,
  fileUrl,
  fileName,
  mimeType,
  mediaType,
  slot,
}: {
  token: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  mediaType: string;
  slot?: string | undefined;
}) => {
  const { invite } = await getInviteWithListing(token);
  const pendingUploads = await prisma.listingCompletionUpload.findMany({
    where: { inviteId: invite.id, claimedAt: null },
    select: { mediaType: true, slot: true },
  });
  if (pendingUploads.length >= 14) {
    throw new ListingCompletionInviteError('A maximum of 14 vehicle files can be uploaded.', 'INVALID_STATE');
  }
  if (mediaType === 'VIDEO' && pendingUploads.some((upload) => upload.mediaType === 'VIDEO')) {
    throw new ListingCompletionInviteError('Only one vehicle video can be uploaded.', 'INVALID_STATE');
  }
  if (slot !== undefined) {
    const slotConfig = getListingCompletionMediaSlot(slot);
    if (!slotConfig || !isListingCompletionMediaSlot(slot)) {
      throw new ListingCompletionInviteError('Invalid vehicle media slot.', 'INVALID_STATE');
    }
    if (slotConfig.kind !== mediaType) {
      throw new ListingCompletionInviteError('The selected file type does not match this media slot.', 'INVALID_STATE');
    }
    if (pendingUploads.some((upload) => upload.slot === slot)) {
      throw new ListingCompletionInviteError('This media slot already has an upload.', 'INVALID_STATE');
    }
  }
  return prisma.listingCompletionUpload.create({
    data: { inviteId: invite.id, fileUrl, fileName, mimeType, mediaType, slot: slot || null },
    select: { id: true, fileUrl: true, fileName: true, mimeType: true, mediaType: true, slot: true },
  });
};
