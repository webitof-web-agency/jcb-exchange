import type { NextFunction, Request, Response } from 'express';
import {
  getPanVerificationSettings,
  revealSurepassCredential,
  updatePanVerificationSettings,
} from '../services/panVerificationSettings.service';

export const getPanVerificationSettingsController = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({ settings: await getPanVerificationSettings() });
  } catch (error) {
    next(error);
  }
};

export const updatePanVerificationSettingsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const settings = await updatePanVerificationSettings({
      enabled: body.enabled,
      activeEnvironment: body.activeEnvironment,
      environment: body.environment,
      baseUrl: body.baseUrl,
      token: body.token,
      customerId: body.customerId,
      sandbox: body.sandbox,
      production: body.production,
      updatedByUserId: req.user?.id || null,
    });

    res.json({
      message: 'Surepass credentials saved successfully.',
      settings,
    });
  } catch (error) {
    next(error);
  }
};

export const revealPanVerificationCredentialController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const environment = String(req.params.environment || '').trim().toUpperCase();
    const field = String(req.params.field || '').trim();
    if (!['SANDBOX', 'PRODUCTION'].includes(environment) || !['token', 'customerId'].includes(field)) {
      return res.status(400).json({ error: 'Invalid Surepass credential requested.' });
    }

    const value = await revealSurepassCredential(environment, field as 'token' | 'customerId');
    if (!value) return res.status(404).json({ error: 'This Surepass credential is not configured.' });

    res.setHeader('Cache-Control', 'no-store');
    return res.json({ value });
  } catch (error) {
    return next(error);
  }
};
