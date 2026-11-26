import {
  downloadDeliveryChallan,
  getVehicleTransportDetail,
  listVehicleTransports,
  resendTransportWhatsApp,
  updateCarrierInfo,
  updateTransportStage,
  deleteVehicleTransport,
} from '../controllers/vehicleTransport.controller';
import { NextFunction, Request, Response, Router } from 'express';
import {
  getPublicJobs,
  getPublicJobBySlug,
  applyForJob,
  getMyApplications,
  getMyApplicationById,
  downloadMyApplicationDocument,
  getRecruitmentDashboardStats,
  getAdminJobs,
  getAdminJobById,
  createJob,
  updateJob,
  duplicateJob,
  updateJobStatus,
  deleteJob,
  getAdminApplications,
  getAdminApplicationById,
  updateApplicationStage,
  assignRecruiter,
  deleteApplication,
  getAdminCandidates,
  getAdminCandidateById,
  toggleTalentPool,
  addApplicationNote,
  updateApplicationNote,
  deleteApplicationNote,
  addCandidateRating,
  updateCandidateRating,
  deleteCandidateRating,
  getAdminInterviews,
  scheduleInterview,
  updateInterview,
  deleteInterview,
  submitInterviewFeedback,
  getAdminOffers,
  acceptOfferOffline,
  retryOfferHrmHandoff,
  downloadOfferAcceptanceFile,
  getPublicOfferCertificate,
  getPublicOfferSignedLetter,
  getOfferFormOptions,
  getOfferManagerOptions,
  downloadAdminOfferPdf,
  createOffer,
  updateOffer,
  updateOfferStatus,
  resendOffer,
  getPublicOfferShortLink,
  deleteOffer,
  getPublicOfferResponse,
  getPublicOfferPdf,
  respondToPublicOffer,
  getRecruitmentSettings,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
  updateDepartment,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  updateEmailAutomationRule,
  getAdminDepartments,
  createAdminDepartment,
  updateAdminDepartment,
  deleteAdminDepartment,
  getMyRecruitmentReach,
} from '../controllers/recruitment.controller';
import { requireAuth, requireAdmin, requireAdminOrEmployeePermissions, requireSuperAdminOrEmployeePermissions } from '../middlewares/auth.middleware';
import { sanitizeRequestBody } from '../middlewares/sanitizeRequest.middleware';
import {
  refuseStateLimitedRecruitmentMail,
  requireAllIndiaRecruitment,
  requireApplicationInReach,
  requireApplicationViewInReach,
  requireCandidateInReach,
  requireInterviewFeedbackAccess,
  requireInterviewInReach,
  requireJobInReach,
  requireJobViewInReach,
  requireOfferInReach,
} from '../middlewares/recruitmentReach.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';
import {
  addRtoRecordTaskDocument,
  checkRtoRecordCompliance,
  checkRtoRecordComplianceWithRcApi,
  createRtoRecord,
  deleteRtoRecord,
  getRtoRecordDeletionImpactRecord,
  downloadRtoTransferCertificate,
  getRtoRecordWorkspace,
  initializeRtoRecordTasks,
  listRtoRecords,
  lockRtoRecord,
  listAllRtoTransferTasks,
  removeRtoRecordTaskDocument,
  updateRtoRecord,
  updateRtoRecordTask,
} from '../controllers/rto.controller';
import {
  addSellAccountPaymentRecord,
  createSellAccountRecord,
  deleteSellAccountPaymentRecord,
  deleteSellAccountRecord,
  getSellAccountDeletionImpactRecord,
  getSellAccountRecord,
  listSellAccountRecords,
  saveAndStartSellAccountRtoRecord,
  startSellAccountRtoRecord,
  updateAndStartSellAccountRtoRecord,
  updateSellAccountRecord,
  lockSellAccountRecord,
  completeSellAccountSale,
  resendSellAccountInvoice,
  resendSellAccountPaymentReceipt,
  downloadSellAccountInvoice,
  downloadSellAccountProfitInvoice,
  downloadSellAccountDeliveryChallan,
  issueSellAccountReceiptRecord,
  cancelSellAccountReceiptRecord,
  downloadSellAccountPaymentReceipt,
  cancelSellAccountSaleRecord,
  downloadSellAccountCreditNote,
  requestSellAccountRefundRecord,
  approveSellAccountRefundRecord,
  rejectSellAccountRefundRecord,
  paySellAccountRefundRecord,
  downloadSellAccountRefundAdvice,
} from '../controllers/sellAccount.controller';

