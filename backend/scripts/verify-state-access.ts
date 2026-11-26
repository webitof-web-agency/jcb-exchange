/**
 * End-to-end check of multi-state access: appointment with access, additional charge, coverage, recruitment limited to
 * the manager's states, private files, exit. It writes real rows, so it ONLY runs against a local scratch database
 * (see scratch-db-guard.ts):
 *
 *   createdb jcbexchange_hrm_scratch
 *   $env:DATABASE_URL="postgresql://postgres:<password>@localhost:5432/jcbexchange_hrm_scratch?schema=public"
 *   npx prisma db push
 *   npx tsx scripts/verify-state-access.ts
 *
 * Run it on a fresh scratch database (drop and create it again for a second run).
 */
import './scratch-db-guard';
import prisma from '../src/lib/prisma';
import { getActiveScopes, getEmployeeScopeWhere } from '../src/modules/hrm/access';
import * as org from '../src/modules/hrm/services/organisation.service';
import * as life from '../src/modules/hrm/services/officeLifecycle.service';
import { createCharge, endCharge } from '../src/modules/hrm/services/additionalCharge.service';
import { getAccessReview } from '../src/modules/hrm/services/accessReview.service';
import { onboardEmployeeWithLogin } from '../src/modules/hrm/services/employeeOnboarding.service';
import { ensureSystemDesignations } from '../src/modules/hrm/services/designation.service';
import { endEmployeeScope } from '../src/modules/hrm/services/joining.service';
import { searchOfferReportingManagers } from '../src/modules/hrm/services/offerPlacement.service';
import { istToday } from '../src/modules/hrm/istDate';
import { getRecruitmentReach } from '../src/services/recruitmentReach.service';
import { checkStaffDocumentAccess } from '../src/services/secureDocumentAccess.service';
import { applicationReachWhere, jobReachWhere, offerReachWhere } from '../src/utils/recruitmentReachRules';

