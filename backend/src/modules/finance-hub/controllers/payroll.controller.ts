import type { Request, Response } from 'express';
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

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/gu, '""')}"`;
const sendCsv = (res: Response, fileName: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/gu, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(`\uFEFF${csv}`);
};

export const structures = handle(async () => ({ structures: await listStructures() }));
export const newStructure = handle((req) => saveStructure(null, requestBody(req), actorFromRequest(req)), 201);
export const editStructure = handle((req) => saveStructure(param(req), requestBody(req), actorFromRequest(req)));
export const employees = handle(async () => ({ employees: await listEmployees() }));
export const putSalary = handle((req) => saveSalary(param(req), requestBody(req), actorFromRequest(req)));
export const importEmployees = handle((req) => importStaff(actorFromRequest(req)));

export const runs = handle(async () => ({ runs: await listRuns() }));
export const run = handle((req) => getRun(param(req)));
export const payslipsCsv = async (req: Request, res: Response, next: (error?: unknown) => void) => {
  try {
    const payrollRun = await getRun(param(req));
    return sendCsv(res, `payslips-${payrollRun.month}.csv`, ['Employee', 'Employee Code', 'Department', 'Paid Days', 'Gross', 'Employee PF', 'Employee ESI', 'Professional Tax', 'TDS', 'Advance Recovery', 'Net Pay', 'Employer PF', 'Employer ESI'], payrollRun.payslips.map((slip) => [
      slip.party?.name,
      slip.profile?.employeeCode,
      slip.profile?.department,
      slip.paidDays,
      slip.gross,
      slip.employeePf,
      slip.employeeEsi,
      slip.professionalTax,
      slip.tds,
      slip.advanceRecovery,
      slip.net,
      slip.employerPf,
      slip.employerEsi,
    ]));
  } catch (error) {
    return handle(async () => { throw error; })(req, res, next);
  }
};
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
export const statutoryCsv = async (req: Request, res: Response, next: (error?: unknown) => void) => {
  try {
    const report = await getStatutory(req.query as Record<string, unknown>);
    const rows = [
      ...report.pf.map((row) => ['PF', row.name, row.uan, row.grossWages, row.epfWages, row.epfContribution, row.epsContribution]),
      ...report.esi.map((row) => ['ESI', row.name, row.ipNumber, row.wages, row.days, row.employee, row.employer]),
      ...report.pt.map((row) => ['PT', row.state, row.employees, row.amount]),
    ];
    return sendCsv(res, `statutory-${report.month}.csv`, ['Type', 'Employee / State', 'Identifier / Employees', 'Wages / Amount', 'PF Wages / Days', 'Employee / EPF', 'Employer / EPS'], rows);
  } catch (error) {
    return handle(async () => { throw error; })(req, res, next);
  }
};

export const fullFinal = handle(async () => ({ settlements: await listFullFinal() }));
export const fullFinalCsv = async (req: Request, res: Response, next: (error?: unknown) => void) => {
  try {
    const settlements = await listFullFinal();
    return sendCsv(res, 'full-final-settlements.csv', ['Employee', 'Last Working Day', 'Status', 'TDS', 'Advance Recovery', 'Net Settlement', 'Voucher', 'Payment Voucher'], settlements.map((item) => [
      item.party?.name,
      item.lastWorkingDay,
      item.status,
      item.tds,
      item.advanceRecovery,
      item.net,
      item.voucherNumber,
      item.paymentVoucherNumber,
    ]));
  } catch (error) {
    return handle(async () => { throw error; })(req, res, next);
  }
};
export const newFullFinal = handle((req) => createFullFinal(requestBody(req), actorFromRequest(req)), 201);
export const postFnf = handle(async (req) => postFullFinal(param(req), await ledgerAccess(req)));
export const payFnf = handle(async (req) => payFullFinal(param(req), requestBody(req), await ledgerAccess(req)));
