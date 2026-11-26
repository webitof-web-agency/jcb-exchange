/**
 * End-to-end check of the reporting manager list, "Change manager" and the directory filter. It writes real rows, so
 * it ONLY runs against a local scratch database (see scratch-db-guard.ts):
 *
 *   createdb jcbexchange_hrm_scratch
 *   $env:DATABASE_URL="postgresql://postgres:<password>@localhost:5432/jcbexchange_hrm_scratch?schema=public"
 *   npx prisma db push
 *   npx tsx scripts/verify-reporting-manager.ts
 *
 * Run it on a fresh scratch database (drop and create it again for a second run).
 */
import './scratch-db-guard';
import prisma from '../src/lib/prisma';
import * as org from '../src/modules/hrm/services/organisation.service';
import * as life from '../src/modules/hrm/services/officeLifecycle.service';
import * as hrm from '../src/modules/hrm/services/hrm.service';
import { createCharge } from '../src/modules/hrm/services/additionalCharge.service';
import { onboardEmployeeWithLogin } from '../src/modules/hrm/services/employeeOnboarding.service';
import { ensureSystemDesignations } from '../src/modules/hrm/services/designation.service';
import { getHrmManagerOptions } from '../src/modules/hrm/services/managerOptions.service';
import { searchOfferReportingManagers } from '../src/modules/hrm/services/offerPlacement.service';
import { istToday } from '../src/modules/hrm/istDate';

