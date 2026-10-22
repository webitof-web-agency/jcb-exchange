import type { Request } from 'express';
import { getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { actorFromRequest, requestBody } from '../services/context';
import type { LedgerAccess } from '../services/ledger.service';
import {
  bookTaxProvision,
  createChallan,
  get2bReconciliation,
  getGstRegister,
  getGstSummary,
  getIncomeTax,
  getWithholdingRegister,
  listChallans,
  listEInvoices,
  postGstSetOff,
  saveTaxDocRef,
  upload2b,
} from '../services/tax.service';

const query = (req: Request) => req.query as Record<string, unknown>;
const ledgerAccess = async (req: Request): Promise<LedgerAccess> => {
  const permissions = await getRequestPermissions(req);
  return { actor: actorFromRequest(req), isSuperAdmin: req.user?.role === 'SUPER_ADMIN', canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]), canApprove: hasAnyOf(permissions, [P.approve]) };
};

export const gstRegister = handle((req) => getGstRegister(query(req)));
export const gstSummary = handle((req) => getGstSummary(query(req)));
export const gstSetOff = handle(async (req) => postGstSetOff(requestBody(req), await ledgerAccess(req)), 201);
export const gstr2bUpload = handle((req) => upload2b(requestBody(req), actorFromRequest(req)), 201);
export const gstr2bRecon = handle((req) => get2bReconciliation(query(req)));
export const withholding = handle((req) => getWithholdingRegister(query(req)));
export const challans = handle(async (req) => ({ challans: await listChallans(query(req)) }));
export const newChallan = handle(async (req) => createChallan(requestBody(req), await ledgerAccess(req)), 201);
export const eInvoices = handle(async (req) => ({ invoices: await listEInvoices(query(req)) }));
export const saveEInvoice = handle((req) => saveTaxDocRef(requestBody(req), actorFromRequest(req)));
export const incomeTax = handle((req) => getIncomeTax(query(req)));
export const newProvision = handle(async (req) => bookTaxProvision(requestBody(req), await ledgerAccess(req)), 201);