import { jobApplicationRateLimit, offerLinkRespondRateLimit, offerLinkViewRateLimit, offerShortLinkRateLimit } from '../middlewares/rateLimit.middleware';
const router = Router();
const resumeUpload = getDocumentUploadMiddleware('secure', 'resume');
const offerLetterUpload = getDocumentUploadMiddleware('secure', 'offer-letter');
// A signed offer letter: PDF, JPG, PNG or WEBP (a scan or a phone photo), content-checked.
const signedOfferUpload = getDocumentUploadMiddleware('secure', 'document');

const canViewRecruitmentDashboard = requireSuperAdminOrEmployeePermissions(['recruitment.dashboard.read']);
const canViewDepartments = requireSuperAdminOrEmployeePermissions(['recruitment.departments.read']);
const canCreateDepartments = requireSuperAdminOrEmployeePermissions(['recruitment.departments.create']);
const canUpdateDepartments = requireSuperAdminOrEmployeePermissions(['recruitment.departments.update']);
const canDeleteDepartments = requireSuperAdminOrEmployeePermissions(['recruitment.departments.delete']);
const canViewJobs = requireSuperAdminOrEmployeePermissions(['recruitment.jobs.read']);
const canCreateJobs = requireSuperAdminOrEmployeePermissions(['recruitment.jobs.create']);
const canUpdateJobs = requireSuperAdminOrEmployeePermissions(['recruitment.jobs.update']);
const canDeleteJobs = requireSuperAdminOrEmployeePermissions(['recruitment.jobs.delete']);
const canDuplicateJobs = requireSuperAdminOrEmployeePermissions(['recruitment.jobs.duplicate']);
const canChangeJobStatus = requireSuperAdminOrEmployeePermissions(['recruitment.jobs.change_status']);
const canViewRto = requireAdminOrEmployeePermissions(['accounts.rto.read', 'accounts.rto.crud']);
const canViewTasks = requireAdminOrEmployeePermissions(['tasks.read']);
const canCreateRto = requireAdminOrEmployeePermissions(['accounts.rto.crud', 'accounts.rto.create']);
const canUpdateRto = requireAdminOrEmployeePermissions(['accounts.rto.crud', 'accounts.rto.update']);
const canDeleteRto = requireAdminOrEmployeePermissions(['accounts.rto.crud', 'accounts.rto.delete']);
const canViewSell = requireAdminOrEmployeePermissions(['accounts.sell.read', 'accounts.sell.crud']);
const canCreateSell = requireAdminOrEmployeePermissions(['accounts.sell.crud', 'accounts.sell.create']);
const canUpdateSell = requireAdminOrEmployeePermissions(['accounts.sell.crud', 'accounts.sell.update']);
const canDeleteSell = requireAdminOrEmployeePermissions(['accounts.sell.crud', 'accounts.sell.delete']);
// Approving and paying refunds is deliberately not part of accounts.sell.crud.
const canApproveSellRefund = requireAdminOrEmployeePermissions(['accounts.sell.refund.approve']);
const canViewApplications = requireSuperAdminOrEmployeePermissions(['recruitment.applications.read']);
const canUpdateApplicationStage = requireSuperAdminOrEmployeePermissions(['recruitment.applications.update_stage']);
const canAssignApplications = requireSuperAdminOrEmployeePermissions(['recruitment.applications.assign']);
const canDeleteApplications = requireSuperAdminOrEmployeePermissions(['recruitment.applications.delete']);
const canCreateNotes = requireSuperAdminOrEmployeePermissions(['recruitment.applications.notes.create']);
const canUpdateNotes = requireSuperAdminOrEmployeePermissions(['recruitment.applications.notes.update']);
const canDeleteNotes = requireSuperAdminOrEmployeePermissions(['recruitment.applications.notes.delete']);
const canCreateRatings = requireSuperAdminOrEmployeePermissions(['recruitment.applications.ratings.create']);
const canUpdateRatings = requireSuperAdminOrEmployeePermissions(['recruitment.applications.ratings.update']);
const canDeleteRatings = requireSuperAdminOrEmployeePermissions(['recruitment.applications.ratings.delete']);
const canViewCandidates = requireSuperAdminOrEmployeePermissions(['recruitment.candidates.read']);
const canUpdateCandidates = requireSuperAdminOrEmployeePermissions(['recruitment.candidates.update']);
const canViewInterviews = requireSuperAdminOrEmployeePermissions(['recruitment.interviews.read']);
const canCreateInterviews = requireSuperAdminOrEmployeePermissions(['recruitment.interviews.create']);
const canUpdateInterviews = requireSuperAdminOrEmployeePermissions(['recruitment.interviews.update']);
const canDeleteInterviews = requireSuperAdminOrEmployeePermissions(['recruitment.interviews.delete']);
const canManageInterviewScorecards = requireSuperAdminOrEmployeePermissions(['recruitment.interviews.scorecard']);
const canViewOffers = requireSuperAdminOrEmployeePermissions(['recruitment.offers.read']);
const canCreateOffers = requireSuperAdminOrEmployeePermissions(['recruitment.offers.create']);
const canUpdateOffers = requireSuperAdminOrEmployeePermissions(['recruitment.offers.update']);
const canDeleteOffers = requireSuperAdminOrEmployeePermissions(['recruitment.offers.delete']);
const canChangeOfferStatus = requireSuperAdminOrEmployeePermissions(['recruitment.offers.change_status']);
const canViewPipeline = requireSuperAdminOrEmployeePermissions(['recruitment.pipeline.read']);
const canCreatePipeline = requireSuperAdminOrEmployeePermissions(['recruitment.pipeline.create']);
const canUpdatePipeline = requireSuperAdminOrEmployeePermissions(['recruitment.pipeline.update']);
const canDeletePipeline = requireSuperAdminOrEmployeePermissions(['recruitment.pipeline.delete']);
const canViewEmailTemplates = requireAdminOrEmployeePermissions(['email.read', 'email.manage']);
const canUpdateEmailTemplate = requireAdminOrEmployeePermissions(['email.manage']);
const canViewRecruitmentSettings = (req: Request, res: Response, next: NextFunction) => {
  const section = typeof req.query.section === 'string' ? req.query.section : '';
  if (section === 'templates') {
    return canViewEmailTemplates(req, res, next);
  }

  const permissions = section === 'pipeline'
    ? ['recruitment.pipeline.read']
    : section === 'departments'
      ? ['recruitment.departments.read']
      : ['recruitment.settings.read'];

  return requireSuperAdminOrEmployeePermissions(permissions)(req, res, next);
};
const canUpdateRecruitmentSettings = requireSuperAdminOrEmployeePermissions(['recruitment.settings.update']);
const canUseRecruitment = requireSuperAdminOrEmployeePermissions([
  'recruitment.dashboard.read', 'recruitment.departments.read', 'recruitment.jobs.read', 'recruitment.applications.read',
  'recruitment.candidates.read', 'recruitment.interviews.read', 'recruitment.offers.read', 'recruitment.pipeline.read', 'recruitment.settings.read',
]);

