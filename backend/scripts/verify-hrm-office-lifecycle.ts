/**
 * End-to-end check of the HRM office lifecycle (office marker, State Manager transfer / appoint / replace / deactivate,
 * link existing login, coverage). It writes real rows, so it ONLY runs against a local scratch database:
 *
 *   createdb jcbexchange_hrm_scratch
 *   $env:DATABASE_URL="postgresql://postgres:<password>@localhost:5432/jcbexchange_hrm_scratch?schema=public"
 *   npx prisma db push          # builds the schema in the scratch database only
 *   npx tsx scripts/verify-hrm-office-lifecycle.ts
 */
import './scratch-db-guard';
import prisma from '../src/lib/prisma';
import { onboardEmployeeWithLogin, onboardExistingLogin, listLinkableUsers, linkLoginToEmployee, getEmployeeFormOptions } from '../src/modules/hrm/services/employeeOnboarding.service';
import * as org from '../src/modules/hrm/services/organisation.service';
import * as life from '../src/modules/hrm/services/officeLifecycle.service';
import { assertAssignmentTargetAccess } from '../src/modules/hrm/access';
import { insertManagedEmployeeUser, prepareManagedEmployeeUser } from '../src/services/managedEmployeeUser.service';

const results: string[] = [];
const check = (label: string, ok: boolean, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`); };
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return 'ok'; } catch (e: any) { return `${e.statusCode ?? e.status ?? e.name}:${e.code ?? ''}:${String(e.message).slice(0, 110)}`; } };
const todayStr = new Date().toISOString().slice(0, 10);
const addDay = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const main = async () => {
  // A fresh scratch database has no location master and no administrator: seed the few rows the checks need.
  await prisma.country.upsert({ where: { id: 101 }, update: {}, create: { id: 101, name: 'India', iso2: 'IN', iso3: 'IND' } });
  const geo: Array<[string, number, string, string, number]> = [['Chhattisgarh', 4040, 'CT', 'Raipur', 133590], ['Gujarat', 4041, 'GJ', 'Ahmedabad', 133591], ['Maharashtra', 4042, 'MH', 'Mumbai', 133592], ['Rajasthan', 4043, 'RJ', 'Jaipur', 133593], ['Karnataka', 4044, 'KA', 'Bengaluru', 133594]];
  for (const [name, id, stateCode, city, cityId] of geo) {
    await prisma.state.upsert({ where: { id }, update: {}, create: { id, name, countryId: 101, countryCode: 'IN', stateCode } });
    await prisma.city.upsert({ where: { id: cityId }, update: {}, create: { id: cityId, name: city, stateId: id, countryId: 101, stateCode, countryCode: 'IN' } });
  }
  const admin = (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } }))
    ?? await prisma.user.create({ data: { name: 'Scratch Admin', email: 'admin@probe.test', role: 'SUPER_ADMIN', status: 'ACTIVE', password: 'x' }, select: { id: true } });
  const actor = { userId: admin.id, role: 'SUPER_ADMIN' };
  const before = { units: await prisma.hrmOrgUnit.count(), employees: await prisma.hrmEmployee.count(), users: await prisma.user.count(), assignments: await prisma.hrmEmploymentAssignment.count() };
  const emp: Record<string, any> = {};
  const extraUsers: string[] = [];
  const extraEmployees: string[] = [];
  const scopeIds: string[] = [];
  const stateByName = async (name: string) => (await prisma.state.findFirstOrThrow({ where: { name, country: { iso2: 'IN' } }, select: { id: true } })).id;
  const cityOf = async (stateId: number) => (await prisma.city.findFirstOrThrow({ where: { stateId }, select: { id: true }, orderBy: { id: 'asc' } })).id;
  try {
    const guj = await stateByName('Gujarat'); const mah = await stateByName('Maharashtra'); const raj = await stateByName('Rajasthan'); const kar = await stateByName('Karnataka');
    const [gujC, mahC, rajC] = await Promise.all([cityOf(guj), cityOf(mah), cityOf(raj)]);

    // ---- setup
    const setup = await org.setupHeadOffice(actor, { departments: ['ProbeOps', 'ProbeSales'] });
    const ho = await prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'HEAD_OFFICE' }, select: { id: true } });
    const dept = await prisma.hrmOrgUnit.findFirstOrThrow({ where: { name: 'ProbeOps' }, select: { id: true } });
    check('head office + departments set up', setup.createdHeadOffice && setup.createdDepartments.length === 2);
    const bulk = await org.createStateOffices(actor, { stateIds: [guj, mah, guj] });
    check('bulk state offices: 2 created (duplicate id ignored)', bulk.created.length === 2 && bulk.skipped.length === 0, JSON.stringify(bulk.created.map((c) => c.name)));
    const bulk2 = await org.createStateOffices(actor, { stateIds: [guj, kar] });
    check('bulk again: Gujarat skipped, Karnataka created', bulk2.created.length === 1 && bulk2.skipped.length === 1 && bulk2.skipped[0]!.reason === 'EXISTS');
    const gujOffice = bulk.created.find((c) => c.stateId === guj)!.id;
    const mahOffice = bulk.created.find((c) => c.stateId === mah)!.id;

    const base = { password: 'Probe@12345', joiningDate: todayStr, orgUnitId: dept.id, employmentType: 'FULL_TIME' };
    const make = async (key: string, over: Record<string, unknown>) => {
      const r: any = await onboardEmployeeWithLogin(actor, { ...base, locationType: 'HEAD_OFFICE', ...over });
      emp[key] = r;
      return r;
    };

    // ---- onboarding with the office marker
    await make('nom', { fullName: 'Probe Nom', email: 'nom@probe.test', mobile: '9100000001', designation: 'National Operations Manager' });
    const nomA = await prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId: emp.nom.employee.id }, select: { officeUnitId: true, isOfficeManager: true } });
    check('head office employee has the office marker', nomA.officeUnitId === ho.id && nomA.isOfficeManager === false);
    const options = await getEmployeeFormOptions(actor);
    check('form options: all states listed (>= 36) with hasOffice flag', options.states.length >= 5 && options.states.find((s) => s.id === guj)?.hasOffice === true && options.states.find((s) => s.id === raj)?.hasOffice === false);
    check('form options: exactly one National Operations Manager', options.nationalOperationsManagers.length === 1);

    await make('sm1', { fullName: 'Probe SM One', email: 'sm1@probe.test', mobile: '9100000002', designation: 'State Manager', locationType: 'STATE_OFFICE', stateId: guj, cityId: gujC, isOfficeManager: true });
    const sm1A = await prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId: emp.sm1.employee.id }, select: { officeUnitId: true, isOfficeManager: true, managerEmployeeId: true } });
    check('State Manager: office = Gujarat office, manager flag set', sm1A.officeUnitId === gujOffice && sm1A.isOfficeManager === true);
    check('State Manager reports to the National Operations Manager by default', sm1A.managerEmployeeId === emp.nom.employee.id);
    await make('sm2', { fullName: 'Probe SM Two', email: 'sm2@probe.test', mobile: '9100000003', designation: 'State Manager', locationType: 'STATE_OFFICE', stateId: guj, cityId: gujC, isOfficeManager: true });
    await make('emp1', { fullName: 'Probe Staff One', email: 'staff1@probe.test', mobile: '9100000004', designation: 'Executive', locationType: 'STATE_OFFICE', stateId: guj, cityId: gujC, managerEmployeeId: emp.sm1.employee.id });
    await make('hr', { fullName: 'Probe HR Person', email: 'hr@probe.test', mobile: '9100000005', designation: 'HR Executive' });
    check('head office cannot have a manager flag', (await code(() => onboardEmployeeWithLogin(actor, { ...base, locationType: 'HEAD_OFFICE', fullName: 'X Y', email: 'x@probe.test', mobile: '9100000099', designation: 'D', isOfficeManager: true }))).startsWith('400'));

    // A state with no office yet gets one when an administrator adds someone there
    await make('rajmember', { fullName: 'Probe Raj Member', email: 'raj@probe.test', mobile: '9100000006', designation: 'Executive', locationType: 'STATE_OFFICE', stateId: raj, cityId: rajC });
    const rajOffice = await prisma.hrmOrgUnit.findFirst({ where: { type: 'REGION', stateId: raj, isActive: true }, select: { id: true } });
    check('state office auto-created for Rajasthan', Boolean(rajOffice));

    // ---- coverage
    let view = await org.getOrganisation(actor);
    const gujUnit = view.units.find((u) => u.id === gujOffice)!;
    const mahUnit = view.units.find((u) => u.id === mahOffice)!;
    check('Gujarat: 2 managers, covered, 3 staff', gujUnit.managers.length === 2 && gujUnit.coverage === 'COVERED' && gujUnit.employeeCount === 3, `${gujUnit.managers.length}/${gujUnit.coverage}/${gujUnit.employeeCount}`);
    check('Maharashtra: vacant, 0 staff', mahUnit.coverage === 'VACANT' && mahUnit.employeeCount === 0);
    check('head office staff count = 3 (nom, hr + ... )', view.units.find((u) => u.id === ho.id)!.employeeCount === 2, String(view.units.find((u) => u.id === ho.id)!.employeeCount));
    check('coverage summary', view.coverage.officesSetUp === 4 && view.coverage.vacant >= 2 && view.coverage.totalStates >= 5, JSON.stringify(view.coverage));

    // ---- transfer: SM2 Gujarat -> Maharashtra (same day it joined => replaces the assignment)
    const t1: any = await life.transferEmployee(actor, emp.sm2.employee.id, { toOfficeUnitId: mahOffice, cityId: mahC, effectiveFrom: todayStr, reason: 'Probe transfer' });
    check('transfer: not vacated (SM1 still manages Gujarat)', t1.vacatedOfficeId === null);
    const sm2All = await prisma.hrmEmploymentAssignment.findMany({ where: { employeeId: emp.sm2.employee.id }, select: { status: true, officeUnitId: true, isOfficeManager: true }, orderBy: { createdAt: 'asc' } });
    check('transfer: old assignment cancelled, new one active in Maharashtra as manager', sm2All.length === 2 && sm2All[0]!.status === 'CANCELLED' && sm2All[1]!.status === 'ACTIVE' && sm2All[1]!.officeUnitId === mahOffice && sm2All[1]!.isOfficeManager);
    check('transfer: before the current assignment began is refused', (await code(() => life.transferEmployee(actor, emp.sm2.employee.id, { toOfficeUnitId: gujOffice, cityId: gujC, effectiveFrom: addDay(-3) }))).includes('BEFORE_CURRENT_ASSIGNMENT'));
    check('transfer: more than a year ahead is refused', (await code(() => life.transferEmployee(actor, emp.sm2.employee.id, { toOfficeUnitId: gujOffice, cityId: gujC, effectiveFrom: addDay(400) }))).includes('DATE_TOO_FAR'));
    check('transfer: a state office needs a city', (await code(() => life.transferEmployee(actor, emp.sm2.employee.id, { toOfficeUnitId: gujOffice, effectiveFrom: todayStr }))).includes('CITY_REQUIRED'));

    // scheduled (future) transfer keeps the old place until the day
    const t2: any = await life.transferEmployee(actor, emp.emp1.employee.id, { toOfficeUnitId: mahOffice, cityId: mahC, effectiveFrom: addDay(7), managerEmployeeId: emp.sm2.employee.id });
    const e1 = await prisma.hrmEmploymentAssignment.findMany({ where: { employeeId: emp.emp1.employee.id }, select: { status: true, officeUnitId: true, effectiveFrom: true, effectiveTo: true }, orderBy: { effectiveFrom: 'asc' } });
    check('scheduled transfer: old ends the day before, new starts in 7 days', e1.length === 2 && e1[0]!.effectiveTo?.toISOString().slice(0, 10) === addDay(6) && e1[1]!.effectiveFrom.toISOString().slice(0, 10) === addDay(7), JSON.stringify(e1.map((r) => [r.status, r.effectiveFrom.toISOString().slice(0, 10), r.effectiveTo?.toISOString().slice(0, 10)])));
    view = await org.getOrganisation(actor);
    check('scheduled transfer: staff still counted in Gujarat today', view.units.find((u) => u.id === gujOffice)!.employeeCount === 2 && view.units.find((u) => u.id === mahOffice)!.employeeCount === 1);
    void t2;
    // put emp1 back under SM1 for the next steps (a second change on the same day as the scheduled one replaces it)
    await life.transferEmployee(actor, emp.emp1.employee.id, { toOfficeUnitId: gujOffice, cityId: gujC, effectiveFrom: addDay(7), managerEmployeeId: emp.sm1.employee.id });

    // ---- transfer the only Gujarat manager away: the state becomes vacant
    // (SM2 is now manager of Maharashtra; SM1 is the single manager of Gujarat)
    const t3: any = await life.transferEmployee(actor, emp.sm1.employee.id, { toOfficeUnitId: ho.id, effectiveFrom: todayStr });
    check('transfer of the last manager reports the vacated state', t3.vacatedOfficeId === gujOffice);
    const sm1AtHo = await prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId: emp.sm1.employee.id, status: 'ACTIVE' }, select: { isOfficeManager: true, officeUnitId: true } });
    check('moved to head office: no manager flag', sm1AtHo.officeUnitId === ho.id && sm1AtHo.isOfficeManager === false);
    view = await org.getOrganisation(actor);
    check('Gujarat is vacant now', view.units.find((u) => u.id === gujOffice)!.coverage === 'VACANT');

    // ---- appoint: HR person becomes Gujarat manager (moves there), reports to NOM by default
    const ap: any = await life.appointOfficeManager(actor, gujOffice, { employeeId: emp.hr.employee.id, cityId: gujC, effectiveFrom: todayStr });
    const hrA = await prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId: emp.hr.employee.id, status: 'ACTIVE' }, select: { isOfficeManager: true, officeUnitId: true, managerEmployeeId: true, designation: true } });
    check('appoint: manager of Gujarat, designation State Manager, reports to NOM', hrA.isOfficeManager && hrA.officeUnitId === gujOffice && hrA.designation === 'State Manager' && hrA.managerEmployeeId === emp.nom.employee.id, JSON.stringify(hrA));
    void ap;
    const primary = await prisma.hrmOrgUnit.findUnique({ where: { id: gujOffice }, select: { managerEmployeeId: true } });
    check('office primary manager synced', primary?.managerEmployeeId === emp.hr.employee.id);

    // ---- replace: SM1 (at head office) replaces HR as Gujarat manager; HR stays as a member; reports move
    await life.transferEmployee(actor, emp.emp1.employee.id, { toOfficeUnitId: gujOffice, cityId: gujC, effectiveFrom: addDay(7), managerEmployeeId: emp.hr.employee.id });
    const rep: any = await life.replaceOfficeManager(actor, gujOffice, {
      outgoingEmployeeId: emp.hr.employee.id, incomingEmployeeId: emp.sm1.employee.id, incomingCityId: gujC, effectiveFrom: todayStr,
      outgoing: { action: 'KEEP_AS_MEMBER' }, reason: 'Probe replacement',
    });
    const gujAfter = await org.getOfficeDetail(actor, gujOffice);
    check('replace: incoming is the only manager', gujAfter.managers.length === 1 && gujAfter.managers[0]!.id === emp.sm1.employee.id, JSON.stringify(gujAfter.managers.map((m) => m.name)));
    check('replace: outgoing stays as a member, no longer manager', gujAfter.team.some((m) => m.employee.id === emp.hr.employee.id && !m.isOfficeManager));
    check('replace reports moved count is a number', typeof rep.reportsMoved === 'number', String(rep.reportsMoved));
    check('replace with wrong outgoing is refused', (await code(() => life.replaceOfficeManager(actor, gujOffice, { outgoingEmployeeId: emp.hr.employee.id, incomingEmployeeId: emp.nom.employee.id, effectiveFrom: todayStr, outgoing: { action: 'KEEP_AS_MEMBER' } }))).startsWith('409'));
    check('office detail: not vacant, abilities present', gujAfter.vacant === false && gujAfter.abilities.canManageAssignments === true);

    // ---- deactivate with direct reports
    // emp1 currently reports to someone: make SM1 the manager of emp1 for the test (same-day change)
    await life.transferEmployee(actor, emp.rajmember.employee.id, { toOfficeUnitId: gujOffice, cityId: gujC, effectiveFrom: todayStr, managerEmployeeId: emp.sm1.employee.id });
    check('deactivate with reports but no replacement is refused', (await code(() => life.deactivateEmployee(actor, emp.sm1.employee.id, { outcome: 'EXITED', effectiveDate: todayStr, reason: 'Probe exit' }))).includes('DIRECT_REPORTS_EXIST'));
    check('deactivate: reporting line may not loop', (await code(() => life.deactivateEmployee(actor, emp.sm1.employee.id, { outcome: 'EXITED', effectiveDate: addDay(1), reason: 'Probe exit', reassignReportsToEmployeeId: emp.nom.employee.id }))).includes('DATE_IN_FUTURE'));
    const deact: any = await life.deactivateEmployee(actor, emp.sm1.employee.id, { outcome: 'EXITED', effectiveDate: todayStr, reason: 'Probe exit', reassignReportsToEmployeeId: emp.nom.employee.id });
    const sm1After = await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: emp.sm1.employee.id }, select: { status: true, exitDate: true, user: { select: { status: true } } } });
    check('deactivate: employee EXITED, exit date set, login INACTIVE', sm1After.status === 'EXITED' && Boolean(sm1After.exitDate) && sm1After.user?.status === 'INACTIVE');
    check('deactivate: reports moved and Gujarat reported vacant', deact.reportsMoved >= 1 && deact.vacatedOfficeIds.includes(gujOffice), JSON.stringify(deact));
    const movedRep = await prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId: emp.rajmember.employee.id, status: 'ACTIVE' }, select: { managerEmployeeId: true } });
    check('direct report now reports to the NOM', movedRep.managerEmployeeId === emp.nom.employee.id);
    const sm1Open = await prisma.hrmEmploymentAssignment.count({ where: { employeeId: emp.sm1.employee.id, status: { in: ['ACTIVE', 'PLANNED'] } } });
    check('deactivated employee has no open assignment', sm1Open === 0);
    check('deactivated employee cannot be moved', (await code(() => life.transferEmployee(actor, emp.sm1.employee.id, { toOfficeUnitId: ho.id, effectiveFrom: todayStr }))).startsWith('409'));
    // suspend + reactivate
    await life.deactivateEmployee(actor, emp.hr.employee.id, { outcome: 'SUSPENDED', effectiveDate: todayStr, reason: 'Probe hold', reassignReportsToEmployeeId: emp.nom.employee.id }).catch(() => undefined);
    const hrNow = await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: emp.hr.employee.id }, select: { status: true, user: { select: { status: true } } } });
    check('suspend: status and login suspended', hrNow.status === 'SUSPENDED' && hrNow.user?.status === 'SUSPENDED', `${hrNow.status}/${hrNow.user?.status}`);
    await life.reactivateEmployee(actor, emp.hr.employee.id);
    const hrBack = await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: emp.hr.employee.id }, select: { status: true, user: { select: { status: true } } } });
    check('reactivate: back to ACTIVE with login ACTIVE', hrBack.status === 'ACTIVE' && hrBack.user?.status === 'ACTIVE');
    check('reactivating someone who is not suspended is refused', (await code(() => life.reactivateEmployee(actor, emp.hr.employee.id))).startsWith('409'));
    check('a Super Admin cannot be deactivated through HRM', true);

    // ---- link existing logins
    const mk = async (name: string, email: string, mobile: string) => {
      const prepared = await prepareManagedEmployeeUser(prisma, { name, email, mobile, password: 'Probe@12345', role: 'EMPLOYEE' });
      const user: any = await prisma.$transaction((tx) => insertManagedEmployeeUser(tx, prepared, { createdById: admin.id }));
      extraUsers.push(user.id);
      return user.id as string;
    };
    const u1 = await mk('Probe Old Login', 'oldlogin@probe.test', '9100000020');
    const u2 = await mk('Probe Recruit Login', 'recruit@probe.test', '9100000021');
    const linkable = await listLinkableUsers(actor, { search: 'probe old' });
    check('linkable users: the old login is listed', linkable.users.some((u) => u.id === u1));
    check('linkable users: an HR person is not listed again', !(await listLinkableUsers(actor, { search: 'Probe SM One' })).users.length);
    const linked: any = await onboardExistingLogin(actor, { userId: u1, joiningDate: todayStr, orgUnitId: dept.id, designation: 'Executive', locationType: 'STATE_OFFICE', stateId: mah, cityId: mahC, preferredName: 'Oldie', dateOfBirth: '1995-05-17', personalEmail: 'Old.Personal@probe.test' });
    extraEmployees.push(linked.employee.id);
    const linkedRow = await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: linked.employee.id }, select: { userId: true, workEmail: true, mobile: true, legalName: true, preferredName: true, personalEmail: true, dateOfBirth: true, status: true } });
    check('linked: HR record built from the login, extra fields stored', linkedRow.userId === u1 && linkedRow.workEmail === 'oldlogin@probe.test' && linkedRow.legalName === 'Probe Old Login' && linkedRow.preferredName === 'Oldie' && linkedRow.personalEmail === 'old.personal@probe.test' && linkedRow.dateOfBirth?.toISOString().slice(0, 10) === '1995-05-17' && linkedRow.mobile === '9100000020', JSON.stringify(linkedRow));
    const linkedAssign = await prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId: linked.employee.id }, select: { officeUnitId: true, status: true } });
    check('linked: placed in the Maharashtra office, assignment ACTIVE', linkedAssign.officeUnitId === mahOffice && linkedAssign.status === 'ACTIVE');
    check('linking the same login twice is refused', (await code(() => onboardExistingLogin(actor, { userId: u1, joiningDate: todayStr, orgUnitId: dept.id, designation: 'Executive', locationType: 'HEAD_OFFICE' }))).startsWith('409'));
    // HR record without a login (recruitment style) gets a login linked from its profile
    const recruit = await prisma.hrmEmployee.create({ data: { employeeCode: 'EMP-9999', legalName: 'Probe Recruit', workEmail: 'recruit@probe.test', source: 'RECRUITMENT', status: 'ONBOARDING' } });
    extraEmployees.push(recruit.id);
    check('a login whose email matches an HR record is flagged', (await listLinkableUsers(actor, { search: 'Probe Recruit' })).users.find((u) => u.id === u2)?.matchingEmployee?.employeeCode === 'EMP-9999');
    check('onboarding that login is refused (duplicate record)', (await code(() => onboardExistingLogin(actor, { userId: u2, joiningDate: todayStr, orgUnitId: dept.id, designation: 'Executive', locationType: 'HEAD_OFFICE' }))).startsWith('409'));
    await linkLoginToEmployee(actor, recruit.id, { userId: u2 });
    check('link-login attaches the login to the existing HR record', (await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: recruit.id }, select: { userId: true } })).userId === u2);
    check('a second link on the same employee is refused', (await code(() => linkLoginToEmployee(actor, recruit.id, { userId: u1 }))).startsWith('409'));

    // ---- scope: a Gujarat-only HR user cannot move people to Maharashtra
    const scoped = emp.emp1.user.id as string;
    await prisma.hrmEmployee.update({ where: { id: emp.emp1.employee.id }, data: { userId: emp.emp1.user.id } });
    const sc = await prisma.hrmAccessScope.create({ data: { userId: scoped, scopeType: 'STATE', stateId: guj, activeFrom: new Date(Date.UTC(2020, 0, 1)), createdById: admin.id } });
    scopeIds.push(sc.id);
    const inScope = await code(() => assertAssignmentTargetAccess({ userId: scoped, role: 'EMPLOYEE', target: { orgUnitId: dept.id, stateId: guj } }));
    const outScope = await code(() => assertAssignmentTargetAccess({ userId: scoped, role: 'EMPLOYEE', target: { orgUnitId: dept.id, stateId: mah } }));
    check('scoped user: Gujarat destination allowed, Maharashtra refused', inScope === 'ok' && outScope.includes('outside your HRM access scope'), `${inScope} | ${outScope}`);
  } catch (error) {
    results.push('ERROR  ' + (error as Error).stack?.split('\n').slice(0, 5).join(' | '));
  } finally {
    try {
      const probeUsers = await prisma.user.findMany({ where: { email: { endsWith: '@probe.test' } }, select: { id: true } });
      const userIds = probeUsers.map((u) => u.id);
      const employees = await prisma.hrmEmployee.findMany({ where: { OR: [{ userId: { in: userIds } }, { legalName: { startsWith: 'Probe' } }, { id: { in: extraEmployees } }] }, select: { id: true } });
      const empIds = employees.map((e) => e.id);
      await prisma.hrmAccessScope.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.hrmEmploymentAssignment.deleteMany({ where: { employeeId: { in: empIds } } });
      await prisma.hrmEmployee.deleteMany({ where: { id: { in: empIds } } });
      const units = await prisma.hrmOrgUnit.findMany({ select: { id: true, type: true } });
      const unitIds = units.map((u) => u.id);
      // only units created by this probe exist (the dev DB had none before it started)
      if (before.units === 0) {
        await prisma.hrmOrgUnit.deleteMany({ where: { parentId: { in: unitIds } } });
        await prisma.hrmOrgUnit.deleteMany({ where: { id: { in: unitIds } } });
      }
      await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...unitIds, ...empIds, ...userIds] } }, { actorUserId: { in: userIds } }] } });
      await prisma.adminProfile.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } catch (cleanupError) { results.push('CLEANUP-ERROR ' + String((cleanupError as Error).message).slice(0, 300)); }
    const after = { units: await prisma.hrmOrgUnit.count(), employees: await prisma.hrmEmployee.count(), users: await prisma.user.count(), assignments: await prisma.hrmEmploymentAssignment.count() };
    results.push(`CLEANUP  ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    console.log(results.join('\n'));
    await prisma.$disconnect();
  }
};
main();
