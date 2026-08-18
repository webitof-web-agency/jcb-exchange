import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  ACCOUNT_INACTIVE_CODE,
  ACCOUNT_INACTIVE_MESSAGE,
  ACCOUNT_REVOKED_CODE,
  ACCOUNT_REVOKED_MESSAGE,
  fetchAuthenticatedUserById,
  getAccountAccessState,
  isPortalStatusBlocked,
  resolveEffectiveUserRole,
} from '../utils/accountAccess';
import prisma from '../lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'jcbexchange_super_secret_key_123';

interface AuthTokenPayload {
  id: string;
  email?: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'PARTNER' | 'CUSTOMER';
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CLOSED';
  iat?: number;
  exp?: number;
}

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authorizationHeader.slice(7).trim();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = getBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    fetchAuthenticatedUserById(decoded.id)
      .then((user) => {
        if (!user) {
          return res.status(403).json({
            error: ACCOUNT_REVOKED_MESSAGE,
            code: ACCOUNT_REVOKED_CODE,
          });
        }

        const accessState = getAccountAccessState(user as any);

        if (accessState === 'inactive') {
          return res.status(403).json({
            error: ACCOUNT_INACTIVE_MESSAGE,
            code: ACCOUNT_INACTIVE_CODE,
          });
        }

        if (accessState === 'revoked') {
          return res.status(403).json({
            error: ACCOUNT_REVOKED_MESSAGE,
            code: ACCOUNT_REVOKED_CODE,
          });
        }

        req.user = {
          id: user.id,
          email: user.email ?? null,
          role: resolveEffectiveUserRole(user as any) as AuthTokenPayload['role'],
          status: user.status ?? undefined,
        };
        next();
      })
      .catch((error) => next(error));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  next();
};

export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin access required.' });
  }

  next();
};

export const requireSuperAdminOrEmployeePermissions =
  (requiredPermissions: string[]) => async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }

    if (req.user.role !== 'EMPLOYEE') {
      return res.status(403).json({ error: 'Super admin access required.' });
    }

    if (!requiredPermissions.length) {
      return next();
    }

    try {
      const employee = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          customRole: {
            select: {
              permissions: true,
            },
          },
          adminPermissions: {
            select: {
              permission: true,
            },
          },
        },
      });

      const permissions = Array.isArray(employee?.customRole?.permissions)
        ? employee.customRole.permissions
        : (employee?.adminPermissions || []).map((item) => item.permission);

      const isAllowed =
        permissions.includes('ALL_ACCESS') ||
        requiredPermissions.some((permission) => permissions.includes(permission));

      if (!isAllowed) {
        return res.status(403).json({ error: 'You do not have permission to access this module.' });
      }

      next();
    } catch (error) {
      next(error);
    }
  };

export const requirePortalOperator = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Portal access required.' });
  }

  if (isPortalStatusBlocked(req.user.status)) {
    return res.status(403).json({
      error: ACCOUNT_REVOKED_MESSAGE,
      code: ACCOUNT_REVOKED_CODE,
    });
  }

  next();
};
