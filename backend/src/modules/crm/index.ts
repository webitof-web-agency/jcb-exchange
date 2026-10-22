// CRM & follow-up system. Mounted at /crm. Plan and phases: docs/crm/00_CRM_PLAN.md.
export { default as crmRoutes } from './routes';
export { CRM_ALL_PERMISSIONS, CRM_ANY_PERMISSIONS, CRM_PERMISSIONS } from './permissions';
export { onLeadCaptured } from './services/leads.service';
export { startCrmWorker } from './worker';