// Public endpoints
router.get('/public/jobs', getPublicJobs);
router.get('/public/jobs/:slug', getPublicJobBySlug);
router.post('/public/jobs/:slug/apply', jobApplicationRateLimit, resumeUpload.single('resume'), sanitizeRequestBody, applyForJob);
router.get('/public/offer-links/:code', offerShortLinkRateLimit, getPublicOfferShortLink);
router.get('/public/offers/:token', offerLinkViewRateLimit, getPublicOfferResponse);
router.get('/public/offers/:token/pdf', offerLinkViewRateLimit, getPublicOfferPdf);
router.get('/public/offers/:token/certificate', offerLinkViewRateLimit, getPublicOfferCertificate);
router.get('/public/offers/:token/signed-letter', offerLinkViewRateLimit, getPublicOfferSignedLetter);
router.post('/public/offers/:token/respond', offerLinkRespondRateLimit, signedOfferUpload.single('signedCopy'), sanitizeRequestBody, respondToPublicOffer);

// Applicant protected endpoints
router.get('/my-applications', requireAuth, getMyApplications);
router.get('/my-applications/:id', requireAuth, getMyApplicationById);
router.get('/my-applications/:id/documents/:documentId/download', requireAuth, downloadMyApplicationDocument);

// Admin protected endpoints
router.use('/admin', requireAuth, requireAdmin);