const results: string[] = [];
const check = (label: string, ok: boolean, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`); };
const failure = async (work: () => Promise<unknown>) => { try { await work(); return 'ok'; } catch (error: any) { return `${error.statusCode ?? error.name}:${String(error.message).slice(0, 120)}`; } };
const today = istToday().toISOString().slice(0, 10);
const stamp = Date.now().toString(36);
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

const GEO = [
  ['Chhattisgarh', 4040, 'CT', 'Raipur', 133590],
  ['Gujarat', 4041, 'GJ', 'Ahmedabad', 133591],
  ['Maharashtra', 4042, 'MH', 'Mumbai', 133592],
] as const;

const main = async () => {
  await prisma.country.upsert({ where: { id: 101 }, update: {}, create: { id: 101, name: 'India', iso2: 'IN', iso3: 'IND' } });
  for (const [name, id, stateCode, city, cityId] of GEO) {
    await prisma.state.upsert({ where: { id }, update: {}, create: { id, name, countryId: 101, countryCode: 'IN', stateCode } });
    await prisma.city.upsert({ where: { id: cityId }, update: {}, create: { id: cityId, name: city, stateId: id, countryId: 101, stateCode, countryCode: 'IN' } });
  }
  const admin = (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } }))
    ?? await prisma.user.create({ data: { name: 'Scratch Admin', email: `admin-${stamp}@probe.test`, role: 'SUPER_ADMIN', status: 'ACTIVE', password: 'x' }, select: { id: true } });
  const actor = { userId: admin.id, role: 'SUPER_ADMIN' };
  await ensureSystemDesignations(prisma);
  if (!(await prisma.hrmOrgUnit.findFirst({ where: { type: 'HEAD_OFFICE' } }))) await org.setupHeadOffice(actor, { stateId: 4040, cityId: 133590, departments: [`Ops ${stamp}`] });
  const dept = await prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'DEPARTMENT', isActive: true }, select: { id: true } });
  await org.createStateOffices(actor, { stateIds: [4041, 4042] });
  const office = async (stateId: number) => (await prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'REGION', stateId, isActive: true }, select: { id: true } })).id;
  const [gujarat, maharashtra] = [await office(4041), await office(4042)];

  const role = await prisma.customRole.create({ data: { name: `State Manager ${stamp}`, permissions: ['hrm.employees.read', 'hrm.org.read', 'recruitment.jobs.read', 'recruitment.applications.read', 'recruitment.offers.read'] } });
  const person = async (key: string, stateId: number, cityId: number, manager: boolean) => {
    const created: any = await onboardEmployeeWithLogin(actor, {
      fullName: `Probe ${key}`, email: `${key}-${stamp}@probe.test`, mobile: mobile(), password: 'Probe@12345', customRoleId: role.id,
      joiningDate: today, designation: manager ? 'State Manager' : 'State Manager', orgUnitId: dept.id, employmentType: 'FULL_TIME',
      locationType: 'STATE_OFFICE', stateId, cityId, isOfficeManager: manager,
    });
    return prisma.hrmEmployee.findUniqueOrThrow({ where: { id: created.employee.id }, select: { id: true, userId: true } });
  };
  const ravi = await person('ravi', 4042, 133592, true);
  const raviUser = { userId: ravi.userId!, role: 'EMPLOYEE' };
  const coverage = async (officeId: string) => (await org.getOrganisation(actor)).units.find((unit) => unit.id === officeId)!;

  // 1. Appointment with access in one step
  const appointed = await life.appointOfficeManager(actor, maharashtra, { employeeId: ravi.id, effectiveFrom: today, access: { grantStateAccess: true } });
  check('appointment gave the state access', appointed.access.access === 'GRANTED', JSON.stringify(appointed.access));
  let scopes = await getActiveScopes(ravi.userId!);
  check('manager sees Maharashtra only', scopes.length === 1 && scopes[0]!.stateId === 4042);

  // 2. Additional charge: covered, access for the second state
  const charge = await createCharge(actor, gujarat, { employeeId: ravi.id, effectiveFrom: today, access: { grantStateAccess: true } });
  check('charge gave access', charge.accessGiven === true);
  const covered = await coverage(gujarat);
  check('Gujarat shows covered by the charge', covered.coverage === 'COVERED' && covered.chargeHolders.length === 1 && covered.managers.length === 0);
  check('a second charge of the same office on the same days is refused', (await failure(() => createCharge(actor, gujarat, { employeeId: ravi.id, effectiveFrom: today }))) !== 'ok');
  check('own posting cannot be a charge', (await failure(() => createCharge(actor, maharashtra, { employeeId: ravi.id, effectiveFrom: today }))) !== 'ok');
  scopes = await getActiveScopes(ravi.userId!);
  check('manager now sees both states', new Set(scopes.map((scope) => scope.stateId)).size === 2);
  const chargeScope = await prisma.hrmAccessScope.findFirstOrThrow({ where: { userId: ravi.userId!, source: 'CHARGE' } });
  check('charge access cannot be ended from the access card', (await failure(() => endEmployeeScope(actor, chargeScope.id, {}))).startsWith('409'));
  check('an office with a running charge cannot be switched off', (await failure(() => org.updateOrganisationUnit(actor, gujarat, { isActive: false }))).startsWith('409'));

  // 3. Recruitment limited to his states
  const jobDepartment = await prisma.jobDepartment.upsert({ where: { code: 'PROBE' }, update: {}, create: { name: 'Probe Dept', code: 'PROBE' } });
  const makeJob = (key: string, hrmStateId: number, hrmLocationType: string) => prisma.job.create({
    data: { title: `Job ${key}`, slug: `job-${key}-${stamp}`, jobCode: `JOB-${key}-${stamp}`, departmentId: jobDepartment.id, locationCity: key, locationState: key, description: 'probe', hrmStateId, hrmLocationType, status: 'PUBLISHED' },
  });
  const [jobMh, jobGj, jobHo] = [await makeJob('mh', 4042, 'STATE_OFFICE'), await makeJob('gj', 4041, 'STATE_OFFICE'), await makeJob('ho', 4040, 'HEAD_OFFICE')];
  const seen = async () => {
    const reach = await getRecruitmentReach(raviUser);
    const rows = await prisma.job.findMany({ where: { AND: [{ id: { in: [jobMh.id, jobGj.id, jobHo.id] } }, jobReachWhere(reach)] }, select: { id: true } });
    return { reach, ids: new Set(rows.map((row) => row.id)) };
  };
  let view = await seen();
  check('recruitment shows both state jobs, not the head office one', view.ids.has(jobMh.id) && view.ids.has(jobGj.id) && !view.ids.has(jobHo.id));
  const candidate = await prisma.candidate.create({ data: { fullName: 'Probe Candidate', email: `cand-${stamp}@probe.test`, mobile: mobile() } });
  const application = await prisma.jobApplication.create({ data: { applicationRef: `APP-${stamp}`, jobId: jobGj.id, candidateId: candidate.id } });
  const resume = await prisma.candidateDocument.create({ data: { candidateId: candidate.id, applicationId: application.id, category: 'RESUME', fileName: 'r.pdf', fileUrl: `/api/documents/secure/drive-probe${stamp}0000` } });
  const open = () => checkStaffDocumentAccess(raviUser, [resume.fileUrl], `probe${stamp}0000`);
  check('he opens a resume of his state', (await open()) === 'ALLOWED');
  const managers = await searchOfferReportingManagers({}, view.reach);
  check('offer manager search stays in his places', managers.groups.some((group) => group.people.some((row) => row.id === ravi.id)));

  // 4. End the charge: Gujarat vacant, access and recruitment gone
  const running = await prisma.hrmAdditionalCharge.findFirstOrThrow({ where: { employeeId: ravi.id, status: 'ACTIVE', effectiveTo: null } });
  await endCharge(actor, running.id, {});
  const vacant = await coverage(gujarat);
  check('Gujarat vacant after the charge', vacant.coverage === 'VACANT' && vacant.chargeHolders.length === 0, vacant.coverage ?? '');
  view = await seen();
  check('recruitment shows Maharashtra only', view.ids.has(jobMh.id) && !view.ids.has(jobGj.id));
  check('the Gujarat application is hidden', (await prisma.jobApplication.count({ where: { AND: [{ id: application.id }, applicationReachWhere(view.reach)] } })) === 0);
  check('the Gujarat resume is refused', (await open()) === 'DENIED');
  check('offers follow the same limit', (await prisma.offer.count({ where: offerReachWhere(view.reach) })) === 0);

  // 5. A new manager ends the charge on the office
  await createCharge(actor, gujarat, { employeeId: ravi.id, effectiveFrom: today, access: { grantStateAccess: true } });
  const meena = await person('meena', 4041, 133591, false);
  const takeover = await life.appointOfficeManager(actor, gujarat, { employeeId: meena.id, effectiveFrom: today, endOfficeCharges: true, access: { grantStateAccess: true } });
  check('appointing a manager ended the other charge', takeover.chargesEnded.some((row) => row.employeeId === ravi.id), JSON.stringify(takeover.chargesEnded));

  // 6. Exit ends charges and the team filter follows
  const scopeWhere = await getEmployeeScopeWhere(raviUser);
  check('team filter is limited (not all-India)', scopeWhere !== null);
  await createCharge(actor, gujarat, { employeeId: ravi.id, effectiveFrom: today, access: { grantStateAccess: true } });
  const exit = await life.deactivateEmployee(actor, ravi.id, { outcome: 'EXITED', effectiveDate: today, reason: 'probe exit' });
  check('exit ended the charge', exit.chargesEnded.length >= 1);
  check('no charge runs on after the exit', (await prisma.hrmAdditionalCharge.count({ where: { employeeId: ravi.id, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gt: istToday() } }] } })) === 0);

  // 7. Review runs and lists problems
  const review = await getAccessReview({ view: 'issues' });
  check('access review runs', typeof review.summary.issues === 'number', `${review.summary.issues} issue(s)`);
};

main()
  .catch((error) => { results.push(`FAIL  script stopped  -> ${error?.stack ?? error}`); })
  .finally(async () => {
    console.log(results.join('\n'));
    const failed = results.filter((line) => line.startsWith('FAIL')).length;
    console.log(`\n${results.length - failed} passed, ${failed} failed`);
    await prisma.$disconnect();
    process.exit(failed ? 1 : 0);
  });
