import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { searchPublicBuyerListings, searchPublicSupport } from '../services/ai/publicAiData.service';

const buyerSearchBodySchema = z.object({
  message: z.string().trim().min(1).max(800),
}).strict();

const publicSupportBodySchema = z.object({
  message: z.string().trim().min(1).max(800),
}).strict();

export const publicBuyerSearch = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = buyerSearchBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Please describe the machine you are looking for.',
      code: 'PUBLIC_AI_MESSAGE_INVALID',
    });
  }

  try {
    const result = await searchPublicBuyerListings(parsed.data.message);
    return res.status(200).json({
      success: true,
      assistant: {
        message: result.message,
        mode: result.mode,
        ...(result.nextQuestion ? { nextQuestion: result.nextQuestion } : {}),
        filters: result.filters,
        matches: result.matches,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const publicSupportSearch = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = publicSupportBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Please describe your support question.', code: 'PUBLIC_AI_MESSAGE_INVALID' });
  }
  try {
    const result = await searchPublicSupport(parsed.data.message);
    return res.status(200).json({ success: true, assistant: result });
  } catch (error) {
    return next(error);
  }
};
