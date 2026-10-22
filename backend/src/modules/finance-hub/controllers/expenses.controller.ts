import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { createAsset, createPrepaid, disposeAsset, getAssetSchedule, getRuns, listAssets, listPrepaid, postRun, reverseRun, updateAsset } from '../services/assets.service';
import { actorFromRequest, requestBody } from '../services/context';
import { approveReimbursement, generateDueRecurring, getExpenseRegister, listRecurring, listReimbursements, payReimbursement, rejectReimbursement, saveRecurring, submitReimbursement } from '../services/expenses.service';
import type { LedgerAccess } from '../services/ledger.service';

const idParam = (req: Request) => {
  const value = req.params.id;
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};
const query = (req: Request) => req.query as Record<string, unknown>;
const runKind = (req: Request) => {
  if (req.params.kind === 'depreciation') return 'DEPRECIATION' as const;
  if (req.params.kind === 'prepaid') return 'PREPAID' as const;
  throw badRequest('Unknown run.');
};

const ledgerAccess = async (req: Request): Promise<LedgerAccess> => {
  const permissions = await getRequestPermissions(req);
  return {
    actor: actorFromRequest(req),
    isSuperAdmin: req.user?.role === 'SUPER_ADMIN',
    canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]),
    canApprove: hasAnyOf(permissions, [P.approve]),
  };
};

export const register = handle((req) => getExpenseRegister(query(req)));

export const recurring = handle(async () => ({ items: await listRecurring() }));
export const newRecurring = handle((req) => saveRecurring(null, requestBody(req), actorFromRequest(req)), 201);
export const editRecurring = handle((req) => saveRecurring(idParam(req), requestBody(req), actorFromRequest(req)));
export const generateRecurring = handle(async (req) => generateDueRecurring(requestBody(req), await ledgerAccess(req)));

export const reimbursements = handle(async (req) => ({ items: await listReimbursements(query(req)) }));
export const newReimbursement = handle((req) => submitReimbursement(requestBody(req), actorFromRequest(req)), 201);
export const approveClaim = handle(async (req) => approveReimbursement(idParam(req), await ledgerAccess(req)));
export const rejectClaim = handle((req) => rejectReimbursement(idParam(req), requestBody(req), actorFromRequest(req)));
export const payClaim = handle(async (req) => payReimbursement(idParam(req), requestBody(req), await ledgerAccess(req)));

export const assets = handle(async () => ({ assets: await listAssets() }));
export const assetSchedule = handle((req) => getAssetSchedule(idParam(req)));
export const newAsset = handle((req) => createAsset(requestBody(req), actorFromRequest(req)), 201);
export const editAsset = handle((req) => updateAsset(idParam(req), requestBody(req), actorFromRequest(req)));
export const disposeFixedAsset = handle(async (req) => disposeAsset(idParam(req), requestBody(req), await ledgerAccess(req)));

export const prepaid = handle(async () => ({ items: await listPrepaid() }));
export const newPrepaid = handle((req) => createPrepaid(requestBody(req), actorFromRequest(req)), 201);

export const runs = handle((req) => getRuns(runKind(req), query(req)));
export const newRun = handle(async (req) => postRun(runKind(req), requestBody(req), await ledgerAccess(req)), 201);
export const reverseRunNow = handle(async (req) => reverseRun(idParam(req), requestBody(req), await ledgerAccess(req)));