// Dashboard
// What the caller sees (their states), for the banner and the forms. Every recruitment screen asks for it.
router.get('/admin/reach', canUseRecruitment, getMyRecruitmentReach);
router.get('/admin/dashboard', canViewRecruitmentDashboard, getRecruitmentDashboardStats);

// Departments CRUD
router.get('/admin/departments', canViewDepartments, getAdminDepartments);
router.post('/admin/departments', canCreateDepartments, requireAllIndiaRecruitment, createAdminDepartment);
router.put('/admin/departments/:id', canUpdateDepartments, requireAllIndiaRecruitment, updateAdminDepartment);
router.delete('/admin/departments/:id', canDeleteDepartments, requireAllIndiaRecruitment, deleteAdminDepartment);

// Jobs CRUD
router.get('/admin/jobs', canViewJobs, getAdminJobs);
router.post('/admin/jobs', canCreateJobs, createJob);
router.get('/admin/jobs/:id', canViewJobs, requireJobViewInReach, getAdminJobById);
router.put('/admin/jobs/:id', canUpdateJobs, requireJobInReach, updateJob);
router.post('/admin/jobs/:id/duplicate', canDuplicateJobs, requireJobInReach, duplicateJob);
router.patch('/admin/jobs/:id/status', canChangeJobStatus, requireJobInReach, updateJobStatus);
router.delete('/admin/jobs/:id', canDeleteJobs, requireJobInReach, deleteJob);

// RTO work records
router.get('/admin/rto-records', canViewRto, listRtoRecords);
router.get('/admin/rto-transfer-tasks', canViewTasks, listAllRtoTransferTasks);
router.post('/admin/rto-records', canCreateRto, createRtoRecord);
router.put('/admin/rto-records/:id', canUpdateRto, updateRtoRecord);
router.get('/admin/rto-records/:id/delete-impact', canDeleteRto, getRtoRecordDeletionImpactRecord);
router.delete('/admin/rto-records/:id', canDeleteRto, deleteRtoRecord);
router.post('/admin/rto-records/:id/lock', canUpdateRto, lockRtoRecord);
router.get('/admin/rto-records/:id/workspace', canViewRto, getRtoRecordWorkspace);
router.post('/admin/rto-records/:id/transfer-tasks', canUpdateRto, initializeRtoRecordTasks);
router.patch('/admin/rto-records/:id/transfer-tasks/:taskId', canUpdateRto, updateRtoRecordTask);
router.post('/admin/rto-records/:id/transfer-tasks/:taskId/documents', canUpdateRto, addRtoRecordTaskDocument);
router.delete('/admin/rto-records/:id/transfer-tasks/:taskId/documents/:documentId', canUpdateRto, removeRtoRecordTaskDocument);
router.post('/admin/rto-records/:id/compliance', canUpdateRto, checkRtoRecordCompliance);
// A fresh RC lookup is part of RTO transfer readiness and follows the existing RTO update permission.
router.post('/admin/rto-records/:id/compliance/rc-api', canUpdateRto, checkRtoRecordComplianceWithRcApi);
router.get('/admin/rto-records/:id/transfer-certificate', canViewRto, downloadRtoTransferCertificate);

// Sell Account records and normalized payment ledger
router.get('/admin/sell-accounts', canViewSell, listSellAccountRecords);
router.post('/admin/sell-accounts', canCreateSell, createSellAccountRecord);
router.post('/admin/sell-accounts/save-and-start-rto', canCreateSell, canCreateRto, saveAndStartSellAccountRtoRecord);
router.get('/admin/sell-accounts/:id', canViewSell, getSellAccountRecord);
router.put('/admin/sell-accounts/:id', canUpdateSell, updateSellAccountRecord);
router.post('/admin/sell-accounts/:id/lock', canUpdateSell, lockSellAccountRecord);
router.post('/admin/sell-accounts/:id/save-and-start-rto', canUpdateSell, canCreateRto, updateAndStartSellAccountRtoRecord);
router.post('/admin/sell-accounts/:id/start-rto', canUpdateSell, canCreateRto, startSellAccountRtoRecord);
router.post('/admin/sell-accounts/:id/complete', canUpdateSell, canUpdateRto, completeSellAccountSale);
router.post('/admin/sell-accounts/:id/invoice/resend', canUpdateSell, resendSellAccountInvoice);
router.get('/admin/sell-accounts/:id/invoice', canViewSell, downloadSellAccountInvoice);
router.get('/admin/sell-accounts/:id/profit-invoice', canViewSell, downloadSellAccountProfitInvoice);
router.get('/admin/sell-accounts/:id/delivery-challan', canViewSell, downloadSellAccountDeliveryChallan);
const canViewTransport = requireAdminOrEmployeePermissions(['accounts.transport.read', 'accounts.transport.crud']);
const canManageTransport = requireAdminOrEmployeePermissions(['accounts.transport.crud', 'accounts.transport.update', 'accounts.transport.create']);
const canDeleteTransport = requireAdminOrEmployeePermissions(['accounts.transport.crud', 'accounts.transport.delete']);

