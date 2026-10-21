// Financial Reports & CA Workspace backend. Mounted at /finance-hub; the legacy /finance
// router is untouched. Plan and phase list: docs/finance-hub/00_MASTER_PLAN.md.
export { default as financeHubRoutes } from './routes';
export { financeHubEvents } from './posting/events';
export { FH_ALL_PERMISSIONS, FH_ANY_PERMISSIONS, FH_PERMISSIONS } from './permissions';
