import { Router } from 'express';
import {
  createManagedUser,
  createPartnerUser,
  getAdminPartnerOnboarding,
  getAdminPartners,
  deleteManagedUser,
  deletePartnerUser,
  getAdminListings,
  getFinanceSupportContent,
  getHeroImageContent,
  getInspectionSectionContent,
  getPlatformSettings,
  getAdminUsers,
  getCustomerVisitors,
  getDashboardSummary,
  getModuleBadges,
  getPendingVerifications,
  getVerificationDetail,
  getCustomerPrimePayments,
  updatePlatformSettings,
  saveAdminPartnerOnboarding,
  submitAdminPartnerOnboarding,
  resetManagedUserPassword,
  updateManagedUserAccount,
  updatePartnerUser,
  updateAdminListingStatus,
  updateAdminUserStatus,
  updateFinanceSupportContent,
  updateHeroImageContent,
  updateInspectionSectionContent,
  updateCustomerPrimePaymentStatus,
  updateVerificationStatus,
} from '../controllers/admin.controller';
import { requireAuth, requireSuperAdminOrEmployeePermissions } from '../middlewares/auth.middleware';

import { createRole, deleteRole, getRoles, updateRole } from '../controllers/role.controller';

const router = Router();

router.use(requireAuth);

const canViewDashboard = requireSuperAdminOrEmployeePermissions(['dashboard.view']);
const canManageSettings = requireSuperAdminOrEmployeePermissions(['settings.manage']);
const canManageRecurrence = requireSuperAdminOrEmployeePermissions(['recurrence.manage']);
const canViewUsers = requireSuperAdminOrEmployeePermissions(['users.read']);
const canCreateUsers = requireSuperAdminOrEmployeePermissions(['users.create']);
const canUpdateUsers = requireSuperAdminOrEmployeePermissions(['users.update']);
const canDeleteUsers = requireSuperAdminOrEmployeePermissions(['users.delete']);
const canViewRoles = requireSuperAdminOrEmployeePermissions(['roles.read']);
const canCreateRoles = requireSuperAdminOrEmployeePermissions(['roles.create']);
const canUpdateRoles = requireSuperAdminOrEmployeePermissions(['roles.update']);
const canDeleteRoles = requireSuperAdminOrEmployeePermissions(['roles.delete']);
const canViewPartners = requireSuperAdminOrEmployeePermissions(['partners.read']);
const canCreatePartners = requireSuperAdminOrEmployeePermissions(['partners.create']);
const canUpdatePartners = requireSuperAdminOrEmployeePermissions(['partners.update']);
const canDeletePartners = requireSuperAdminOrEmployeePermissions(['partners.delete']);
const canManageVerifications = requireSuperAdminOrEmployeePermissions(['kyc.manage']);
const canManageEnquiries = requireSuperAdminOrEmployeePermissions(['enquiries.manage']);
const canViewVisitors = requireSuperAdminOrEmployeePermissions(['visitors.read']);
const canUpdateAccountStatus = requireSuperAdminOrEmployeePermissions(['users.update', 'partners.change_status', 'visitors.change_status']);
const canManageCategories = requireSuperAdminOrEmployeePermissions(['categories.read', 'categories.create', 'categories.update', 'categories.delete']);
const canManageListings = requireSuperAdminOrEmployeePermissions(['partners.read', 'kyc.manage', 'listings.read']);

router.get('/dashboard', canViewDashboard, getDashboardSummary);
router.get('/badges', canViewDashboard, getModuleBadges);
router.get('/finance-support', canManageSettings, getFinanceSupportContent);
router.put('/finance-support', canManageSettings, updateFinanceSupportContent);
router.get('/hero-image', canManageSettings, getHeroImageContent);
router.put('/hero-image', canManageSettings, updateHeroImageContent);
router.get('/inspection-section', canManageSettings, getInspectionSectionContent);
router.put('/inspection-section', canManageSettings, updateInspectionSectionContent);
router.get('/settings', canManageSettings, getPlatformSettings);
router.patch('/settings', canManageSettings, updatePlatformSettings);
router.get('/customer-prime-payments', canManageRecurrence, getCustomerPrimePayments);
router.patch('/customer-prime-payments/:id/status', canManageRecurrence, updateCustomerPrimePaymentStatus);
router.get('/users', canViewUsers, getAdminUsers);
router.get('/partners', canViewPartners, getAdminPartners);
router.get('/visitors', canViewVisitors, getCustomerVisitors);
router.post('/users', canCreateUsers, createManagedUser);
router.post('/partners', canCreatePartners, createPartnerUser);
router.patch('/users/:id', canUpdateUsers, updateManagedUserAccount);
router.patch('/users/:id/password', canUpdateUsers, resetManagedUserPassword);
router.delete('/users/:id', canDeleteUsers, deleteManagedUser);
router.get('/partners/:id/onboarding', canViewPartners, getAdminPartnerOnboarding);
router.put('/partners/:id/onboarding', canUpdatePartners, saveAdminPartnerOnboarding);
router.post('/partners/:id/onboarding/submit', canUpdatePartners, submitAdminPartnerOnboarding);
router.get('/verifications', canManageVerifications, getPendingVerifications);
router.get('/verifications/:id', canManageVerifications, getVerificationDetail);
router.get('/listings', canManageListings, getAdminListings);
router.patch('/verifications/:id/status', canManageVerifications, updateVerificationStatus);
router.patch('/listings/:id/status', canManageListings, updateAdminListingStatus);
router.patch('/users/:id/status', canUpdateAccountStatus, updateAdminUserStatus);
router.patch('/partners/:id', canUpdatePartners, updatePartnerUser);
router.delete('/partners/:id', canDeletePartners, deletePartnerUser);

// Custom Roles
router.get('/roles', canViewRoles, getRoles);
router.post('/roles', canCreateRoles, createRole);
router.patch('/roles/:id', canUpdateRoles, updateRole);
router.delete('/roles/:id', canDeleteRoles, deleteRole);

export default router;
