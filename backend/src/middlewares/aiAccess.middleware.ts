import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { allowedAdminPermissions } from '../utils/adminPermissions';

export const AI_PERMISSION = 'ai.use';
export const AI_MANAGE_PERMISSION = 'ai.manage';

export const canUseAiRole = (role: string, permissions: readonly string[]): boolean => (
  role === 'SUPER_ADMIN' ||
  role === 'ADMIN' ||
  (role === 'EMPLOYEE' && (permissions.includes('ALL_ACCESS') || permissions.includes(AI_PERMISSION)))
);

/** Shared provider credentials are an elevated control-plane capability, not a personal setting. */
export const canManageAiSettingsRole = (role: string, permissions: readonly string[]): boolean => (
  role === 'SUPER_ADMIN' ||
  (role === 'EMPLOYEE' && (permissions.includes('ALL_ACCESS') || permissions.includes(AI_MANAGE_PERMISSION)))
);

export const loadAiPermissionScope = async (userId: string): Promise<string[]> => {
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      customRole: { select: { permissions: true } },
      adminPermissions: { select: { permission: true } },
    },
  });

  return (Array.isArray(employee?.customRole?.permissions)
    ? employee.customRole.permissions
    : (employee?.adminPermissions || []).map((item) => item.permission))
    .filter((permission): permission is string => typeof permission === 'string' && allowedAdminPermissions.has(permission));
};

/** Restricts every AI endpoint to internal operators and the explicit employee permission. */
export const requireAiAccess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
    next();
    return;
  }

  if (req.user.role !== 'EMPLOYEE') {
    res.status(403).json({ error: 'AI access is restricted to internal operators.', code: 'AI_ACCESS_FORBIDDEN' });
    return;
  }

  try {
    const permissions = await loadAiPermissionScope(req.user.id);

    if (canUseAiRole(req.user.role, permissions)) {
      next();
      return;
    }
    res.status(403).json({ error: 'You do not have permission to use the AI assistant.', code: 'AI_PERMISSION_REQUIRED' });
  } catch (error) {
    next(error);
  }
};

/** Allows only Superadmins and explicitly authorised Employees to administer the shared AI connection. */
export const requireAiSettingsManagement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (req.user.role === 'SUPER_ADMIN') {
    next();
    return;
  }

  if (req.user.role !== 'EMPLOYEE') {
    res.status(403).json({ error: 'AI settings are restricted to authorised internal operators.', code: 'AI_SETTINGS_FORBIDDEN' });
    return;
  }

  try {
    const permissions = await loadAiPermissionScope(req.user.id);
    if (canManageAiSettingsRole(req.user.role, permissions)) {
      next();
      return;
    }

    res.status(403).json({ error: 'You do not have permission to manage AI settings.', code: 'AI_MANAGE_PERMISSION_REQUIRED' });
  } catch (error) {
    next(error);
  }
};
