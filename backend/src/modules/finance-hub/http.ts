import { NextFunction, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { FinanceHubSchemaMissingError, isFinanceHubSchemaMissing } from './services/schemaState';

export class FinHttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'FinHttpError';
  }
}

export const badRequest = (message: string, details?: unknown) => new FinHttpError(400, message, details);
export const notFound = (message: string) => new FinHttpError(404, message);
export const conflict = (message: string, details?: unknown) => new FinHttpError(409, message, details);

type Handler = (req: Request) => Promise<unknown>;

/** Wraps a finance-hub handler: JSON result, typed HTTP errors, and 503 while the schema is missing. */
export const handle = (handler: Handler, successStatus = 200) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = await handler(req);
      return res.status(successStatus).json(body);
    } catch (error) {
      if (error instanceof FinHttpError) {
        return res.status(error.status).json({ error: error.message, ...(error.details ? { details: error.details } : {}) });
      }
      if (error instanceof FinanceHubSchemaMissingError || isFinanceHubSchemaMissing(error)) {
        return res.status(503).json({ error: new FinanceHubSchemaMissingError().message, code: 'FINANCE_HUB_SCHEMA_MISSING' });
      }
      const prismaError = error as { code?: string; meta?: { target?: unknown } };
      if (prismaError?.code === 'P2002') {
        return res.status(409).json({ error: 'A record with the same unique value already exists.', details: prismaError.meta?.target });
      }
      next(error);
    }
  };

/** Same permission source as requireAdminOrEmployeePermissions, for field-level decisions. */
export const getRequestPermissions = async (req: Request): Promise<string[]> => {
  if (!req.user) return [];
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') return ['ALL_ACCESS'];
  const employee = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { customRole: { select: { permissions: true } }, adminPermissions: { select: { permission: true } } },
  });
  return Array.isArray(employee?.customRole?.permissions)
    ? employee.customRole.permissions
    : (employee?.adminPermissions || []).map((item) => item.permission);
};

export const hasAnyOf = (granted: string[], required: string[]) =>
  granted.includes('ALL_ACCESS') || required.some((permission) => granted.includes(permission));
