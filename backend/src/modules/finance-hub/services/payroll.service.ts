import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, FinHttpError, notFound } from '../http';
import { istToday } from '../utils/fy';
import { dateOnly, readBoolean, readDate, readMoney, readMultiline, readString } from '../utils/input';
import { roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { CASH_BANK_KINDS, LEDGER_STATUSES, type VoucherLineInput } from './ledgerRules';
import type { LedgerAccess } from './ledger.service';
import { resolvePartyForCandidate } from './parties.service';
import { computePayslip, daysEmployed, daysInMonth, type Earning } from './payrollRules';
import { postSystemVoucher, vline } from './systemVoucher';

// Payroll: salary profiles, monthly runs (payslips → accrual journal → salary payment),
// advances recovered through payroll, statutory summaries and full & final settlement.

const ZERO = new Prisma.Decimal(0);
const D = (value: number) => roundMoney(new Prisma.Decimal(value));
const num = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);
const round = (value: number) => Math.round(value * 100) / 100;

const readMonthKey = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw badRequest('Choose a month (YYYY-MM).');
  return value;
};

const readEarnings = (value: unknown): Earning[] => {
  if (!Array.isArray(value) || !value.length) throw badRequest('Add at least one earning (e.g. Basic).');
  return value.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0) throw badRequest(`Earning ${index + 1}: amount is invalid.`);
    const name = String(row.name ?? '').trim().slice(0, 60);
    if (!name) throw badRequest(`Earning ${index + 1}: name is required.`);
    return { code: String(row.code ?? name).trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 20), name, amount: round(amount), pfWage: row.pfWage === true };
  });
};

const systemIds = async (tx: Prisma.TransactionClient | typeof prisma = prisma) => new Map((await tx.finAccount.findMany({ where: { systemKey: { not: null } }, select: { id: true, systemKey: true } })).map((account) => [account.systemKey!, account.id]));
const need = (ids: Map<string, string>, key: string) => {
  const id = ids.get(key);
  if (!id) throw badRequest(`Ledger ${key} is missing. Run "Install default chart".`);
  return id;
};

/** Advances still to recover, per employee party, from the Employee Advances ledger. */
const advanceBalances = async (partyIds: string[], tx: Prisma.TransactionClient | typeof prisma = prisma) => {
  const account = await tx.finAccount.findUnique({ where: { systemKey: 'EMPLOYEE_ADVANCES' }, select: { id: true } });
  if (!account || !partyIds.length) return new Map<string, number>();
  const rows = await tx.finVoucherLine.groupBy({ by: ['partyId'], where: { accountId: account.id, partyId: { in: partyIds }, voucher: { status: { in: LEDGER_STATUSES } } }, _sum: { debit: true, credit: true } });
  return new Map(rows.map((row) => [row.partyId!, round(num(row._sum.debit) - num(row._sum.credit))]));
};

// ---------------------------------------------------------------------------
// Structures and salary profiles
// ---------------------------------------------------------------------------

export const listStructures = () => prisma.finSalaryStructure.findMany({ orderBy: { name: 'asc' } });

export const saveStructure = async (id: string | null, body: Record<string, unknown>, context: ActorContext) => {
  const name = readString(body, 'name', 'Name', { max: 80, required: true })!;
  const raw = Array.isArray(body.components) ? body.components : [];
  if (!raw.length) throw badRequest('Add at least one component.');
  const components = raw.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const calc = row.calc === 'PERCENT_OF_CTC' ? 'PERCENT_OF_CTC' : row.calc === 'BALANCE' ? 'BALANCE' : 'FIXED';
    const value = Number(row.value) || 0;
    if (value < 0 || (calc === 'PERCENT_OF_CTC' && value > 100)) throw badRequest(`Component ${index + 1}: check the value.`);
    return { name: String(row.name ?? '').trim().slice(0, 60) || `Component ${index + 1}`, calc, value, pfWage: row.pfWage === true };
  });
  if (components.filter((item) => item.calc === 'BALANCE').length > 1) throw badRequest('Only one component can take the balance.');
  const data = { name, components, isActive: readBoolean(body, 'isActive', true), notes: readMultiline(body, 'notes', 'Notes', 1000) };
  const saved = id ? await prisma.finSalaryStructure.update({ where: { id }, data }) : await prisma.finSalaryStructure.create({ data });
  await writeFinAudit({ ...context, entityType: 'FinSalaryStructure', entityId: saved.id, action: id ? 'UPDATE' : 'CREATE', after: { name } });
  return { id: saved.id };
};