const results: string[] = [];
const check = (label: string, ok: boolean, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`); };
const failure = async (work: () => Promise<unknown>) => { try { await work(); return 'ok'; } catch (error: any) { return `${error.statusCode ?? error.name}:${error.code ?? ''}:${String(error.message).slice(0, 140)}`; } };
const day = (offset: number) => new Date(istToday().getTime() + offset * 86_400_000).toISOString().slice(0, 10);
const stamp = Date.now().toString(36);
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

const GEO = [
  ['Chhattisgarh', 4040, 'CT', 'Raipur', 133590],
  ['Gujarat', 4041, 'GJ', 'Ahmedabad', 133591],
  ['Maharashtra', 4042, 'MH', 'Mumbai', 133592],
] as const;

async function main() {
  await prisma.country.upsert({ where: { id: 101 }, update: {}, create: { id: 101, name: 'India', iso2: 'IN', iso3: 'IND' } });
  for (const [name, id, stateCode, city, cityId] of GEO) {
    await prisma.state.upsert({ where: { id }, update: {}, create: { id, name, countryId: 101, countryCode: 'IN', stateCode } });
    await prisma.city.upsert({ where: { id: cityId }, update: {}, create: { id: cityId, name: city, stateId: id, countryId: 101, stateCode, countryCode: 'IN' } });
  }
  await ensureSystemDesignations(prisma);
  const admin = await prisma.user.create({ data: { name: 'Admin', email: `admin-${stamp}@probe.test`, mobile: mobile(), password: 'x', role: 'SUPER_ADMIN', status: 'ACTIVE' } });
  const actor = { userId: admin.id, role: 'SUPER_ADMIN' };
  await org.setupHeadOffice(actor, { stateId: 4040, cityId: 133590, departments: [`Sales ${stamp}`] });
  await org.createStateOffices(actor, { stateIds: [4041, 4042] });
  const department = await prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'DEPARTMENT', isActive: true }, select: { id: true } });
  const role = await prisma.customRole.create({ data: { name: `HR ${stamp}`, permissions: ['hrm.employees.read', 'hrm.assignments.manage'] } });
  const offices = await prisma.hrmOrgUnit.findMany({ where: { type: { in: ['HEAD_OFFICE', 'REGION'] } } });
  const office = (stateId: number) => offices.find((unit) => unit.type === 'REGION' && unit.stateId === stateId)!;
  const headOffice = offices.find((unit) => unit.type === 'HEAD_OFFICE')!;
  for (const name of ['Sales Executive', 'National Operations Manager']) {
    await prisma.hrmDesignation.upsert({ where: { nameKey: name.toLowerCase() }, create: { name, nameKey: name.toLowerCase() }, update: {} });
  }

  const person = async (name: string, options: { stateId: number; cityId: number; headOffice?: boolean; manager?: boolean; designation?: string; joining?: string }) => {
    const made: any = await onboardEmployeeWithLogin(actor, {
      fullName: `${name} Probe`, email: `${name.toLowerCase()}-${stamp}@probe.test`, mobile: mobile(), password: 'Probe@12345',
      customRoleId: role.id, employmentType: 'FULL_TIME', orgUnitId: department.id, designation: options.designation ?? (options.manager ? 'State Manager' : 'Sales Executive'),
      locationType: options.headOffice ? 'HEAD_OFFICE' : 'STATE_OFFICE', stateId: options.stateId, cityId: options.cityId,
      ...(options.manager ? { isOfficeManager: true } : {}), joiningDate: options.joining ?? day(-30),
    });
    const id = made.employee.id as string;
    await prisma.hrmEmployee.update({ where: { id }, data: { status: 'ACTIVE' } });
    return id;
  };
  const nom = await person('Nirmal', { stateId: 4040, cityId: 133590, headOffice: true, designation: 'National Operations Manager' });
  const mhManager = await person('Mahesh', { stateId: 4042, cityId: 133592, manager: true });
  const gjManager = await person('Gita', { stateId: 4041, cityId: 133591, manager: true });
  const asha = await person('Asha', { stateId: 4041, cityId: 133591 });
  const bela = await person('Bela', { stateId: 4041, cityId: 133591 });
  const hari = await person('Hari', { stateId: 4040, cityId: 133590, headOffice: true });
  const draft = await person('Dinesh', { stateId: 4041, cityId: 133591 });
  await prisma.hrmEmployee.update({ where: { id: draft }, data: { status: 'DRAFT' } });

  const managerOf = async (employeeId: string) => (await prisma.hrmEmploymentAssignment.findFirst({ where: { employeeId, status: 'ACTIVE' }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }], select: { managerEmployeeId: true } }))?.managerEmployeeId ?? null;
  const ids = (list: Awaited<ReturnType<typeof getHrmManagerOptions>>, group: string) => list.groups.find((item) => item.id === group)?.people.map((row) => row.id) ?? [];
  const every = (list: Awaited<ReturnType<typeof getHrmManagerOptions>>) => list.groups.flatMap((item) => item.people.map((row) => row.id));

  // 1. The list for a Gujarat employee
  let list = await getHrmManagerOptions(actor, { employeeId: asha, stateId: '4041', cityId: '133591' });
  check('Gujarat staff: its manager is suggested and filled in', ids(list, 'SUGGESTED').join() === gjManager && list.preselect?.id === gjManager, list.preselect?.suggestedAs ?? 'none');
  check('the team of that state is listed', ids(list, 'STATE').includes(bela));
  check('head office is listed', ids(list, 'HEAD_OFFICE').includes(nom) && ids(list, 'HEAD_OFFICE').includes(hari));
  check('other states are not listed without a search', !every(list).includes(mhManager));
  check('never the person, never a draft', !every(list).includes(asha) && !every(list).includes(draft));
  const row = list.groups.flatMap((item) => item.people).find((item) => item.id === gjManager)!;
  check('designation, role and office come with the name', row.designation === 'State Manager' && row.officeType === 'REGION' && row.stateId === 4041 && row.hasLogin, `${row.designation} / ${row.role}`);

  list = await getHrmManagerOptions(actor, { employeeId: asha, stateId: '4041', search: 'Mahesh' });
  check('a search finds another state\'s manager', ids(list, 'OTHER').join() === mhManager && list.preselect === null);
  list = await getHrmManagerOptions(actor, { employeeId: asha, headOffice: 'true' });
  check('head office list: head office people', list.target.kind === 'HEAD_OFFICE' && ids(list, 'HEAD_OFFICE').includes(hari) && list.preselect === null);
  list = await getHrmManagerOptions(actor, { employeeId: gjManager });
  check('a State Manager is given the National Operations Manager', list.preselect?.id === nom, list.preselect?.name ?? 'none');
  check('the directory count of reports comes along', typeof list.groups[0]?.people[0]?.directReports === 'number');

  // 2. A state without a manager, then with an additional charge
  const goa = await (async () => {
    await prisma.state.upsert({ where: { id: 4039 }, update: {}, create: { id: 4039, name: 'Goa', countryId: 101, countryCode: 'IN', stateCode: 'GA' } });
    await org.createStateOffices(actor, { stateIds: [4039] });
    return prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'REGION', stateId: 4039 } });
  })();
  list = await getHrmManagerOptions(actor, { stateId: '4039' });
  check('a state without a manager says so', list.note === 'Goa has no State Manager yet.' && list.preselect === null, list.note ?? '');
  await createCharge(actor, goa.id, { employeeId: mhManager, effectiveFrom: day(0) });
  list = await getHrmManagerOptions(actor, { stateId: '4039' });
  check('the additional charge holder is suggested', list.preselect?.id === mhManager && list.preselect.suggestedAs === 'Additional charge of Goa');

  // 3. Change manager
  const before = await prisma.hrmEmploymentAssignment.count({ where: { employeeId: asha } });
  await life.changeReportingManager(actor, asha, { managerEmployeeId: gjManager, effectiveFrom: day(0), reason: 'Team set up' });
  check('change manager saves', (await managerOf(asha)) === gjManager);
  check('history is kept as a new assignment', (await prisma.hrmEmploymentAssignment.count({ where: { employeeId: asha } })) === before + 1);
  const current = await prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId: asha, status: 'ACTIVE' }, orderBy: { effectiveFrom: 'desc' } });
  check('office, department and designation stay', current.officeUnitId === office(4041).id && current.orgUnitId === department.id && current.designation === 'Sales Executive');
  check('an audit row is written', (await prisma.auditLog.count({ where: { entityId: asha, action: 'REPORTING_MANAGER_CHANGED' } })) === 1);
  const same = await failure(() => life.changeReportingManager(actor, asha, { managerEmployeeId: gjManager, effectiveFrom: day(0) }));
  check('the same manager again is refused', same.includes('MANAGER_UNCHANGED'), same);
  await life.changeReportingManager(actor, bela, { managerEmployeeId: asha, effectiveFrom: day(0) });
  const loop = await failure(() => life.changeReportingManager(actor, asha, { managerEmployeeId: bela, effectiveFrom: day(0) }));
  check('a reporting loop is refused', loop.startsWith('409'), loop);
  const self = await failure(() => life.changeReportingManager(actor, asha, { managerEmployeeId: asha, effectiveFrom: day(0) }));
  check('reporting to yourself is refused', self.includes('MANAGER_IS_SELF'), self);
  const toDraft = await failure(() => life.changeReportingManager(actor, asha, { managerEmployeeId: draft, effectiveFrom: day(0) }));
  check('a draft employee cannot be the manager', toDraft.includes('MANAGER_NOT_FOUND'), toDraft);
  const early = await failure(() => life.changeReportingManager(actor, hari, { managerEmployeeId: nom, effectiveFrom: day(-60) }));
  check('a date before the assignment began is refused', early.includes('BEFORE_CURRENT_ASSIGNMENT'), early);

  list = await getHrmManagerOptions(actor, { employeeId: asha, stateId: '4041' });
  const blocked = list.groups.flatMap((item) => item.people).find((item) => item.id === bela);
  check('somebody in the own team is shown but blocked', Boolean(blocked?.blocked), blocked?.blocked ?? 'not blocked');
  check('the current manager is marked', list.currentManagerId === gjManager);

  await life.changeReportingManager(actor, asha, { managerEmployeeId: nom, effectiveFrom: day(5) });
  check('a future change waits for its day', (await prisma.hrmEmploymentAssignment.count({ where: { employeeId: asha, status: 'ACTIVE', effectiveFrom: { lte: istToday() }, managerEmployeeId: gjManager, effectiveTo: { gte: istToday() } } })) === 1);
  await life.changeReportingManager(actor, hari, { managerEmployeeId: nom, effectiveFrom: day(0) });
  await life.changeReportingManager(actor, hari, { managerEmployeeId: null, effectiveFrom: day(0) });
  check('the manager can be removed', (await managerOf(hari)) === null);

  // 4. Successor of somebody who leaves
  list = await getHrmManagerOptions(actor, { employeeId: gjManager, purpose: 'successor' });
  check('successor: the leaver\'s own manager comes first, nobody filled in', ids(list, 'SUGGESTED')[0] === nom && list.groups[0]!.people[0]!.suggestedAs === 'Their manager' && list.preselect === null, list.groups[0]?.people[0]?.suggestedAs ?? 'none');
  const deep = list.groups.flatMap((item) => item.people).find((item) => item.id === bela);
  check('successor: somebody two levels down is blocked', Boolean(deep?.blocked) && list.preselect === null, deep?.blocked ?? '');

  // 5. Directory filter and the coming manager of somebody not started
  const joiner = await person('Jatin', { stateId: 4041, cityId: 133591, joining: day(10) });
  await life.changeReportingManager(actor, joiner, { managerEmployeeId: gjManager, effectiveFrom: day(10) });
  const missing: any = await hrm.listEmployees(actor, { page: '1', limit: '100', manager: 'missing' });
  const assigned: any = await hrm.listEmployees(actor, { page: '1', limit: '100', manager: 'assigned' });
  const missingIds = missing.employees.map((item: any) => item.id);
  const assignedIds = assigned.employees.map((item: any) => item.id);
  check('"Manager not set" has the people without one', missingIds.includes(hari) && missingIds.includes(nom) && !missingIds.includes(asha) && !missingIds.includes(joiner));
  check('"Manager set" has the others, including a coming joiner', assignedIds.includes(asha) && assignedIds.includes(bela) && assignedIds.includes(joiner) && !assignedIds.includes(hari));
  const all: any = await hrm.listEmployees(actor, { page: '1', limit: '100' });
  check('the two lists add up to everybody', missing.pagination.total + assigned.pagination.total === all.pagination.total, `${missing.pagination.total} + ${assigned.pagination.total} = ${all.pagination.total}`);
  check('tab counts follow the filter', missing.counts.all === missing.pagination.total, `${missing.counts.all} / ${missing.pagination.total}`);
  const joinerRow = all.employees.find((item: any) => item.id === joiner);
  check('a coming joiner shows the coming manager with the date', joinerRow.currentAssignment === null && joinerRow.upcomingManager?.id === gjManager && joinerRow.upcomingManager.from.toISOString().slice(0, 10) === day(10));

  // 6. A State Manager with only their state, and the offer form
  const gitaUser = (await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: gjManager }, select: { userId: true } })).userId!;
  await prisma.hrmAccessScope.create({ data: { userId: gitaUser, scopeType: 'STATE', stateId: 4041, includeChildren: true, activeFrom: istToday(), createdById: admin.id } });
  const gita = { userId: gitaUser, role: 'EMPLOYEE' };
  list = await getHrmManagerOptions(gita, { employeeId: bela, search: 'Probe' });
  check('state HR sees the state and the National Operations Manager only', every(list).includes(nom) && every(list).includes(asha) && !every(list).includes(mhManager) && !every(list).includes(hari) && !list.searchesEveryone, String(every(list).length));
  const outside = await failure(() => getHrmManagerOptions(gita, { employeeId: mhManager }));
  check('state HR cannot ask about another state\'s employee', outside.startsWith('403'), outside);

  const offer = await searchOfferReportingManagers({ stateId: '4041', cityId: '133591' }, { all: true } as never);
  check('offer form: same suggestion', offer.preselect?.id === gjManager);
  const scopedOffer = await searchOfferReportingManagers({ stateId: '4041', search: 'Probe' }, { all: false, stateIds: [4041], headOffice: false } as never);
  check('offer form: limited to the recruiter\'s places', !scopedOffer.groups.some((item) => item.people.some((person) => person.id === mhManager || person.id === hari)) && scopedOffer.groups.some((item) => item.people.some((person) => person.id === nom)));
  const national = await searchOfferReportingManagers({ stateId: '4041', managerRole: 'true' }, { all: true } as never);
  check('offer for a State Manager: National Operations Manager', national.preselect?.id === nom);
  check('head office unit exists', Boolean(headOffice));

  // 7. Add employee with a reporting manager
  const add = (by: { userId: string; role: string }, name: string, extra: Record<string, unknown>) => onboardEmployeeWithLogin(by, {
    fullName: `${name} Probe`, email: `${name.toLowerCase()}-${stamp}@probe.test`, mobile: mobile(), password: 'Probe@12345', customRoleId: role.id,
    employmentType: 'FULL_TIME', orgUnitId: department.id, designation: 'Sales Executive', joiningDate: day(0), locationType: 'STATE_OFFICE', stateId: 4041, cityId: 133591, ...extra,
  });
  const withManager: any = await add(actor, 'Ila', { managerEmployeeId: gjManager });
  check('add employee saves the chosen manager', (await managerOf(withManager.employee.id)) === gjManager);
  const without: any = await add(actor, 'Jaya', { managerEmployeeId: null });
  check('add employee: removed manager stays empty', (await managerOf(without.employee.id)) === null);
  const draftManager = await failure(() => add(actor, 'Kiran', { managerEmployeeId: draft }));
  check('add employee refuses a draft as manager', draftManager.includes('MANAGER_NOT_FOUND'), draftManager);

  // A Goa HR user: the charge holder of Goa works from Maharashtra, outside their access, yet manages their state.
  await prisma.city.upsert({ where: { id: 133600 }, update: {}, create: { id: 133600, name: 'Panaji', stateId: 4039, countryId: 101, stateCode: 'GA', countryCode: 'IN' } });
  const goaHrId = await person('Lalit', { stateId: 4039, cityId: 133600 });
  const hrRole = await prisma.customRole.create({ data: { name: `Goa HR ${stamp}`, permissions: ['hrm.employees.read', 'hrm.employees.manage', 'hrm.assignments.manage', 'users.create'] } });
  const goaUser = (await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: goaHrId }, select: { userId: true } })).userId!;
  await prisma.user.update({ where: { id: goaUser }, data: { customRoleId: hrRole.id } });
  await prisma.hrmAccessScope.create({ data: { userId: goaUser, scopeType: 'STATE', stateId: 4039, includeChildren: true, activeFrom: istToday(), createdById: admin.id } });
  const goaHr = { userId: goaUser, role: 'EMPLOYEE' };
  const goaList = await getHrmManagerOptions(goaHr, { stateId: '4039' });
  check('Goa HR is offered the charge holder from Maharashtra', goaList.preselect?.id === mhManager, goaList.preselect?.name ?? 'none');
  const goaAdded: any = await add(goaHr, 'Mona', { stateId: 4039, cityId: 133600, customRoleId: role.id, managerEmployeeId: mhManager });
  check('what the list offers also saves for Goa HR', (await managerOf(goaAdded.employee.id)) === mhManager);
  const outsideManager = await failure(() => add(goaHr, 'Nikhil', { stateId: 4039, cityId: 133600, managerEmployeeId: hari }));
  check('a manager outside their access is still refused', outsideManager.includes('MANAGER_NOT_FOUND'), outsideManager);
}

main()
  .then(() => { console.log(results.join('\n')); const failed = results.filter((line) => line.startsWith('FAIL')).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0); })
  .catch((error) => { console.log(results.join('\n')); console.error(error); process.exit(1); });