router.get('/admin/vehicle-transports', canViewTransport, listVehicleTransports);
router.get('/admin/vehicle-transports/:id', canViewTransport, getVehicleTransportDetail);
router.get('/admin/vehicle-transports/:id/challan', canViewTransport, downloadDeliveryChallan);
router.patch('/admin/vehicle-transports/:id/carrier', canManageTransport, updateCarrierInfo);
router.post('/admin/vehicle-transports/:id/status', canManageTransport, updateTransportStage);
router.post('/admin/vehicle-transports/:id/notify', canManageTransport, resendTransportWhatsApp);
router.delete('/admin/vehicle-transports/:id', canDeleteTransport, deleteVehicleTransport);

router.get('/admin/sell-accounts/:id/delete-impact', canDeleteSell, getSellAccountDeletionImpactRecord);
router.delete('/admin/sell-accounts/:id', canDeleteSell, deleteSellAccountRecord);
router.post('/admin/sell-accounts/:id/payments', canUpdateSell, addSellAccountPaymentRecord);
router.post('/admin/sell-accounts/:id/payments/:paymentId/receipt/resend', canUpdateSell, resendSellAccountPaymentReceipt);
router.delete('/admin/sell-accounts/:id/payments/:paymentId', canDeleteSell, deleteSellAccountPaymentRecord);
router.get('/admin/sell-accounts/:id/payments/:paymentId/receipt', canViewSell, downloadSellAccountPaymentReceipt);
router.post('/admin/sell-accounts/:id/payments/:paymentId/issue', canUpdateSell, issueSellAccountReceiptRecord);
router.post('/admin/sell-accounts/:id/payments/:paymentId/cancel', canDeleteSell, cancelSellAccountReceiptRecord);
router.post('/admin/sell-accounts/:id/cancel-sale', canDeleteSell, cancelSellAccountSaleRecord);
router.get('/admin/sell-accounts/:id/credit-note', canViewSell, downloadSellAccountCreditNote);
router.post('/admin/sell-accounts/:id/refunds', canUpdateSell, requestSellAccountRefundRecord);
router.post('/admin/sell-accounts/:id/refunds/:refundId/approve', canApproveSellRefund, approveSellAccountRefundRecord);
router.post('/admin/sell-accounts/:id/refunds/:refundId/reject', canApproveSellRefund, rejectSellAccountRefundRecord);
router.post('/admin/sell-accounts/:id/refunds/:refundId/pay', canApproveSellRefund, paySellAccountRefundRecord);
router.get('/admin/sell-accounts/:id/refunds/:refundId/advice', canViewSell, downloadSellAccountRefundAdvice);

// Applications
router.get('/admin/applications', canViewApplications, getAdminApplications);
router.get('/admin/applications/:id', canViewApplications, requireApplicationViewInReach, getAdminApplicationById);
router.patch('/admin/applications/:id/stage', canUpdateApplicationStage, requireApplicationInReach, updateApplicationStage);
router.patch('/admin/applications/:id/assign', canAssignApplications, requireApplicationInReach, assignRecruiter);
router.post('/admin/applications/:id/notes', canCreateNotes, requireApplicationInReach, addApplicationNote);
router.patch('/admin/applications/:id/notes/:noteId', canUpdateNotes, requireApplicationInReach, updateApplicationNote);
router.delete('/admin/applications/:id/notes/:noteId', canDeleteNotes, requireApplicationInReach, deleteApplicationNote);
router.post('/admin/applications/:id/ratings', canCreateRatings, requireApplicationInReach, addCandidateRating);
router.patch('/admin/applications/:id/ratings/:ratingId', canUpdateRatings, requireApplicationInReach, updateCandidateRating);
router.delete('/admin/applications/:id/ratings/:ratingId', canDeleteRatings, requireApplicationInReach, deleteCandidateRating);
router.delete('/admin/applications/:id', canDeleteApplications, requireApplicationInReach, deleteApplication);