export const listEmployees = async () => {
  const parties = await prisma.finParty.findMany({ where: { types: { has: 'EMPLOYEE' } }, select: { id: true, code: true, name: true, mobile: true, pan: true, bankName: true, bankAccountNumber: true, ifsc: true, isActive: true }, orderBy: { name: 'asc' } });
  const [salaries, balances] = await Promise.all([prisma.finEmployeeSalary.findMany({ where: { partyId: { in: parties.map((party) => party.id) } } }), advanceBalances(parties.map((party) => party.id))]);
  return parties.map((party) => {
    const salary = salaries.find((item) => item.partyId === party.id);
    const earnings = (salary?.earnings ?? []) as unknown as Earning[];
    return {
      party: { ...party, bankAccountNumber: party.bankAccountNumber ? `••••${party.bankAccountNumber.slice(-4)}` : null },
      salary: salary ? { ...salary, dateOfJoining: dateOnly(salary.dateOfJoining), dateOfLeaving: dateOnly(salary.dateOfLeaving), monthlyTds: num(salary.monthlyTds), earnings, gross: round(earnings.reduce((sum, item) => sum + item.amount, 0)) } : null,
      advanceBalance: balances.get(party.id) ?? 0,
    };
  });
};

export const saveSalary = async (partyId: string, body: Record<string, unknown>, context: ActorContext) => {
  const party = await prisma.finParty.findUnique({ where: { id: partyId }, select: { types: true } });
  if (!party?.types.includes('EMPLOYEE')) throw badRequest('Salary profiles are for parties of type Employee.');
  const ptState = readString(body, 'ptState', 'PT state', { max: 2 });
  if (ptState && !/^\d{2}$/.test(ptState)) throw badRequest('PT state is a 2-digit GST state code.');
  const uan = readString(body, 'uan', 'UAN', { max: 12 });
  if (uan && !/^\d{12}$/.test(uan)) throw badRequest('UAN has 12 digits.');
  const data = {
    employeeCode: readString(body, 'employeeCode', 'Employee code', { max: 30 }),
    designation: readString(body, 'designation', 'Designation', { max: 80 }),
    department: readString(body, 'department', 'Department', { max: 80 }),
    dateOfJoining: readDate(body, 'dateOfJoining', 'Date of joining'),
    structureId: readString(body, 'structureId', 'Structure', { max: 60 }),
    earnings: readEarnings(body.earnings),
    pfApplicable: readBoolean(body, 'pfApplicable', true),
    pfWageCap: readBoolean(body, 'pfWageCap', true),
    esiApplicable: readBoolean(body, 'esiApplicable', true),
    ptState,
    monthlyTds: readMoney(body, 'monthlyTds', 'Monthly TDS') ?? ZERO,
    uan,
    esiNumber: readString(body, 'esiNumber', 'ESI number', { max: 17 }),
    costCentreId: readString(body, 'costCentreId', 'Cost centre', { max: 60 }),
    isActive: readBoolean(body, 'isActive', true),
    notes: readMultiline(body, 'notes', 'Notes', 1000),
  };
  const before = await prisma.finEmployeeSalary.findUnique({ where: { partyId } });
  const saved = await prisma.finEmployeeSalary.upsert({ where: { partyId }, create: { partyId, ...data }, update: data });
  await writeFinAudit({ ...context, entityType: 'FinEmployeeSalary', entityId: saved.id, action: before ? 'UPDATE' : 'CREATE', before: before ? { earnings: before.earnings } : null, after: { earnings: data.earnings } });
  return { id: saved.id };
};

/** Creates / links an Employee party for every staff login (role EMPLOYEE). */
export const importStaff = async (context: ActorContext) => {
  const users = await prisma.user.findMany({ where: { role: 'EMPLOYEE' }, select: { id: true, name: true, mobile: true, email: true } });
  let linked = 0;
  for (const user of users) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.finPartyLink.findUnique({ where: { linkType_linkId: { linkType: 'USER', linkId: user.id } } });
      const partyId = await resolvePartyForCandidate(tx, { linkType: 'USER', linkId: user.id, type: 'EMPLOYEE', name: (user.name || user.email || user.mobile || 'Employee').slice(0, 160), mobile: user.mobile?.replace(/\D/g, '').slice(-10) || null, gstin: null, city: null, state: null });
      const party = await tx.finParty.findUnique({ where: { id: partyId }, select: { types: true } });
      if (party && !party.types.includes('EMPLOYEE')) await tx.finParty.update({ where: { id: partyId }, data: { types: [...party.types, 'EMPLOYEE'] } });
      if (!existing) linked += 1;
    });
  }
  await writeFinAudit({ ...context, entityType: 'FinEmployeeSalary', entityId: 'import', action: 'IMPORT_STAFF', after: { users: users.length, linked } });
  return { users: users.length, linked };
};

// ---------------------------------------------------------------------------
// Payroll runs
// ---------------------------------------------------------------------------

const serializePayslip = (slip: Prisma.FinPayslipGetPayload<object>) => ({
  ...slip,
  paidDays: num(slip.paidDays), additions: num(slip.additions), gross: num(slip.gross), pfWage: num(slip.pfWage), employeePf: num(slip.employeePf), employeeEsi: num(slip.employeeEsi),
  professionalTax: num(slip.professionalTax), tds: num(slip.tds), advanceRecovery: num(slip.advanceRecovery), net: num(slip.net), employerPf: num(slip.employerPf), employerEsi: num(slip.employerEsi),
});

