import { NextFunction, Request, Response } from 'express';
import { auditContextFromRequest } from '../services/audit.service';
import { FinanceHubSchemaMissingError } from '../services/schemaState';
import { buildFinSettingsUpdate, loadFinSettings, updateFinSettings } from '../services/settings.service';
import { financialQuarterOf, financialYearOf, istToday } from '../utils/fy';

const schemaMissingResponse = (res: Response, error: FinanceHubSchemaMissingError) =>
  res.status(503).json({ error: error.message, code: 'FINANCE_HUB_SCHEMA_MISSING' });

export const getFinanceHubHealth = async (_req: Request, res: Response, next: NextFunction) => {
  const today = istToday();
  const financialYear = financialYearOf(today);
  const base = {
    ok: true,
    today: today.toISOString().slice(0, 10),
    currentFinancialYear: {
      label: financialYear.label,
      startDate: financialYear.startDate.toISOString().slice(0, 10),
      endDate: financialYear.endDate.toISOString().slice(0, 10),
      quarter: financialQuarterOf(today),
    },
  };

  try {
    const settings = await loadFinSettings();
    return res.json({ ...base, schemaReady: true, postingMode: settings.postingMode });
  } catch (error) {
    if (error instanceof FinanceHubSchemaMissingError) {
      return res.json({ ...base, schemaReady: false, postingMode: 'OFF' });
    }
    next(error);
  }
};

export const getFinanceHubSettings = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    return res.json({ settings: await loadFinSettings() });
  } catch (error) {
    if (error instanceof FinanceHubSchemaMissingError) return schemaMissingResponse(res, error);
    next(error);
  }
};

export const updateFinanceHubSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = buildFinSettingsUpdate((req.body || {}) as Record<string, unknown>);
    if ('error' in result) return res.status(400).json({ error: result.error });

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : null;
    const settings = await updateFinSettings(result.data, { ...auditContextFromRequest(req), reason });
    return res.json({ settings });
  } catch (error) {
    if (error instanceof FinanceHubSchemaMissingError) return schemaMissingResponse(res, error);
    next(error);
  }
};
