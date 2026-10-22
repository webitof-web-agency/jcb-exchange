import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS } from '../permissions';
import { actorFromRequest, requestBody } from '../services/context';
import {
  approveVoucher,
  createVoucher,
  deleteVoucher,
  finalizeOpeningBalances,
  getVoucher,
  listVouchers,
  postVoucher,
  rejectVoucher,
  reopenOpeningBalances,
  reverseVoucher,
  updateVoucher,
  type LedgerAccess,
} from '../services/ledger.service';
import { getGeneralLedger, getTrialBalance, listAuditTrail, searchVehicles } from '../services/reports.service';

const idParam = (req: Request, name = 'id') => {
  const value = req.params[name];
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};

const ledgerAccess = async (req: Request): Promise<LedgerAccess> => {
  const permissions = await getRequestPermissions(req);
  return {
    actor: actorFromRequest(req),
    isSuperAdmin: req.user?.role === 'SUPER_ADMIN',
    canPostSoftClosed: hasAnyOf(permissions, [FH_PERMISSIONS.periodLock]),
    canApprove: hasAnyOf(permissions, [FH_PERMISSIONS.approve]),
  };
};

const query = (req: Request) => req.query as Record<string, unknown>;

export const getVouchers = handle((req) => listVouchers(query(req)));
export const getVoucherById = handle((req) => getVoucher(idParam(req)));
export const postNewVoucher = handle(async (req) => createVoucher(requestBody(req), await ledgerAccess(req)), 201);
export const putVoucher = handle(async (req) => updateVoucher(idParam(req), requestBody(req), await ledgerAccess(req)));
export const removeVoucher = handle(async (req) => deleteVoucher(idParam(req), await ledgerAccess(req)));
export const postVoucherToBooks = handle(async (req) => postVoucher(idParam(req), await ledgerAccess(req)));
export const approve = handle(async (req) => approveVoucher(idParam(req), await ledgerAccess(req)));
export const reject = handle(async (req) => rejectVoucher(idParam(req), requestBody(req), await ledgerAccess(req)));
export const reverse = handle(async (req) => reverseVoucher(idParam(req), requestBody(req), await ledgerAccess(req)));

export const finalizeOpening = handle(async (req) => finalizeOpeningBalances(idParam(req, 'yearId'), await ledgerAccess(req)));
export const reopenOpening = handle(async (req) => reopenOpeningBalances(idParam(req, 'yearId'), requestBody(req), await ledgerAccess(req)));

export const trialBalance = handle((req) => getTrialBalance(query(req)));
export const generalLedger = handle((req) => getGeneralLedger(query(req)));
export const auditTrail = handle((req) => listAuditTrail(query(req)));
export const vehicles = handle(async (req) => ({ vehicles: await searchVehicles(query(req)) }));