const runTotals = (slips: Array<ReturnType<typeof serializePayslip>>) => {
  const sum = (key: 'gross' | 'employeePf' | 'employeeEsi' | 'professionalTax' | 'tds' | 'advanceRecovery' | 'net' | 'employerPf' | 'employerEsi') => round(slips.reduce((total, slip) => total + slip[key], 0));
  return { employees: slips.length, gross: sum('gross'), employeePf: sum('employeePf'), employeeEsi: sum('employeeEsi'), professionalTax: sum('professionalTax'), tds: sum('tds'), advanceRecovery: sum('advanceRecovery'), net: sum('net'), employerPf: sum('employerPf'), employerEsi: sum('employerEsi'), cost: round(sum('gross') + sum('employerPf') + sum('employerEsi')) };
};

const slipData = (month: string, salary: Prisma.FinEmployeeSalaryGetPayload<object>, overrides: { paidDays: number; additions: number; tds: number; advanceDue: number }) => {
  const result = computePayslip({ month, earnings: salary.earnings as unknown as Earning[], paidDays: overrides.paidDays, additions: overrides.additions, pfApplicable: salary.pfApplicable, pfWageCap: salary.pfWageCap, esiApplicable: salary.esiApplicable, ptState: salary.ptState, tds: overrides.tds, advanceDue: overrides.advanceDue });
  return {
    daysInMonth: result.daysInMonth, paidDays: new Prisma.Decimal(overrides.paidDays), earnings: result.earnings, additions: D(overrides.additions), gross: D(result.gross), pfWage: D(result.pfWage),
    employeePf: D(result.employeePf), employeeEsi: D(result.employeeEsi), professionalTax: D(result.professionalTax), tds: D(result.tds), advanceRecovery: D(result.advanceRecovery),
    net: D(result.net), employerPf: D(result.employerPf), employerEsi: D(result.employerEsi),
  };
};

/** Active advances' monthly recovery, capped at what is still outstanding. */
const advanceDue = async (partyIds: string[], tx: Prisma.TransactionClient | typeof prisma = prisma) => {
  const [advances, balances] = await Promise.all([tx.finEmployeeAdvance.findMany({ where: { partyId: { in: partyIds }, isActive: true } }), advanceBalances(partyIds, tx)]);
  return new Map(partyIds.map((id) => [id, Math.max(Math.min(round(advances.filter((item) => item.partyId === id).reduce((sum, item) => sum + num(item.monthlyRecovery), 0)), balances.get(id) ?? 0), 0)]));
};

export const listRuns = async () => {
  const runs = await prisma.finPayrollRun.findMany({ orderBy: [{ month: 'desc' }, { createdAt: 'desc' }], take: 36 });
  const vouchers = await prisma.finVoucher.findMany({ where: { id: { in: runs.flatMap((run) => [run.voucherId, run.paymentVoucherId].filter((id): id is string => Boolean(id))) } }, select: { id: true, number: true } });
  return runs.map((run) => ({ ...run, payDate: dateOnly(run.payDate), voucherNumber: vouchers.find((item) => item.id === run.voucherId)?.number ?? null, paymentVoucherNumber: vouchers.find((item) => item.id === run.paymentVoucherId)?.number ?? null }));
};

export const getRun = async (id: string) => {
  const run = await prisma.finPayrollRun.findUnique({ where: { id }, include: { payslips: true } });
  if (!run) throw notFound('Payroll run not found.');
  const parties = await prisma.finParty.findMany({ where: { id: { in: run.payslips.map((slip) => slip.partyId) } }, select: { id: true, code: true, name: true, pan: true, bankName: true, bankAccountNumber: true, ifsc: true } });
  const salaries = await prisma.finEmployeeSalary.findMany({ where: { partyId: { in: run.payslips.map((slip) => slip.partyId) } }, select: { partyId: true, employeeCode: true, designation: true, department: true, uan: true, esiNumber: true, dateOfJoining: true } });
  const slips = run.payslips.map(serializePayslip);
  return {
    ...run, payDate: dateOnly(run.payDate), totals: runTotals(slips),
    payslips: slips.map((slip) => ({ ...slip, party: parties.find((party) => party.id === slip.partyId) ?? null, profile: salaries.find((item) => item.partyId === slip.partyId) ?? null })).sort((a, b) => (a.party?.name ?? '').localeCompare(b.party?.name ?? '')),
  };
};

export const createRun = async (body: Record<string, unknown>, context: ActorContext) => {
  const month = readMonthKey(body.month);
  if (await prisma.finPayrollRun.findFirst({ where: { month, status: { not: 'CANCELLED' } } })) throw conflict(`A payroll run for ${month} already exists.`);
  const days = daysInMonth(month);
  const [year, value] = month.split('-').map(Number) as [number, number];
  const monthStart = new Date(Date.UTC(year, value - 1, 1));
  const monthEnd = new Date(Date.UTC(year, value, 0));
  const salaries = (await prisma.finEmployeeSalary.findMany({ where: { isActive: true } })).filter((salary) => (!salary.dateOfJoining || salary.dateOfJoining <= monthEnd) && (!salary.dateOfLeaving || salary.dateOfLeaving >= monthStart));
  if (!salaries.length) throw badRequest('No active salary profiles for that month.');
  const due = await advanceDue(salaries.map((salary) => salary.partyId));
  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.finPayrollRun.create({ data: { month, totals: {}, createdById: context.actorUserId, notes: readMultiline(body, 'notes', 'Notes', 1000) } });
    await tx.finPayslip.createMany({
      data: salaries.map((salary) => ({ runId: created.id, partyId: salary.partyId, ...slipData(month, salary, { paidDays: Math.min(daysEmployed(month, salary.dateOfJoining, salary.dateOfLeaving), days), additions: 0, tds: num(salary.monthlyTds), advanceDue: due.get(salary.partyId) ?? 0 }) })),
    });
    return created;
  });
  await writeFinAudit({ ...context, entityType: 'FinPayrollRun', entityId: run.id, action: 'CREATE', after: { month, employees: salaries.length } });
  return { id: run.id };
};

