import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { assertEmployeeAccess, getActiveScopes, hasAllIndiaAccess } from '../access';
import { writeHrmAudit } from '../audit';
import { assertNotOwnRecord } from '../employeeGuards';
import { HrmAuthorizationError, HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { parseHrmInput, schemas } from '../validation';
import { describeShiftProblem, shiftLengthMinutes } from '../shiftRules';
import { istToday } from '../istDate';

export { describeShiftProblem, shiftLengthMinutes };

type Actor = { userId: string; role: string; ipAddress?: string | null };
type Tx = Prisma.TransactionClient;

/**
 * Shifts and holidays: the attendance foundation. A shift says when work starts / ends and how a day is judged; an
 * employee's shift assignment (effective-dated, never deleted) says which shift and weekly offs apply from a date;
 * holidays are for all of India or for one state. Attendance (a later phase) reads these.
 */

const DAY = 86_400_000;
const dayFrom = (value: string) => new Date(`${value}T00:00:00.000Z`);

const audit = (actor: Actor, entityId: string, action: string, after: unknown, tx?: Tx) => writeHrmAudit({
  actorUserId: actor.userId, entityType: 'HRM_ATTENDANCE', entityId, action, after,
  ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
}, tx);

export const listShifts = async (includeInactive: boolean) => {
  const shifts = await prisma.hrmShift.findMany({ where: includeInactive ? {} : { isActive: true }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  // People on the shift now: working, joining or on leave (not people who left).
  const usage = await prisma.hrmShiftAssignment.groupBy({ by: ['shiftId'], where: { status: 'ACTIVE', effectiveTo: null, employee: { archivedAt: null, status: { notIn: ['EXITED', 'TERMINATED'] } } }, _count: { _all: true } });
  const inUse = new Map(usage.map((row) => [row.shiftId, (row._count as { _all?: number } | undefined)?._all ?? 0]));
  return shifts.map((shift) => ({ ...shift, employeesNow: inUse.get(shift.id) ?? 0, lengthMinutes: shiftLengthMinutes(shift.startTime, shift.endTime, shift.isNightShift) }));
};

export const createShift = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.createShift, rawInput);
  const problem = describeShiftProblem(input);
  if (problem) throw new HrmHttpError(400, 'SHIFT_INVALID', problem);
  const existing = await prisma.hrmShift.findUnique({ where: { code: input.code }, select: { id: true } });
  if (existing) throw new HrmConflictError(`A shift with code ${input.code} already exists.`);
  const shift = await prisma.hrmShift.create({
    data: {
      code: input.code, name: input.name, startTime: input.startTime, endTime: input.endTime,
      breakMinutes: input.breakMinutes ?? 0, graceMinutes: input.graceMinutes ?? 0,
      halfDayMinutes: input.halfDayMinutes ?? null, fullDayMinutes: input.fullDayMinutes ?? null,
      isNightShift: input.isNightShift ?? false, isActive: input.isActive ?? true, createdById: actor.userId,
    },
  });
  await audit(actor, shift.id, 'SHIFT_CREATED', shift);
  return shift;
};

export const updateShift = async (actor: Actor, shiftId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.updateShift, rawInput);
  const before = await prisma.hrmShift.findUnique({ where: { id: shiftId } });
  if (!before) throw new HrmNotFoundError('Shift not found.');
  const next = { ...before, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) } as typeof before;
  const problem = describeShiftProblem(next);
  if (problem) throw new HrmHttpError(400, 'SHIFT_INVALID', problem);
  if (input.code && input.code !== before.code) {
    const clash = await prisma.hrmShift.findUnique({ where: { code: input.code }, select: { id: true } });
    if (clash) throw new HrmConflictError(`A shift with code ${input.code} already exists.`);
  }
  if (input.isActive === false && before.isActive) {
    const using = await prisma.hrmShiftAssignment.count({ where: { shiftId, status: 'ACTIVE', effectiveTo: null, employee: { archivedAt: null, status: { notIn: ['EXITED', 'TERMINATED'] } } } });
    if (using) throw new HrmConflictError(`${using} employee(s) are on this shift. Move them to another shift before switching it off.`);
  }
  const shift = await prisma.hrmShift.update({
    where: { id: shiftId },
    data: Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Prisma.HrmShiftUpdateInput,
  });
  await audit(actor, shiftId, 'SHIFT_UPDATED', shift);
  return shift;
};

