import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import {
  autoMatch,
  createCashCount,
  createGatewaySettlements,
  createVoucherFromStatement,
  getBankingOverview,
  getBrs,
  getGatewayOverview,
  getReconciliation,
  ignoreStatementRow,
  listCashCounts,
  listImports,
  listUnmatched,
  matchManually,
  unmatch,
} from '../services/banking.service';
import { actorFromRequest, requestBody } from '../services/context';

const idParam = (req: Request) => {
  const value = req.params.id;
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};
const query = (req: Request) => req.query as Record<string, unknown>;

const ledgerAccess = async (req: Request) => {
  const permissions = await getRequestPermissions(req);
  return {
    actor: actorFromRequest(req),
    isSuperAdmin: req.user?.role === 'SUPER_ADMIN',
    canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]),
    canApprove: hasAnyOf(permissions, [P.approve]),
    canPost: hasAnyOf(permissions, [P.booksPost]),
  };
};

export const overview = handle(async () => ({ banks: await getBankingOverview() }));
export const reconciliation = handle((req) => getReconciliation(idParam(req), query(req)));
export const brs = handle((req) => getBrs(idParam(req), query(req)));
export const runAutoMatch = handle((req) => autoMatch(idParam(req), requestBody(req), actorFromRequest(req)));
export const match = handle((req) => matchManually(requestBody(req), actorFromRequest(req)), 201);
export const ignore = handle((req) => ignoreStatementRow(requestBody(req), actorFromRequest(req)), 201);
export const removeMatch = handle((req) => unmatch(idParam(req), actorFromRequest(req)));
export const voucherFromStatement = handle(async (req) => createVoucherFromStatement(requestBody(req), await ledgerAccess(req)), 201);
export const unmatched = handle((req) => listUnmatched(query(req)));
export const imports = handle(async () => ({ batches: await listImports() }));
export const cashCounts = handle(async (req) => ({ counts: await listCashCounts(query(req)) }));
export const newCashCount = handle((req) => createCashCount(requestBody(req), actorFromRequest(req)), 201);
export const gateways = handle(() => getGatewayOverview());
export const gatewaySettlements = handle(async (req) => createGatewaySettlements(requestBody(req), await ledgerAccess(req)), 201);