const lockRun = async (tx: Prisma.TransactionClient, id: string) => {
  await tx.$queryRaw`SELECT id FROM "FinPayrollRun" WHERE id = ${id} FOR UPDATE`;
  const run = await tx.finPayrollRun.findUnique({ where: { id }, include: { payslips: true } });
  if (!run) throw notFound('Payroll run not found.');
  return run;
};

export const updatePayslip = async (runId: string, slipId: string, body: Record<string, unknown>, context: ActorContext) =>
  prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, runId);
    if (run.status !== 'DRAFT') throw badRequest('Only a draft run can be changed.');
    const slip = run.payslips.find((item) => item.id === slipId);
    if (!slip) throw notFound('Payslip not found.');
    const salary = await tx.finEmployeeSalary.findUnique({ where: { partyId: slip.partyId } });
    if (!salary) throw badRequest('Salary profile not found.');
    const paidDays = Number(body.paidDays ?? num(slip.paidDays));
    if (!Number.isFinite(paidDays) || paidDays < 0 || paidDays > slip.daysInMonth) throw badRequest(`Paid days must be between 0 and ${slip.daysInMonth}.`);
    const additions = readMoney(body, 'additions', 'Additions') ?? slip.additions;
    const tds = readMoney(body, 'tds', 'TDS') ?? slip.tds;
    const due = (await advanceDue([slip.partyId], tx)).get(slip.partyId) ?? 0;
    const requested = body.advanceRecovery !== undefined && body.advanceRecovery !== null && body.advanceRecovery !== '' ? Math.min(Number(body.advanceRecovery) || 0, (await advanceBalances([slip.partyId], tx)).get(slip.partyId) ?? 0) : due;
    const data = slipData(run.month, salary, { paidDays, additions: num(additions), tds: num(tds), advanceDue: requested });
    await tx.finPayslip.update({ where: { id: slipId }, data: { ...data, notes: readMultiline(body, 'notes', 'Notes', 500) ?? slip.notes } });
    await writeFinAudit({ ...context, entityType: 'FinPayslip', entityId: slipId, action: 'UPDATE', before: { paidDays: num(slip.paidDays), net: num(slip.net) }, after: { paidDays, net: data.net.toNumber() } }, tx);
    return { id: slipId, net: data.net.toNumber() };
  });

/** Recalculates every payslip of a draft run from the current salary profiles. */
export const recomputeRun = async (id: string, context: ActorContext) =>
  prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    if (run.status !== 'DRAFT') throw badRequest('Only a draft run can be recalculated.');
    const salaries = await tx.finEmployeeSalary.findMany({ where: { partyId: { in: run.payslips.map((slip) => slip.partyId) } } });
    const due = await advanceDue(run.payslips.map((slip) => slip.partyId), tx);
    for (const slip of run.payslips) {
      const salary = salaries.find((item) => item.partyId === slip.partyId);
      if (!salary) continue;
      await tx.finPayslip.update({ where: { id: slip.id }, data: slipData(run.month, salary, { paidDays: num(slip.paidDays), additions: num(slip.additions), tds: num(salary.monthlyTds), advanceDue: due.get(slip.partyId) ?? 0 }) });
    }
    await writeFinAudit({ ...context, entityType: 'FinPayrollRun', entityId: id, action: 'RECOMPUTE' }, tx);
    return { id };
  }, { timeout: 30000 });

export const cancelRun = async (id: string, context: ActorContext) => {
  const run = await prisma.finPayrollRun.findUnique({ where: { id } });
  if (!run) throw notFound('Payroll run not found.');
  if (run.status !== 'DRAFT') throw badRequest('Only a draft run can be cancelled. A posted run is corrected in the next month.');
  await prisma.finPayrollRun.update({ where: { id }, data: { status: 'CANCELLED' } });
  await writeFinAudit({ ...context, entityType: 'FinPayrollRun', entityId: id, action: 'CANCEL' });
  return { id, status: 'CANCELLED' };
};

/**
 * Approval posts the accrual: Dr salaries + employer PF/ESI; Cr net pay per employee (Salary
 * Payable), PF / ESI / PT payable, TDS payable (192) and recovered advances. Maker-checker.
 */
