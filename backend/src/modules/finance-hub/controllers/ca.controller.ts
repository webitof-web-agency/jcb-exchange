import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { addVaultDocument, archiveVaultDocument, closeQuery, closeYear, getCaDashboard, getMonthlyClose, getReviewQueue, getYearClose, listQueries, listVault, raiseQuery, reopenYear, respondQuery, reviewVoucher, updateMonthlyClose } from '../services/ca.service';
import { actorFromRequest, requestBody } from '../services/context';
import { exportCsv, exportTally, getUploadHistory, importOpeningBalances, importVouchers } from '../services/dataExchange.service';

const param = (req: Request, name = 'id') => {
  const value = req.params[name];
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};
const query = (req: Request) => req.query as Record<string, unknown>;
const ledgerAccess = async (req: Request) => {
  const permissions = await getRequestPermissions(req);
  return { actor: actorFromRequest(req), isSuperAdmin: req.user?.role === 'SUPER_ADMIN', canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]), canApprove: hasAnyOf(permissions, [P.approve]), canPost: hasAnyOf(permissions, [P.booksPost]) };
};

export const dashboard = handle(() => getCaDashboard());
export const vault = handle(async (req) => ({ documents: await listVault(query(req)) }));
export const newVaultDocument = handle((req) => addVaultDocument(requestBody(req), actorFromRequest(req)), 201);
export const toggleArchive = handle((req) => archiveVaultDocument(param(req), actorFromRequest(req)));
export const monthlyClose = handle((req) => getMonthlyClose(param(req)));
export const saveMonthlyClose = handle((req) => updateMonthlyClose(param(req), requestBody(req), actorFromRequest(req)));
export const yearClose = handle((req) => getYearClose(param(req)));
export const runYearClose = handle(async (req) => closeYear(param(req), await ledgerAccess(req)));
export const runYearReopen = handle(async (req) => reopenYear(param(req), requestBody(req), await ledgerAccess(req)));
export const queries = handle(async (req) => ({ queries: await listQueries(query(req)) }));
export const newQuery = handle((req) => raiseQuery(requestBody(req), actorFromRequest(req)), 201);
export const replyQuery = handle((req) => respondQuery(param(req), requestBody(req), actorFromRequest(req)));
export const finishQuery = handle((req) => closeQuery(param(req), requestBody(req), actorFromRequest(req)));
export const reviewQueue = handle((req) => getReviewQueue(query(req)));
export const review = handle((req) => reviewVoucher(param(req), requestBody(req), actorFromRequest(req)));

export const importVoucherRows = handle(async (req) => importVouchers(requestBody(req), await ledgerAccess(req)));
export const importOpening = handle((req) => importOpeningBalances(requestBody(req), actorFromRequest(req)));
export const csvExport = handle((req) => exportCsv(param(req, 'kind'), query(req), actorFromRequest(req)));
export const tallyExport = handle((req) => exportTally(query(req), actorFromRequest(req)));
export const history = handle(() => getUploadHistory());
