import { NextFunction, Request, Response } from 'express';

export class CrmHttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'CrmHttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new CrmHttpError(400, message, details);
export const forbidden = (message = 'You do not have access to this CRM record.') => new CrmHttpError(403, message);
export const notFound = (message: string) => new CrmHttpError(404, message);
export const conflict = (message: string, details?: unknown) => new CrmHttpError(409, message, details);

export const CRM_SCHEMA_MISSING_CODE = 'CRM_SCHEMA_MISSING';

// The portal can run against a database where the CRM migration is not applied yet.
export const isCrmSchemaMissing = (error: unknown) => {
  const databaseError = error as { code?: string; message?: string; meta?: { column?: unknown } } | null;
  if (databaseError?.code === 'P2021') return true;
  if (databaseError?.code === 'P2022') return true;
  return /relation "Crm[A-Za-z]+" does not exist|type "Crm[A-Za-z]+" does not exist|column "(leadType|ownerId|nextFollowUpAt)"/.test(databaseError?.message || '');
};

type Handler = (req: Request) => Promise<unknown>;

/** JSON result, typed HTTP errors, and 503 while the CRM tables are missing. */
export const handle = (handler: Handler, successStatus = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = await handler(req);
      return res.status(successStatus).json(body);
    } catch (error) {
      if (error instanceof CrmHttpError) {
        return res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
      }
      if (isCrmSchemaMissing(error)) {
        return res.status(503).json({ error: 'CRM tables are not installed yet. Apply the CRM migration first.', code: CRM_SCHEMA_MISSING_CODE });
      }
      const prismaError = error as { code?: string; meta?: { target?: unknown } };
      if (prismaError?.code === 'P2002') {
        return res.status(409).json({ error: 'A record with the same unique value already exists.', details: prismaError.meta?.target });
      }
      if (prismaError?.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found.' });
      }
      next(error);
    }
  };

export const requestBody = (req: Request) =>
  (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>;

export const routeParam = (req: Request, name: string) => {
  const value = req.params[name];
  return typeof value === 'string' ? value.trim() : '';
};

export const queryString = (req: Request, name: string) => {
  const value = req.query[name];
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return typeof value === 'string' ? value.trim() : '';
};

export const queryList = (req: Request, name: string) =>
  queryString(req, name).split(',').map((item) => item.trim()).filter(Boolean);