export const approveRun = async (id: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    if (run.status !== 'DRAFT') throw badRequest('Only a draft run can be approved.');
    if (run.createdById && run.createdById === access.actor.actorUserId && !access.isSuperAdmin) throw new FinHttpError(403, 'Maker-checker: someone else must approve the payroll you prepared.');
    const slips = run.payslips.map(serializePayslip).filter((slip) => slip.gross > 0);
    if (!slips.length) throw badRequest('Nothing to post: every payslip is zero.');
    if (slips.length > 150) throw badRequest('More than 150 employees in one run is not supported yet.');
    const ids = await systemIds(tx);
    const totals = runTotals(slips);
    const [year, value] = run.month.split('-').map(Number) as [number, number];
    const monthEnd = new Date(Date.UTC(year, value, 0));
    const today = istToday();
    const date = monthEnd > today ? today : monthEnd;
    const lines: VoucherLineInput[] = [
      vline(need(ids, 'SALARY_EXPENSE'), D(totals.gross), ZERO, { narration: `Salaries ${run.month}` }),
      ...(totals.employerPf ? [vline(need(ids, 'EMPLOYER_PF'), D(totals.employerPf), ZERO)] : []),
      ...(totals.employerEsi ? [vline(need(ids, 'EMPLOYER_ESI'), D(totals.employerEsi), ZERO)] : []),
      ...slips.filter((slip) => slip.net > 0).map((slip) => vline(need(ids, 'SALARY_PAYABLE'), ZERO, D(slip.net), { partyId: slip.partyId, narration: `Net pay ${run.month}` })),
      ...(totals.employeePf + totals.employerPf ? [vline(need(ids, 'PF_PAYABLE'), ZERO, D(totals.employeePf + totals.employerPf), { narration: `PF ${run.month}` })] : []),
      ...(totals.employeeEsi + totals.employerEsi ? [vline(need(ids, 'ESI_PAYABLE'), ZERO, D(totals.employeeEsi + totals.employerEsi), { narration: `ESI ${run.month}` })] : []),
      ...(totals.professionalTax ? [vline(need(ids, 'PT_PAYABLE'), ZERO, D(totals.professionalTax), { narration: `Professional tax ${run.month}` })] : []),
      ...slips.filter((slip) => slip.tds > 0).map((slip) => vline(need(ids, 'TDS_PAYABLE'), ZERO, D(slip.tds), { partyId: slip.partyId, narration: `TDS 192 salary ${run.month}` })),
      ...slips.filter((slip) => slip.advanceRecovery > 0).map((slip) => vline(need(ids, 'EMPLOYEE_ADVANCES'), ZERO, D(slip.advanceRecovery), { partyId: slip.partyId, narration: `Advance recovered ${run.month}` })),
    ];
    const voucher = await postSystemVoucher(tx, { type: 'JOURNAL', date, narration: `Payroll for ${run.month} (${slips.length} employees)`, lines, sourceType: 'PAYROLL', sourceId: run.id, sourceEvent: 'ACCRUAL', idempotencyKey: `payroll:${run.id}:accrual` }, access);
    await tx.finPayrollRun.update({ where: { id }, data: { status: 'POSTED', voucherId: voucher.id, totals, approvedById: access.actor.actorUserId, postedAt: new Date() } });
    await writeFinAudit({ ...access.actor, entityType: 'FinPayrollRun', entityId: id, action: 'APPROVE_POST', after: { number: voucher.number, totals } }, tx);
    return { id, status: 'POSTED', number: voucher.number };
  }, { timeout: 60000 });

/** Pays net salaries from one bank account (Dr Salary Payable per employee, Cr bank). */
export const payRun = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const bankAccountId = readString(body, 'bankAccountId', 'Paid from', { max: 60, required: true })!;
  const date = readDate(body, 'date', 'Payment date') ?? istToday();
  const reference = readString(body, 'reference', 'Reference', { max: 80 });
  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    if (run.status !== 'POSTED') throw badRequest('Approve and post the payroll first.');
    const bank = await tx.finAccount.findUnique({ where: { id: bankAccountId }, select: { kind: true, isActive: true } });
    if (!bank?.isActive || !CASH_BANK_KINDS.includes(bank.kind)) throw badRequest('Choose a bank or cash account.');
    const ids = await systemIds(tx);
    const slips = run.payslips.map(serializePayslip).filter((slip) => slip.net > 0);
    const total = round(slips.reduce((sum, slip) => sum + slip.net, 0));
    const lines = [...slips.map((slip) => vline(need(ids, 'SALARY_PAYABLE'), D(slip.net), ZERO, { partyId: slip.partyId })), vline(bankAccountId, ZERO, D(total))];
    const voucher = await postSystemVoucher(tx, { type: 'PAYMENT', date, narration: `Salaries paid for ${run.month}`, reference, paymentMethod: 'BANK_TRANSFER', lines, sourceType: 'PAYROLL', sourceId: run.id, sourceEvent: 'PAYMENT', idempotencyKey: `payroll:${run.id}:payment` }, access);
    await tx.finPayrollRun.update({ where: { id }, data: { status: 'PAID', paymentVoucherId: voucher.id, payDate: date, paidAt: new Date() } });
    await writeFinAudit({ ...access.actor, entityType: 'FinPayrollRun', entityId: id, action: 'PAY', after: { number: voucher.number, total } }, tx);
    return { id, status: 'PAID', number: voucher.number };
  }, { timeout: 60000 });
};

