import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  AiSettingsError,
  getAiSettings,
  saveAiSettings,
  testAiConnection,
} from '../services/ai/aiSettings.service';

const aiSettingsBodySchema = z.object({
  provider: z.enum(['openai', 'anthropic']).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().trim().max(4096).optional(),
  enabled: z.boolean().optional(),
  removeKey: z.boolean().optional(),
}).strict();

const sendAiSettingsError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof AiSettingsError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
  }

  return next(error);
};

export const getAiSettingsController = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json({ success: true, settings: await getAiSettings() });
  } catch (error) {
    return sendAiSettingsError(error, res, next);
  }
};

export const updateAiSettingsController = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiSettingsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid AI settings. Check the provider, model, API key, and enabled value.',
      code: 'AI_SETTINGS_INVALID',
    });
  }

  try {
    const settings = await saveAiSettings({
      ...parsed.data,
      updatedByUserId: req.user?.id || null,
    });
    return res.json({ success: true, message: 'AI settings updated successfully.', settings });
  } catch (error) {
    return sendAiSettingsError(error, res, next);
  }
};

export const testAiSettingsConnectionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await testAiConnection(req.user?.id || 'unknown');
    return res.json({ success: true, message: 'AI provider connection successful.', ...result });
  } catch (error) {
    return sendAiSettingsError(error, res, next);
  }
};

export const removeAiSettingsKeyController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await saveAiSettings({
      removeKey: true,
      enabled: false,
      updatedByUserId: req.user?.id || null,
    });
    return res.json({ success: true, message: 'AI provider key removed and AI disabled.', settings });
  } catch (error) {
    return sendAiSettingsError(error, res, next);
  }
};
