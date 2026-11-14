import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { analyzeListingDraft } from '../services/ai/listingCopilot.service';
import { analyzeListingImage } from '../services/ai/aiVision.service';
import { getPublicListingPricing } from '../utils/listingPricing';
import { getPublicMarketplaceAvailableListingWhere } from '../utils/publicListingVisibility';

const listingDraftSchema = z.object({
  category: z.string().trim().max(120).default(''),
  brand: z.string().trim().max(120).default(''),
  model: z.string().trim().max(120).default(''),
  manufacturingYear: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1).nullable().optional(),
  operatingHours: z.coerce.number().min(0).max(10_000_000).nullable().optional(),
  condition: z.string().trim().max(120).default(''),
  locationCity: z.string().trim().max(120).default(''),
  locationState: z.string().trim().max(120).default(''),
  price: z.coerce.number().min(0).max(1_000_000_000).default(0),
  mediaCount: z.coerce.number().int().min(0).max(100).default(0),
  description: z.string().trim().max(5000).default(''),
  registrationVerified: z.boolean().default(false),
}).strict();

const copilotRoles = new Set(['PARTNER', 'CUSTOMER', 'SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);

export const assistListingDraft = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !copilotRoles.has(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Listing assistance is not available for this account.' });
  }
  const parsed = listingDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Listing draft fields are invalid.', code: 'LISTING_COPILOT_INPUT_INVALID' });
  }

  try {
    const draft = parsed.data;
    const where: Prisma.ListingWhereInput = {
      ...(getPublicMarketplaceAvailableListingWhere() as Prisma.ListingWhereInput),
      ...(draft.category ? { category: { name: { contains: draft.category, mode: 'insensitive' } } } : {}),
      ...(draft.brand ? { brand: { name: { contains: draft.brand, mode: 'insensitive' } } } : {}),
      ...(draft.model ? { model: { name: { contains: draft.model, mode: 'insensitive' } } } : {}),
    };
    const comparableListings = await prisma.listing.findMany({
      where,
      select: { price: true, adminMarginAmount: true, adminExpenseAmount: true, adminExpenseBreakdown: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const comparablePrices = comparableListings.map((listing) => getPublicListingPricing(listing).finalPrice);
    return res.status(200).json({ success: true, copilot: analyzeListingDraft({
      category: draft.category,
      brand: draft.brand,
      model: draft.model,
      manufacturingYear: draft.manufacturingYear ?? null,
      operatingHours: draft.operatingHours ?? null,
      condition: draft.condition,
      locationCity: draft.locationCity,
      locationState: draft.locationState,
      price: draft.price,
      mediaCount: draft.mediaCount,
      description: draft.description,
      registrationVerified: draft.registrationVerified,
    }, comparablePrices) });
  } catch (error) {
    return next(error);
  }
};

export const assistListingImage = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || !copilotRoles.has(req.user.role)) {
    return res.status(403).json({ success: false, error: 'Listing image assistance is not available for this account.' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'A listing image is required.', code: 'LISTING_IMAGE_REQUIRED' });
  }

  try {
    const analysis = await analyzeListingImage({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });
    return res.status(200).json({ success: true, analysis });
  } catch (error) {
    return next(error);
  }
};
