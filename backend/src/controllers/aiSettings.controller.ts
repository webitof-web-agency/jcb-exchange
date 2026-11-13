import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  AiSettingsError,
  getAvailableAiModels,
  getAiSettings,
  revealAiApiKey,
  saveAiSettings,
  testAiConnection,
} from '../services/ai/aiSettings.service';

const aiProviderQuerySchema = z.enum(['openai', 'anthropic']);

const aiModelsBodySchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  apiKey: z.string().trim().max(4096).optional(),
}).strict();

const aiSettingsBodySchema = z.object({
  provider: z.enum(['openai', 'anthropic']).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().trim().max(4096).optional(),
  enabled: z.boolean().optional(),
  removeKey: z.boolean().optional(),
}).strict();

const aiTestConnectionBodySchema = z.object({
  provider: z.enum(['openai', 'anthropic']).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  apiKey: z.string().trim().max(4096).optional(),
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

export const getAiModelsController = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiProviderQuerySchema.safeParse(req.query.provider);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'A valid AI provider is required.',
      code: 'AI_PROVIDER_INVALID',
    });
  }

  try {
    const models = await getAvailableAiModels(parsed.data);
    return res.json({ success: true, provider: parsed.data, models });
  } catch (error) {
    return sendAiSettingsError(error, res, next);
  }
};

/** Load a provider catalog with a draft key during provider rotation. */
export const postAiModelsController = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = aiModelsBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'A valid AI provider and API key are required.',
      code: 'AI_PROVIDER_INVALID',
    });
  }

  try {
    const models = await getAvailableAiModels(parsed.data.provider, undefined, parsed.data.apiKey);
    return res.json({ success: true, provider: parsed.data.provider, models });
  } catch (error) {
    return sendAiSettingsError(error, res, next);
  }
};

export const revealAiSettingsKeyController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const value = await revealAiApiKey(req.user?.id || 'unknown');
    if (!value) return res.status(404).json({ success: false, error: 'AI provider key is not configured.' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, value });
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
  const parsed = aiTestConnectionBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid AI connection test request.',
      code: 'AI_SETTINGS_INVALID',
    });
  }

  try {
    const result = await testAiConnection(req.user?.id || 'unknown', undefined, undefined, parsed.data);
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
