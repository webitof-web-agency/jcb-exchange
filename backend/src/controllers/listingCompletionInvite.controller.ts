import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  ListingCompletionInviteError,
  createListingCompletionInvite,
  createListingCompletionUpload,
  getActiveListingCompletionInvite,
  getListingCompletionInvite,
  revokeListingCompletionInvite,
  submitListingCompletionForPartnerReview,
  submitListingCompletion,
} from '../services/listingCompletionInvite.service';
import {
  deleteFileFromDrive,
  uploadFileToDrive,
} from '../services/googleDrive.service';
import { buildPublicBrandingFileName } from '../utils/publicBrandingUpload';
import { normalizeMultipartFilename } from '../utils/filenameEncoding';
import { isListingCompletionMediaSlot } from '../services/listingCompletionMediaPolicy';
import { listingCompletionOwnerPayloadSchema } from '../services/listingCompletionOwnerPayload';
import { toListingCompletionOwnerView } from '../services/listingCompletionOwnerView';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid completion link.');
const expirySchema = z.object({ ttlHours: z.coerce.number().int().min(1).max(168).optional() }).strict();
const getToken = (req: Request) => tokenSchema.parse(String(req.params.token || ''));

const sendInviteError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid request.' });
  if (error instanceof ListingCompletionInviteError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'EXPIRED' || error.code === 'USED' || error.code === 'REVOKED' ? 410 : error.code === 'FORBIDDEN' ? 403 : 409;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return next(error);
};

const requirePartner = (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  if (req.user.role !== 'PARTNER') {
    res.status(403).json({ error: 'Only a partner can create a vehicle completion link.' });
    return null;
  }
  return req.user.id;
};

export const createCompletionInvite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = requirePartner(req, res);
    if (!partnerId) return;
    const { ttlHours } = expirySchema.parse(req.body || {});
    const result = await createListingCompletionInvite({
      listingId: String(req.params.id || ''),
      partnerId,
      ...(ttlHours === undefined ? {} : { ttlHours }),
    });
    return res.status(201).json({
      inviteId: result.id,
      expiresAt: result.expiresAt,
      linkPath: `/listing-completion/${result.token}`,
    });
  } catch (error) {
    return sendInviteError(error, res, next);
  }
};

export const getActiveCompletionInvite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = requirePartner(req, res);
    if (!partnerId) return;
    const invite = await getActiveListingCompletionInvite({ listingId: String(req.params.id || ''), partnerId });
    return res.json({ invite });
  } catch (error) {
    return sendInviteError(error, res, next);
  }
};

export const revokeCompletionInvite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = requirePartner(req, res);
    if (!partnerId) return;
    const count = await revokeListingCompletionInvite({ listingId: String(req.params.id || ''), partnerId });
    return res.json({ revoked: count > 0 });
  } catch (error) {
    return sendInviteError(error, res, next);
  }
};

export const getCompletionInvite = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invite = await getListingCompletionInvite(getToken(req));
    return res.set('Referrer-Policy', 'no-referrer').json({
      expiresAt: invite.expiresAt,
      listing: toListingCompletionOwnerView(invite.listing),
      uploads: invite.uploads,
    });
  } catch (error) {
    return sendInviteError(error, res, next);
  }
};

export const uploadCompletionMedia = async (req: Request, res: Response, next: NextFunction) => {
  let driveFileId: string | null = null;
  try {
    const token = getToken(req);
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'A photo or video file is required.' });
    const slot = req.body?.slot;
    if (slot !== undefined && !isListingCompletionMediaSlot(slot)) {
      return res.status(400).json({ error: 'Invalid vehicle media slot.' });
    }
    const fileName = buildPublicBrandingFileName('listing-media', normalizeMultipartFilename(file.originalname), randomUUID(), file.mimetype);
    const uploaded = await uploadFileToDrive(file.buffer, file.mimetype, fileName);
    driveFileId = uploaded.fileId;
    const media = await createListingCompletionUpload({
      token,
      fileUrl: uploaded.viewLink,
      fileName: normalizeMultipartFilename(file.originalname),
      mimeType: file.mimetype,
      mediaType: file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      slot: slot || undefined,
    });
    return res.status(201).json({ media });
  } catch (error) {
    if (driveFileId) await deleteFileFromDrive(driveFileId);
    return sendInviteError(error, res, next);
  }
};

export const submitCompletion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await submitListingCompletion(getToken(req), listingCompletionOwnerPayloadSchema.parse(req.body || {}));
    return res.json({ message: 'Vehicle media submitted to the partner for review. This link is now invalid.', listing: result });
  } catch (error) {
    return sendInviteError(error, res, next);
  }
};

export const submitCompletionForPartnerReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const partnerId = requirePartner(req, res);
    if (!partnerId) return;
    const listing = await submitListingCompletionForPartnerReview({
      listingId: String(req.params.id || ''),
      partnerId,
    });
    return res.json({
      message: 'Listing submitted to the admin approval queue.',
      listing,
    });
  } catch (error) {
    return sendInviteError(error, res, next);
  }
};
