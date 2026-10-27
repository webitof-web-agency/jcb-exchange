// Permission keys for the CRM workspace (docs/crm/00_CRM_PLAN.md §4).
// The older enquiries.manage key keeps its old meaning (every enquiry) so existing roles lose nothing.

export const CRM_PERMISSIONS = {
  read: 'crm.read',
  manage: 'crm.manage',
  manageAll: 'crm.manage_all',
  pipelineManage: 'crm.pipeline.manage',
  assign: 'crm.assign',
  reports: 'crm.reports',
  export: 'crm.export',
  import: 'crm.import',
  campaigns: 'crm.campaigns',
  settings: 'crm.settings',
} as const;

export type CrmPermission = (typeof CRM_PERMISSIONS)[keyof typeof CRM_PERMISSIONS];

export const CRM_ALL_PERMISSIONS: CrmPermission[] = Object.values(CRM_PERMISSIONS);

export const LEGACY_ENQUIRIES_PERMISSION = 'enquiries.manage';

// Any of these opens the CRM workspace; each API still checks its own keys.
export const CRM_ANY_PERMISSIONS: string[] = [...CRM_ALL_PERMISSIONS, LEGACY_ENQUIRIES_PERMISSION];
