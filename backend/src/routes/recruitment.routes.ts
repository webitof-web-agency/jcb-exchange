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
  createOffer,
  updateOffer,
  updateOfferStatus,
  deleteOffer,
  getRecruitmentSettings,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
  updateDepartment,
  updateEmailTemplate,
  getAdminDepartments,
  createAdminDepartment,
  updateAdminDepartment,
  deleteAdminDepartment,
} from '../controllers/recruitment.controller';
import { requireAuth, requireAdmin, requireSuperAdminOrEmployeePermissions } from '../middlewares/auth.middleware';
import { getDocumentUploadMiddleware } from '../utils/documentUpload';
import { createRtoRecord, deleteRtoRecord, listRtoRecords, updateRtoRecord } from '../controllers/rto.controller';

const router = Router();
const resumeUpload = getDocumentUploadMiddleware('secure', 'resume');

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
const canViewRto = requireSuperAdminOrEmployeePermissions(['accounts.rto.read', 'accounts.rto.crud']);
const canCreateRto = requireSuperAdminOrEmployeePermissions(['accounts.rto.crud', 'accounts.rto.create']);
const canUpdateRto = requireSuperAdminOrEmployeePermissions(['accounts.rto.crud', 'accounts.rto.update']);
const canDeleteRto = requireSuperAdminOrEmployeePermissions(['accounts.rto.crud', 'accounts.rto.delete']);
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
const canViewRecruitmentSettings = (req: Request, res: Response, next: NextFunction) => {
  const section = typeof req.query.section === 'string' ? req.query.section : '';
  const permissions = section === 'pipeline'
    ? ['recruitment.pipeline.read']
    : section === 'departments'
      ? ['recruitment.departments.read']
      : ['recruitment.settings.read'];

  return requireSuperAdminOrEmployeePermissions(permissions)(req, res, next);
};
const canUpdateRecruitmentSettings = requireSuperAdminOrEmployeePermissions(['recruitment.settings.update']);

// Public endpoints
router.get('/public/jobs', getPublicJobs);
router.get('/public/jobs/:slug', getPublicJobBySlug);
router.post('/public/jobs/:slug/apply', resumeUpload.single('resume'), applyForJob);

// Applicant protected endpoints
router.get('/my-applications', requireAuth, getMyApplications);
router.get('/my-applications/:id', requireAuth, getMyApplicationById);
router.get('/my-applications/:id/documents/:documentId/download', requireAuth, downloadMyApplicationDocument);

// Admin protected endpoints
router.use('/admin', requireAuth, requireAdmin);

// Dashboard
router.get('/admin/dashboard', canViewRecruitmentDashboard, getRecruitmentDashboardStats);

// Departments CRUD
router.get('/admin/departments', canViewDepartments, getAdminDepartments);
router.post('/admin/departments', canCreateDepartments, createAdminDepartment);
router.put('/admin/departments/:id', canUpdateDepartments, updateAdminDepartment);
router.delete('/admin/departments/:id', canDeleteDepartments, deleteAdminDepartment);

// Jobs CRUD
router.get('/admin/jobs', canViewJobs, getAdminJobs);
router.post('/admin/jobs', canCreateJobs, createJob);
router.get('/admin/jobs/:id', canViewJobs, getAdminJobById);
router.put('/admin/jobs/:id', canUpdateJobs, updateJob);
router.post('/admin/jobs/:id/duplicate', canDuplicateJobs, duplicateJob);
router.patch('/admin/jobs/:id/status', canChangeJobStatus, updateJobStatus);
router.delete('/admin/jobs/:id', canDeleteJobs, deleteJob);

// RTO work records
router.get('/admin/rto-records', canViewRto, listRtoRecords);
router.post('/admin/rto-records', canCreateRto, createRtoRecord);
router.put('/admin/rto-records/:id', canUpdateRto, updateRtoRecord);
router.delete('/admin/rto-records/:id', canDeleteRto, deleteRtoRecord);

// Applications
router.get('/admin/applications', canViewApplications, getAdminApplications);
router.get('/admin/applications/:id', canViewApplications, getAdminApplicationById);
router.patch('/admin/applications/:id/stage', canUpdateApplicationStage, updateApplicationStage);
router.patch('/admin/applications/:id/assign', canAssignApplications, assignRecruiter);
router.post('/admin/applications/:id/notes', canCreateNotes, addApplicationNote);
router.patch('/admin/applications/:id/notes/:noteId', canUpdateNotes, updateApplicationNote);
router.delete('/admin/applications/:id/notes/:noteId', canDeleteNotes, deleteApplicationNote);
router.post('/admin/applications/:id/ratings', canCreateRatings, addCandidateRating);
router.patch('/admin/applications/:id/ratings/:ratingId', canUpdateRatings, updateCandidateRating);
router.delete('/admin/applications/:id/ratings/:ratingId', canDeleteRatings, deleteCandidateRating);
router.delete('/admin/applications/:id', canDeleteApplications, deleteApplication);

// Candidates & Talent Pool
router.get('/admin/candidates', canViewCandidates, getAdminCandidates);
router.get('/admin/candidates/:id', canViewCandidates, getAdminCandidateById);
router.patch('/admin/candidates/:id/talent-pool', canUpdateCandidates, toggleTalentPool);

// Interviews
router.get('/admin/interviews', canViewInterviews, getAdminInterviews);
router.post('/admin/interviews', canCreateInterviews, scheduleInterview);
router.patch('/admin/interviews/:id', canUpdateInterviews, updateInterview);
router.delete('/admin/interviews/:id', canDeleteInterviews, deleteInterview);
router.post('/admin/interviews/:id/feedback', canManageInterviewScorecards, submitInterviewFeedback);

// Offers
router.get('/admin/offers', canViewOffers, getAdminOffers);
router.post('/admin/offers', canCreateOffers, createOffer);
router.patch('/admin/offers/:id', canUpdateOffers, updateOffer);
router.patch('/admin/offers/:id/status', canChangeOfferStatus, updateOfferStatus);
router.delete('/admin/offers/:id', canDeleteOffers, deleteOffer);

// Settings
router.get('/admin/settings', canViewRecruitmentSettings, getRecruitmentSettings);
router.post('/admin/settings/pipeline-stages', canCreatePipeline, createPipelineStage);
router.put('/admin/settings/pipeline-stages/:id', canUpdatePipeline, updatePipelineStage);
router.delete('/admin/settings/pipeline-stages/:id', canDeletePipeline, deletePipelineStage);
router.put('/admin/settings/departments/:id', canUpdateDepartments, updateDepartment);
router.put('/admin/settings/templates/:id', canUpdateRecruitmentSettings, updateEmailTemplate);

export default router;