/** Only a shift nobody was ever on can be deleted; otherwise it is switched off (history keeps reading right). */
export const deleteShift = async (actor: Actor, shiftId: string) => {
  const shift = await prisma.hrmShift.findUnique({ where: { id: shiftId }, select: { id: true, name: true } });
  if (!shift) throw new HrmNotFoundError('Shift not found.');
  const used = await prisma.hrmShiftAssignment.count({ where: { shiftId } });
  if (used) throw new HrmConflictError(`“${shift.name}” has been used, so it cannot be deleted. Switch it off instead.`);
  await prisma.hrmShift.delete({ where: { id: shiftId } });
  await audit(actor, shiftId, 'SHIFT_DELETED', { name: shift.name });
  return { deleted: true };
};

// ---- an employee's shift (effective-dated) ----

export const listEmployeeShifts = async (actor: Actor, employeeId: string) => {
  await assertEmployeeAccess({ ...actor, employeeId });
  const rows = await prisma.hrmShiftAssignment.findMany({
    where: { employeeId },
    include: { shift: { select: { id: true, code: true, name: true, startTime: true, endTime: true, isNightShift: true, isActive: true } } },
    orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
  });
  const today = istToday();
  const current = rows.find((row) => row.status === 'ACTIVE' && row.effectiveFrom <= today && (!row.effectiveTo || row.effectiveTo >= today))
    ?? rows.find((row) => row.status === 'ACTIVE' && row.effectiveFrom > today) ?? null;
  return { currentId: current?.id ?? null, assignments: rows };
};

/**
 * Puts an employee on a shift from a date. The shift in force ends the day before (or is cancelled when it would only
 * start on / after that date). One shift at a time, history kept.
 */
export const assignShift = async (actor: Actor, employeeId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.assignShift, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  await assertNotOwnRecord(actor, employeeId, 'Changing a shift');
  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, status: true, archivedAt: true } });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');
  if (employee.status === 'EXITED' || employee.status === 'TERMINATED') throw new HrmConflictError('This person has left the company.');
  const shift = await prisma.hrmShift.findUnique({ where: { id: input.shiftId }, select: { id: true, isActive: true, name: true } });
  if (!shift || !shift.isActive) throw new HrmHttpError(400, 'SHIFT_NOT_FOUND', 'The selected shift was not found or is switched off.');
  const days = [...new Set(input.weeklyOffs.days)];
  if (days.length >= 7) throw new HrmHttpError(400, 'WEEKLY_OFF_INVALID', 'At least one working day is needed.');
  const saturdays = [...new Set(input.weeklyOffs.saturdays ?? [])].sort();
  if (days.includes('SAT') && saturdays.length) throw new HrmHttpError(400, 'WEEKLY_OFF_INVALID', 'Every Saturday is already off; do not also pick Saturdays of the month.');
  const from = dayFrom(input.effectiveFrom);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-shift:${employeeId}`}))`;
    const open = await tx.hrmShiftAssignment.findMany({
      where: { employeeId, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }] },
      select: { id: true, effectiveFrom: true },
    });
    for (const row of open) {
      await tx.hrmShiftAssignment.update({
        where: { id: row.id },
        data: row.effectiveFrom.getTime() >= from.getTime() ? { status: 'CANCELLED' } : { effectiveTo: new Date(from.getTime() - DAY) },
      });
    }
    const created = await tx.hrmShiftAssignment.create({
      data: { employeeId, shiftId: shift.id, weeklyOffs: { days, saturdays }, effectiveFrom: from, status: 'ACTIVE', reason: input.reason ?? null, createdById: actor.userId },
      include: { shift: { select: { id: true, code: true, name: true, startTime: true, endTime: true, isNightShift: true, isActive: true } } },
    });
    await audit(actor, created.id, 'SHIFT_ASSIGNED', { employeeId, shift: shift.name, effectiveFrom: input.effectiveFrom, weeklyOffs: { days, saturdays } }, tx);
    return created;
  });
};

// ---- holidays ----

/** States whose holidays the caller manages: every state with all-India access, otherwise their own STATE scopes. */
const holidayReach = async (actor: Actor) => {
  if (await hasAllIndiaAccess(actor)) return { allIndia: true, stateIds: [] as number[] };
  const scopes = await getActiveScopes(actor.userId);
  return { allIndia: false, stateIds: [...new Set(scopes.flatMap((scope) => (scope.scopeType === 'STATE' && scope.stateId ? [scope.stateId] : [])))] };
};

/** All-India holidays are head office's; a state's holidays are also that state's HR. */
const assertHolidayPlace = async (actor: Actor, place: { scope: string; stateId: number | null }) => {
  const reach = await holidayReach(actor);
  if (reach.allIndia) return;
  if (place.scope === 'STATE' && place.stateId && reach.stateIds.includes(place.stateId)) return;
  throw new HrmAuthorizationError(place.scope === 'STATE'
    ? 'You can only manage the holidays of your own state.'
    : 'All-India holidays are managed by head office (all-India HRM access).');
};