// Candidates & Talent Pool
router.get('/admin/candidates', canViewCandidates, getAdminCandidates);
router.get('/admin/candidates/:id', canViewCandidates, requireCandidateInReach, getAdminCandidateById);
router.patch('/admin/candidates/:id/talent-pool', canUpdateCandidates, requireCandidateInReach, toggleTalentPool);

// Interviews
router.get('/admin/interviews', canViewInterviews, getAdminInterviews);
router.post('/admin/interviews', canCreateInterviews, scheduleInterview);
router.patch('/admin/interviews/:id', canUpdateInterviews, requireInterviewInReach, updateInterview);
router.delete('/admin/interviews/:id', canDeleteInterviews, requireInterviewInReach, deleteInterview);
router.post('/admin/interviews/:id/feedback', canManageInterviewScorecards, requireInterviewFeedbackAccess, submitInterviewFeedback);

// Offers
const canPrepareOffers = requireSuperAdminOrEmployeePermissions(['recruitment.offers.create', 'recruitment.offers.update']);
router.get('/admin/offers/form-options', canPrepareOffers, getOfferFormOptions);
router.get('/admin/offers/manager-options', canPrepareOffers, getOfferManagerOptions);
router.get('/admin/offers', canViewOffers, getAdminOffers);
router.get('/admin/offers/:id/pdf', canViewOffers, requireOfferInReach, downloadAdminOfferPdf);
router.post('/admin/offers', canCreateOffers, offerLetterUpload.single('offerPdf'), sanitizeRequestBody, createOffer);
router.patch('/admin/offers/:id', canUpdateOffers, requireOfferInReach, offerLetterUpload.single('offerPdf'), sanitizeRequestBody, updateOffer);
router.patch('/admin/offers/:id/status', canChangeOfferStatus, requireOfferInReach, updateOfferStatus);
router.post('/admin/offers/:id/resend', canChangeOfferStatus, requireOfferInReach, sanitizeRequestBody, resendOffer);
router.post('/admin/offers/:id/accept-offline', canChangeOfferStatus, requireOfferInReach, signedOfferUpload.single('signedCopy'), sanitizeRequestBody, acceptOfferOffline);
router.get('/admin/offers/:id/acceptance/:kind', canViewOffers, requireOfferInReach, downloadOfferAcceptanceFile);
router.post('/admin/offers/:id/hrm-handoff', canChangeOfferStatus, requireOfferInReach, retryOfferHrmHandoff);
router.delete('/admin/offers/:id', canDeleteOffers, requireOfferInReach, deleteOffer);

// Settings
router.get('/admin/settings', canViewRecruitmentSettings, getRecruitmentSettings);
router.post('/admin/settings/pipeline-stages', canCreatePipeline, requireAllIndiaRecruitment, createPipelineStage);
router.put('/admin/settings/pipeline-stages/:id', canUpdatePipeline, requireAllIndiaRecruitment, updatePipelineStage);
router.delete('/admin/settings/pipeline-stages/:id', canDeletePipeline, requireAllIndiaRecruitment, deletePipelineStage);
router.put('/admin/settings/departments/:id', canUpdateDepartments, requireAllIndiaRecruitment, updateDepartment);
router.post('/admin/settings/templates', canUpdateEmailTemplate, refuseStateLimitedRecruitmentMail, sanitizeRequestBody, createEmailTemplate);
router.put('/admin/settings/templates/:id', canUpdateEmailTemplate, refuseStateLimitedRecruitmentMail, updateEmailTemplate);
router.delete('/admin/settings/templates/:id', canUpdateEmailTemplate, refuseStateLimitedRecruitmentMail, deleteEmailTemplate);
router.put('/admin/settings/email-rules/:eventCode', canUpdateEmailTemplate, refuseStateLimitedRecruitmentMail, updateEmailAutomationRule);

export default router;
