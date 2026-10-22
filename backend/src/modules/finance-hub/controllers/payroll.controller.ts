import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { actorFromRequest, requestBody } from '../services/context';
import type { LedgerAccess } from '../services/ledger.service';
import {
  approveRun,
  cancelRun,
  closeAdvance,
  createFullFinal,
  createRun,
  getRun,
  getStatutory,
  giveAdvance,
  importStaff,
  listAdvances,
  listEmployees,
  listFullFinal,
  listRuns,
  listStructures,
  payFullFinal,
  payRun,
  postFullFinal,
  recomputeRun,
  saveSalary,
  saveStructure,
  updatePayslip,
} from '../services/payroll.service';

const param = (req: Request, name = 'id') => {
  const value = req.params[name];
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};
const ledgerAccess = async (req: Request): Promise<LedgerAccess> => {
  const permissions = await getRequestPermissions(req);
  return { actor: actorFromRequest(req), isSuperAdmin: req.user?.role === 'SUPER_ADMIN', canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]), canApprove: hasAnyOf(permissions, [P.approve]) };
};

export const structures = handle(async () => ({ structures: await listStructures() }));
export const newStructure = handle((req) => saveStructure(null, requestBody(req), actorFromRequest(req)), 201);
export const editStructure = handle((req) => saveStructure(param(req), requestBody(req), actorFromRequest(req)));
export const employees = handle(async () => ({ employees: await listEmployees() }));
export const putSalary = handle((req) => saveSalary(param(req), requestBody(req), actorFromRequest(req)));
export const importEmployees = handle((req) => importStaff(actorFromRequest(req)));

export const runs = handle(async () => ({ runs: await listRuns() }));
export const run = handle((req) => getRun(param(req)));
export const newRun = handle((req) => createRun(requestBody(req), actorFromRequest(req)), 201);
export const editPayslip = handle((req) => updatePayslip(param(req), param(req, 'slipId'), requestBody(req), actorFromRequest(req)));
export const recompute = handle((req) => recomputeRun(param(req), actorFromRequest(req)));
export const cancel = handle((req) => cancelRun(param(req), actorFromRequest(req)));
export const approve = handle(async (req) => approveRun(param(req), await ledgerAccess(req)));
export const pay = handle(async (req) => payRun(param(req), requestBody(req), await ledgerAccess(req)));

export const advances = handle(async () => ({ advances: await listAdvances() }));
export const newAdvance = handle(async (req) => giveAdvance(requestBody(req), await ledgerAccess(req)), 201);
export const endAdvance = handle((req) => closeAdvance(param(req), actorFromRequest(req)));

export const statutory = handle((req) => getStatutory(req.query as Record<string, unknown>));

export const fullFinal = handle(async () => ({ settlements: await listFullFinal() }));
export const newFullFinal = handle((req) => createFullFinal(requestBody(req), actorFromRequest(req)), 201);
export const postFnf = handle(async (req) => postFullFinal(param(req), await ledgerAccess(req)));
export const payFnf = handle(async (req) => payFullFinal(param(req), requestBody(req), await ledgerAccess(req)));