// ---------------------------------------------------------------------------
// Advances
// ---------------------------------------------------------------------------

export const listAdvances = async () => {
  const advances = await prisma.finEmployeeAdvance.findMany({ orderBy: [{ isActive: 'desc' }, { date: 'desc' }], take: 500 });
  const [parties, balances, vouchers] = await Promise.all([
    prisma.finParty.findMany({ where: { id: { in: advances.map((item) => item.partyId) } }, select: { id: true, code: true, name: true } }),
    advanceBalances(Array.from(new Set(advances.map((item) => item.partyId)))),
    prisma.finVoucher.findMany({ where: { id: { in: advances.map((item) => item.voucherId) } }, select: { id: true, number: true } }),
  ]);
  return advances.map((item) => ({ ...item, date: dateOnly(item.date), amount: num(item.amount), monthlyRecovery: num(item.monthlyRecovery), party: parties.find((party) => party.id === item.partyId) ?? null, employeeBalance: balances.get(item.partyId) ?? 0, voucherNumber: vouchers.find((voucher) => voucher.id === item.voucherId)?.number ?? null }));
};

export const giveAdvance = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const partyId = readString(body, 'partyId', 'Employee', { max: 60, required: true })!;
  const party = await prisma.finParty.findUnique({ where: { id: partyId }, select: { name: true, types: true } });
  if (!party?.types.includes('EMPLOYEE')) throw badRequest('Choose an employee.');
  const amount = readMoney(body, 'amount', 'Amount') ?? ZERO;
  const monthlyRecovery = readMoney(body, 'monthlyRecovery', 'Monthly recovery') ?? ZERO;
  if (!amount.greaterThan(0)) throw badRequest('Amount must be more than zero.');
  if (!monthlyRecovery.greaterThan(0) || monthlyRecovery.greaterThan(amount)) throw badRequest('Monthly recovery must be between zero and the amount.');
  const bankAccountId = readString(body, 'bankAccountId', 'Paid from', { max: 60, required: true })!;
  const bank = await prisma.finAccount.findUnique({ where: { id: bankAccountId }, select: { kind: true, isActive: true } });
  if (!bank?.isActive || !CASH_BANK_KINDS.includes(bank.kind)) throw badRequest('Choose a bank or cash account.');
  const date = readDate(body, 'date', 'Date', true)!;
  return prisma.$transaction(async (tx) => {
    const ids = await systemIds(tx);
    const voucher = await postSystemVoucher(tx, {
      type: 'PAYMENT', date, narration: `Salary advance to ${party.name}`, partyId,
      lines: [vline(need(ids, 'EMPLOYEE_ADVANCES'), amount, ZERO, { partyId }), vline(bankAccountId, ZERO, amount)],
      sourceType: 'EMPLOYEE_ADVANCE', sourceId: partyId, sourceEvent: 'PAY',
    }, access);
    const advance = await tx.finEmployeeAdvance.create({ data: { partyId, date, amount, monthlyRecovery, voucherId: voucher.id, notes: readMultiline(body, 'notes', 'Notes', 1000), createdById: access.actor.actorUserId } });
    await writeFinAudit({ ...access.actor, entityType: 'FinEmployeeAdvance', entityId: advance.id, action: 'CREATE', after: { amount: amount.toNumber(), number: voucher.number } }, tx);
    return { id: advance.id, number: voucher.number };
  }, { timeout: 30000 });
};

export const closeAdvance = async (id: string, context: ActorContext) => {
  const advance = await prisma.finEmployeeAdvance.findUnique({ where: { id } });
  if (!advance) throw notFound('Advance not found.');
  await prisma.finEmployeeAdvance.update({ where: { id }, data: { isActive: false } });
  await writeFinAudit({ ...context, entityType: 'FinEmployeeAdvance', entityId: id, action: 'CLOSE' });
  return { id };
};

// ---------------------------------------------------------------------------
// Statutory
// ---------------------------------------------------------------------------