export const listHolidays = async (rawQuery: unknown, actor?: Actor) => {
  const query = parseHrmInput(schemas.holidayQuery, rawQuery);
  const year = query.year ?? new Date().getUTCFullYear();
  const rows = await prisma.hrmHoliday.findMany({
    where: {
      date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
      ...(query.stateId ? { OR: [{ scope: 'ALL_INDIA' }, { scope: 'STATE', stateId: query.stateId }] } : {}),
    },
    orderBy: [{ date: 'asc' }, { name: 'asc' }],
  });
  const stateIds = [...new Set(rows.map((row) => row.stateId).filter((value): value is number => value !== null))];
  const states = stateIds.length ? await prisma.state.findMany({ where: { id: { in: stateIds } }, select: { id: true, name: true } }) : [];
  const stateName = new Map(states.map((state) => [state.id, state.name]));
  return {
    year,
    holidays: rows.map((row) => ({ ...row, stateName: row.stateId ? stateName.get(row.stateId) ?? null : null })),
    ...(actor ? { abilities: await holidayReach(actor) } : {}),
  };
};

const checkHoliday = async (input: { date: string; name: string; scope: 'ALL_INDIA' | 'STATE'; stateId?: number | null | undefined }, exceptId?: string, db: Tx | typeof prisma = prisma) => {
  if (input.scope === 'STATE') {
    if (!input.stateId) throw new HrmHttpError(400, 'STATE_REQUIRED', 'Select the state for a state holiday.');
    const state = await db.state.findFirst({ where: { id: input.stateId, country: { iso2: 'IN' } }, select: { id: true } });
    if (!state) throw new HrmHttpError(400, 'STATE_NOT_FOUND', 'The selected state was not found.');
  }
  const stateId = input.scope === 'STATE' ? input.stateId! : null;
  const clash = await db.hrmHoliday.findFirst({
    where: { date: dayFrom(input.date), scope: input.scope, stateId, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { name: true },
  });
  if (clash) throw new HrmConflictError(`“${clash.name}” is already a holiday on that date for the same place.`);
  return stateId;
};

export const createHoliday = async (actor: Actor, rawInput: unknown) => {
  const input = parseHrmInput(schemas.holiday, rawInput);
  await assertHolidayPlace(actor, { scope: input.scope, stateId: input.scope === 'STATE' ? input.stateId ?? null : null });
  const holiday = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-holiday'}))`;
    const stateId = await checkHoliday(input, undefined, tx);
    return tx.hrmHoliday.create({
      data: { date: dayFrom(input.date), name: input.name, scope: input.scope, stateId, isOptional: input.isOptional ?? false, createdById: actor.userId },
    });
  });
  await audit(actor, holiday.id, 'HOLIDAY_CREATED', holiday);
  return holiday;
};

export const updateHoliday = async (actor: Actor, holidayId: string, rawInput: unknown) => {
  const input = parseHrmInput(schemas.holiday, rawInput);
  const before = await prisma.hrmHoliday.findUnique({ where: { id: holidayId } });
  if (!before) throw new HrmNotFoundError('Holiday not found.');
  // Both where it was and where it goes must be the caller's.
  await assertHolidayPlace(actor, { scope: before.scope, stateId: before.stateId });
  await assertHolidayPlace(actor, { scope: input.scope, stateId: input.scope === 'STATE' ? input.stateId ?? null : null });
  const holiday = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-holiday'}))`;
    const stateId = await checkHoliday(input, holidayId, tx);
    return tx.hrmHoliday.update({
      where: { id: holidayId },
      data: { date: dayFrom(input.date), name: input.name, scope: input.scope, stateId, isOptional: input.isOptional ?? false },
    });
  });
  await audit(actor, holidayId, 'HOLIDAY_UPDATED', holiday);
  return holiday;
};

export const deleteHoliday = async (actor: Actor, holidayId: string) => {
  const holiday = await prisma.hrmHoliday.findUnique({ where: { id: holidayId } });
  if (!holiday) throw new HrmNotFoundError('Holiday not found.');
  await assertHolidayPlace(actor, { scope: holiday.scope, stateId: holiday.stateId });
  await prisma.hrmHoliday.delete({ where: { id: holidayId } });
  await audit(actor, holidayId, 'HOLIDAY_DELETED', { name: holiday.name, date: holiday.date });
  return { deleted: true };
};
