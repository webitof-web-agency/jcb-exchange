import type { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import prisma from '../../lib/prisma';
import { CRM_ANY_PERMISSIONS, CRM_PERMISSIONS as P, LEGACY_ENQUIRIES_PERMISSION } from './permissions';
import { forbidden } from './http';

export type CrmAccess = {
  userId: string;
  role: string;
  /** Partner users only ever see leads routed to them (Lead.dealerId). */
  isPartner: boolean;
  isFullAdmin: boolean;
  permissions: string[];
  canRead: boolean;
  canManage: boolean;
  canPipelineManage: boolean;
  /** Sees every lead, not only the ones they own. */
  canSeeAll: boolean;
  canAssign: boolean;
  canReports: boolean;
  canExport: boolean;
  canImport: boolean;
  canCampaigns: boolean;
  canSettings: boolean;
};

const has = (granted: string[], key: string) => granted.includes('ALL_ACCESS') || granted.includes(key);

export const buildCrmAccess = (userId: string, role: string, permissions: string[]): CrmAccess => {
  const isFullAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const isPartner = role === 'PARTNER';
  const granted = isFullAdmin ? ['ALL_ACCESS'] : permissions;
  const legacyAll = has(granted, LEGACY_ENQUIRIES_PERMISSION);
  const canSeeAll = isFullAdmin || legacyAll || has(granted, P.manageAll);
  const canManage = isPartner || canSeeAll || has(granted, P.manage);
  const canPipelineManage = !isPartner && (isFullAdmin || has(granted, P.pipelineManage));
  return {
    userId,
    role,
    isPartner,
    isFullAdmin,
    permissions: granted,
    canRead: isPartner || canManage || has(granted, P.read) || has(granted, P.assign),
    canManage,
    canPipelineManage,
    canSeeAll: !isPartner && canSeeAll,
    canAssign: !isPartner && (canSeeAll || has(granted, P.assign)),
    canReports: !isPartner && (canSeeAll || has(granted, P.reports)),
    canExport: !isPartner && (isFullAdmin || has(granted, P.export)),
    canImport: !isPartner && (isFullAdmin || has(granted, P.import)),
    canCampaigns: !isPartner && (isFullAdmin || has(granted, P.campaigns)),
    canSettings: !isPartner && (isFullAdmin || has(granted, P.settings)),
  };
};

const loadPermissions = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { customRole: { select: { permissions: true } }, adminPermissions: { select: { permission: true } } },
  });
  return Array.isArray(user?.customRole?.permissions)
    ? user.customRole.permissions
    : (user?.adminPermissions || []).map((item) => item.permission);
};

/** Resolves CRM access once per request; partners, admins and permitted employees pass. */
export const requireCrmUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ error: 'Authentication required.' });
    if (!['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE', 'PARTNER'].includes(user.role)) {
      return res.status(403).json({ error: 'CRM access required.' });
    }
    const permissions = user.role === 'EMPLOYEE' ? await loadPermissions(user.id) : [];
    if (user.role === 'EMPLOYEE' && !permissions.includes('ALL_ACCESS') && !CRM_ANY_PERMISSIONS.some((key) => permissions.includes(key))) {
      return res.status(403).json({ error: 'You do not have permission to use the CRM.' });
    }
    req.crmAccess = buildCrmAccess(user.id, user.role, permissions);
    next();
  } catch (error) {
    next(error);
  }
};

export const crmAccessOf = (req: Request): CrmAccess => {
  if (!req.crmAccess) throw forbidden('CRM access was not resolved.');
  return req.crmAccess;
};

type Capability = 'canRead' | 'canManage' | 'canPipelineManage' | 'canAssign' | 'canReports' | 'canExport' | 'canImport' | 'canCampaigns' | 'canSettings';

export const requireCrmCapability = (capability: Capability) => (req: Request, res: Response, next: NextFunction) => {
  if (!req.crmAccess?.[capability]) return res.status(403).json({ error: 'You do not have permission for this CRM action.' });
  next();
};

/** Row-level lead scope: partners see their routed leads, staff without "all" see what they own. */
export const leadScopeWhere = (access: CrmAccess): Prisma.LeadWhereInput => {
  if (access.isPartner) return { dealerId: access.userId };
  if (access.canSeeAll) return {};
  if (access.canAssign) return { OR: [{ ownerId: access.userId }, { ownerId: null }] };
  return { ownerId: access.userId };
};

export const followUpScopeWhere = (access: CrmAccess): Prisma.CrmFollowUpWhereInput => {
  if (access.isPartner) return { lead: { dealerId: access.userId } };
  if (access.canSeeAll) return {};
  return { OR: [{ ownerId: access.userId }, { lead: { ownerId: access.userId } }] };
};

export const canTouchLead = (access: CrmAccess, lead: { dealerId: string; ownerId: string | null }) => {
  if (access.isPartner) return lead.dealerId === access.userId;
  if (access.canSeeAll) return true;
  if (lead.ownerId === access.userId) return true;
  return access.canAssign && lead.ownerId === null;
};