/** PF (ECR columns), ESI and PT for a posted month. */
export const getStatutory = async (query: Record<string, unknown>) => {
  const month = readMonthKey(query.month ?? istToday().toISOString().slice(0, 7));
  const run = await prisma.finPayrollRun.findFirst({ where: { month, status: { in: ['POSTED', 'PAID'] } }, include: { payslips: true } });
  if (!run) return { month, run: null, pf: [], esi: [], pt: [], totals: null };
  const parties = await prisma.finParty.findMany({ where: { id: { in: run.payslips.map((slip) => slip.partyId) } }, select: { id: true, name: true } });
  const salaries = await prisma.finEmployeeSalary.findMany({ where: { partyId: { in: run.payslips.map((slip) => slip.partyId) } }, select: { partyId: true, uan: true, esiNumber: true, ptState: true } });
  const slips = run.payslips.map(serializePayslip);
  const info = (partyId: string) => ({ name: parties.find((party) => party.id === partyId)?.name ?? '', ...salaries.find((item) => item.partyId === partyId) });
  const pf = slips.filter((slip) => slip.pfWage > 0).map((slip) => {
    const epsWage = Math.min(slip.pfWage, 15000);
    const eps = Math.round(epsWage * 0.0833);
    return { partyId: slip.partyId, uan: info(slip.partyId).uan ?? null, name: info(slip.partyId).name, grossWages: slip.gross, epfWages: slip.pfWage, epsWages: epsWage, edliWages: epsWage, epfContribution: slip.employeePf, epsContribution: eps, epfEpsDifference: Math.round(slip.pfWage * 0.12) - eps, ncpDays: round(slip.daysInMonth - slip.paidDays) };
  });
  const esi = slips.filter((slip) => slip.employeeEsi > 0).map((slip) => ({ partyId: slip.partyId, ipNumber: info(slip.partyId).esiNumber ?? null, name: info(slip.partyId).name, days: slip.paidDays, wages: slip.gross, employee: slip.employeeEsi, employer: slip.employerEsi }));
  const ptByState = new Map<string, { state: string; employees: number; amount: number }>();
  for (const slip of slips.filter((item) => item.professionalTax > 0)) {
    const state = info(slip.partyId).ptState ?? '—';
    const entry = ptByState.get(state) ?? { state, employees: 0, amount: 0 };
    entry.employees += 1;
    entry.amount = round(entry.amount + slip.professionalTax);
    ptByState.set(state, entry);
  }
  const totals = runTotals(slips);
  return { month, run: { id: run.id, status: run.status }, pf, esi, pt: Array.from(ptByState.values()), totals: { pf: round(totals.employeePf + totals.employerPf), esi: round(totals.employeeEsi + totals.employerEsi), pt: totals.professionalTax, tds: totals.tds } };
};

// ---------------------------------------------------------------------------
// Full & final settlement
// ---------------------------------------------------------------------------

const FNF_LEDGER: Record<string, string> = { SALARY: 'SALARY_EXPENSE', BONUS: 'SALARY_EXPENSE', OTHER_EARNING: 'SALARY_EXPENSE', LEAVE_ENCASHMENT: 'GRATUITY_EXPENSE', GRATUITY: 'GRATUITY_EXPENSE', NOTICE_RECOVERY: 'NOTICE_PAY_RECOVERY', OTHER_RECOVERY: 'NOTICE_PAY_RECOVERY' };

const readFnfItems = (value: unknown) => {
  if (!Array.isArray(value) || !value.length) throw badRequest('Add the settlement items.');
  return value.map((item, index) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const code = String(row.code ?? '');
    if (!FNF_LEDGER[code]) throw badRequest(`Item ${index + 1}: unknown type.`);
    const recovery = code.endsWith('RECOVERY');
    const amount = Math.abs(Number(row.amount) || 0);
    return { code, label: String(row.label ?? code).slice(0, 80), amount: round(recovery ? -amount : amount) };
  }).filter((item) => item.amount !== 0);
};

export const listFullFinal = async () => {
  const items = await prisma.finFullFinal.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  const parties = await prisma.finParty.findMany({ where: { id: { in: items.map((item) => item.partyId) } }, select: { id: true, code: true, name: true } });
  const vouchers = await prisma.finVoucher.findMany({ where: { id: { in: items.flatMap((item) => [item.voucherId, item.paymentVoucherId].filter((id): id is string => Boolean(id))) } }, select: { id: true, number: true } });
  return items.map((item) => ({ ...item, lastWorkingDay: dateOnly(item.lastWorkingDay), tds: num(item.tds), advanceRecovery: num(item.advanceRecovery), net: num(item.net), party: parties.find((party) => party.id === item.partyId) ?? null, voucherNumber: vouchers.find((voucher) => voucher.id === item.voucherId)?.number ?? null, paymentVoucherNumber: vouchers.find((voucher) => voucher.id === item.paymentVoucherId)?.number ?? null }));
};

export const createFullFinal = async (body: Record<string, unknown>, context: ActorContext) => {
  const partyId = readString(body, 'partyId', 'Employee', { max: 60, required: true })!;
  const salary = await prisma.finEmployeeSalary.findUnique({ where: { partyId } });
  if (!salary) throw badRequest('That employee has no salary profile.');
  if (await prisma.finFullFinal.findFirst({ where: { partyId, status: { in: ['DRAFT', 'POSTED'] } } })) throw conflict('A settlement for this employee is already open.');
  const items = readFnfItems(body.items);
  const tds = readMoney(body, 'tds', 'TDS') ?? ZERO;
  const gross = round(items.reduce((sum, item) => sum + item.amount, 0));
  const advance = Math.max(Math.min((await advanceBalances([partyId])).get(partyId) ?? 0, gross - tds.toNumber()), 0);
  const net = round(gross - tds.toNumber() - advance);
  if (net < 0) throw badRequest('Recoveries exceed the dues; collect the balance from the employee separately.');
  const record = await prisma.finFullFinal.create({ data: { partyId, lastWorkingDay: readDate(body, 'lastWorkingDay', 'Last working day', true)!, items, tds, advanceRecovery: D(advance), net: D(net), notes: readMultiline(body, 'notes', 'Notes', 1000), createdById: context.actorUserId } });
  await writeFinAudit({ ...context, entityType: 'FinFullFinal', entityId: record.id, action: 'CREATE', after: { net } });
  return { id: record.id, net, advanceRecovery: advance };
};

/** Posts the settlement journal and closes the salary profile (maker-checker). */
export const postFullFinal = async (id: string, access: LedgerAccess) =>
  prisma.$transaction(async (tx) => {
    const record = await tx.finFullFinal.findUnique({ where: { id } });
    if (!record) throw notFound('Settlement not found.');
    if (record.status !== 'DRAFT') throw badRequest('Already posted.');
    if (record.createdById && record.createdById === access.actor.actorUserId && !access.isSuperAdmin) throw new FinHttpError(403, 'Maker-checker: someone else must approve the settlement you prepared.');
    const ids = await systemIds(tx);
    const items = record.items as Array<{ code: string; label: string; amount: number }>;
    const lines: VoucherLineInput[] = [
      ...items.filter((item) => item.amount > 0).map((item) => vline(need(ids, FNF_LEDGER[item.code]!), D(item.amount), ZERO, { narration: item.label })),
      ...items.filter((item) => item.amount < 0).map((item) => vline(need(ids, FNF_LEDGER[item.code]!), ZERO, D(-item.amount), { partyId: record.partyId, narration: item.label })),
      ...(record.net.greaterThan(0) ? [vline(need(ids, 'SALARY_PAYABLE'), ZERO, record.net, { partyId: record.partyId, narration: 'Full & final settlement' })] : []),
      ...(record.tds.greaterThan(0) ? [vline(need(ids, 'TDS_PAYABLE'), ZERO, record.tds, { partyId: record.partyId, narration: 'TDS 192 full & final' })] : []),
      ...(record.advanceRecovery.greaterThan(0) ? [vline(need(ids, 'EMPLOYEE_ADVANCES'), ZERO, record.advanceRecovery, { partyId: record.partyId, narration: 'Advance recovered in F&F' })] : []),
    ];
    const party = await tx.finParty.findUnique({ where: { id: record.partyId }, select: { name: true } });
    const voucher = await postSystemVoucher(tx, { type: 'JOURNAL', date: record.lastWorkingDay > istToday() ? istToday() : record.lastWorkingDay, narration: `Full & final settlement of ${party?.name ?? 'employee'}`, partyId: record.partyId, lines, sourceType: 'FULL_FINAL', sourceId: record.id, sourceEvent: 'POST', idempotencyKey: `fnf:${record.id}:post` }, access);
    await tx.finFullFinal.update({ where: { id }, data: { status: 'POSTED', voucherId: voucher.id } });
    await tx.finEmployeeSalary.update({ where: { partyId: record.partyId }, data: { isActive: false, dateOfLeaving: record.lastWorkingDay } });
    await tx.finEmployeeAdvance.updateMany({ where: { partyId: record.partyId, isActive: true }, data: { isActive: false } });
    await writeFinAudit({ ...access.actor, entityType: 'FinFullFinal', entityId: id, action: 'POST', after: { number: voucher.number } }, tx);
    return { id, status: 'POSTED', number: voucher.number };
  }, { timeout: 30000 });

export const payFullFinal = async (id: string, body: Record<string, unknown>, access: LedgerAccess) => {
  const bankAccountId = readString(body, 'bankAccountId', 'Paid from', { max: 60, required: true })!;
  const date = readDate(body, 'date', 'Payment date') ?? istToday();
  return prisma.$transaction(async (tx) => {
    const record = await tx.finFullFinal.findUnique({ where: { id } });
    if (!record || record.status !== 'POSTED') throw badRequest('Post the settlement first.');
    if (!record.net.greaterThan(0)) throw badRequest('Nothing to pay.');
    const bank = await tx.finAccount.findUnique({ where: { id: bankAccountId }, select: { kind: true, isActive: true } });
    if (!bank?.isActive || !CASH_BANK_KINDS.includes(bank.kind)) throw badRequest('Choose a bank or cash account.');
    const ids = await systemIds(tx);
    const voucher = await postSystemVoucher(tx, { type: 'PAYMENT', date, narration: 'Full & final settlement paid', partyId: record.partyId, lines: [vline(need(ids, 'SALARY_PAYABLE'), record.net, ZERO, { partyId: record.partyId }), vline(bankAccountId, ZERO, record.net)], sourceType: 'FULL_FINAL', sourceId: record.id, sourceEvent: 'PAY', idempotencyKey: `fnf:${record.id}:pay` }, access);
    await tx.finFullFinal.update({ where: { id }, data: { status: 'PAID', paymentVoucherId: voucher.id } });
    await writeFinAudit({ ...access.actor, entityType: 'FinFullFinal', entityId: id, action: 'PAY', after: { number: voucher.number } }, tx);
    return { id, status: 'PAID', number: voucher.number };
  }, { timeout: 30000 });
};
