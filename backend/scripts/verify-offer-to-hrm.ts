/**
 * End-to-end check of "accepted offer -> HRM pre-joining record" (Phase 3). It writes real rows, so it ONLY runs
 * against a local scratch database (see scratch-db-guard.ts):
 *
 *   createdb jcbexchange_hrm_scratch
 *   $env:DATABASE_URL="postgresql://postgres:<password>@localhost:5432/jcbexchange_hrm_scratch?schema=public"
 *   npx prisma db push
 *   npx tsx scripts/verify-offer-to-hrm.ts
 *
 * Offers are inserted as already accepted (no Google Drive needed); the signing itself is covered by unit tests.
 */
import './scratch-db-guard';
import prisma from '../src/lib/prisma';
import * as org from '../src/modules/hrm/services/organisation.service';
import { handOfferToHrm, retryPendingOfferHandoffs } from '../src/modules/hrm/services/offerHandoff.service';
import { ensureSystemDesignations } from '../src/modules/hrm/services/designation.service';

const results: string[] = [];
const check = (label: string, ok: boolean, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`); };
const day = (offset: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + offset));
const stamp = Date.now().toString(36);

const main = async () => {
  await prisma.country.upsert({ where: { id: 101 }, update: {}, create: { id: 101, name: 'India', iso2: 'IN', iso3: 'IND' } });
  for (const [name, id, stateCode, city, cityId] of [['Chhattisgarh', 4040, 'CT', 'Raipur', 133590], ['Maharashtra', 4042, 'MH', 'Pune', 133592]] as const) {
    await prisma.state.upsert({ where: { id }, update: {}, create: { id, name, countryId: 101, countryCode: 'IN', stateCode } });
    await prisma.city.upsert({ where: { id: cityId }, update: {}, create: { id: cityId, name: city, stateId: id, countryId: 101, stateCode, countryCode: 'IN' } });
  }
  const admin = (await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } }))
    ?? await prisma.user.create({ data: { name: 'Scratch Admin', email: `admin-${stamp}@probe.test`, role: 'SUPER_ADMIN', status: 'ACTIVE', password: 'x' }, select: { id: true } });
  const actor = { userId: admin.id, role: 'SUPER_ADMIN' };
  await ensureSystemDesignations();
  await prisma.hrmDesignation.upsert({ where: { nameKey: 'probe executive' }, update: { isActive: true }, create: { name: 'Probe Executive', nameKey: 'probe executive' } });

  if (!(await prisma.hrmOrgUnit.findFirst({ where: { type: 'HEAD_OFFICE' } }))) await org.setupHeadOffice(actor, { stateId: 4040, cityId: 133590, departments: ['ProbeSales'] });
  const dept = await prisma.hrmOrgUnit.findFirst({ where: { type: 'DEPARTMENT', isActive: true }, select: { id: true, name: true } })
    ?? await prisma.hrmOrgUnit.create({ data: { code: `DEP-PROBE-${stamp}`, name: `ProbeSales ${stamp}`, type: 'DEPARTMENT', isActive: true }, select: { id: true, name: true } });

  const jobDepartment = await prisma.jobDepartment.upsert({ where: { code: 'PROBE' }, update: {}, create: { name: 'Probe Dept', code: 'PROBE' } });
  const job = await prisma.job.create({ data: { title: 'Probe Job', slug: `probe-${stamp}`, jobCode: `PRB-${stamp}`, departmentId: jobDepartment.id, locationCity: 'Pune', locationState: 'Maharashtra', description: 'probe' } });

  const makeAcceptedOffer = async (key: string, over: Record<string, unknown> = {}) => {
    const candidate = await prisma.candidate.create({ data: { fullName: `Probe ${key}`, email: `${key}-${stamp}@probe.test`, mobile: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}` } });
    const application = await prisma.jobApplication.create({ data: { applicationRef: `APP-${key}-${stamp}`, jobId: job.id, candidateId: candidate.id, currentStage: 'OFFER_ACCEPTED' } });
    return prisma.offer.create({
      data: {
        applicationId: application.id, candidateId: candidate.id, jobId: job.id,
        designation: 'Probe Executive', department: dept.name, joiningLocation: 'Pune, Maharashtra', ctc: 30000,
        joiningDate: day(7), status: 'ACCEPTED', respondedAt: new Date(), acceptanceMethod: 'TYPED', acceptedName: `Probe ${key}`, acceptedPlace: 'Pune',
        documentHash: 'a'.repeat(64), hrmHandoffStatus: 'PENDING',
        hrmOrgUnitId: dept.id, locationType: 'STATE_OFFICE', stateId: 4042, cityId: 133592, employmentType: 'FULL_TIME', annualCtc: 360000,
        salaryComponents: [{ code: 'BASIC', name: 'Basic salary', componentType: 'EARNING', monthlyAmount: 20000 }, { code: 'HRA', name: 'HRA', componentType: 'EARNING', monthlyAmount: 10000 }],
        offerLetterData: { offerLetterNo: `JCB/OFFER/${key}`, salaryPeriod: 'month' },
        createdById: admin.id,
        ...over,
      },
      include: { candidate: true },
    });
  };

  // 1. a new person: employee, assignment, salary, case, evidence; Maharashtra office created on the way
  const first = await makeAcceptedOffer('new');
  const r1 = await handOfferToHrm(first.id);
  check('new person -> CREATED', r1.outcome === 'CREATED', JSON.stringify(r1));
  if (r1.outcome !== 'NEEDS_REVIEW') {
    const employee = await prisma.hrmEmployee.findUniqueOrThrow({ where: { id: r1.employeeId }, include: { assignments: true, compensationHistory: { include: { components: true } }, documents: true } });
    check('employee is PRE_ONBOARDING with EMP-#### code', employee.status === 'PRE_ONBOARDING' && /^EMP-\d{4,}$/.test(employee.employeeCode), employee.employeeCode);
    check('personal email set, work email empty', employee.personalEmail === first.candidate.email && employee.workEmail === null);
    const assignment = employee.assignments[0];
    check('assignment from the offer (state office, joining date)', Boolean(assignment?.officeUnitId) && assignment?.stateId === 4042 && assignment?.effectiveFrom.toISOString().slice(0, 10) === day(7).toISOString().slice(0, 10));
    const salary = employee.compensationHistory[0];
    check('salary draft PENDING_APPROVAL with components', salary?.status === 'PENDING_APPROVAL' && salary.components.length === 2 && Number(salary.annualCtc) === 360000);
    const onboardingCase = await prisma.hrmOnboardingCase.findFirstOrThrow({ where: { offerId: first.id }, include: { acceptanceEvidence: true } });
    check('case IN_PROGRESS with evidence', onboardingCase.status === 'IN_PROGRESS' && Boolean(onboardingCase.acceptanceEvidence));
    const offerAfter = await prisma.offer.findUniqueOrThrow({ where: { id: first.id } });
    check('offer handoff DONE and linked', offerAfter.hrmHandoffStatus === 'DONE' && offerAfter.hrmEmployeeId === r1.employeeId);
  }

  // 2. running it again changes nothing
  const before = await prisma.hrmEmployee.count();
  const r2 = await handOfferToHrm(first.id);
  check('second run -> ALREADY_DONE, no new employee', r2.outcome === 'ALREADY_DONE' && (await prisma.hrmEmployee.count()) === before);

  // 3. same email as a live record -> NEEDS_REVIEW, nothing created
  const dupe = await makeAcceptedOffer('dupe');
  await prisma.candidate.update({ where: { id: dupe.candidateId }, data: { email: `x-${stamp}@probe.test` } });
  if (r1.outcome !== 'NEEDS_REVIEW') await prisma.hrmEmployee.update({ where: { id: r1.employeeId }, data: { personalEmail: `x-${stamp}@probe.test` } });
  const r3 = await handOfferToHrm(dupe.id);
  check('possible duplicate -> NEEDS_REVIEW', r3.outcome === 'NEEDS_REVIEW' && (await prisma.hrmEmployee.count()) === before, JSON.stringify(r3));

  // 4. rehire: the earlier record left -> re-opened, new case on the same record
  if (r1.outcome !== 'NEEDS_REVIEW') {
    await prisma.hrmEmployee.update({ where: { id: r1.employeeId }, data: { status: 'EXITED' } });
    const r4 = await handOfferToHrm(dupe.id);
    check('rehire -> REHIRED on the same record', r4.outcome === 'REHIRED' && 'employeeId' in r4 && r4.employeeId === r1.employeeId, JSON.stringify(r4));
    const cases = await prisma.hrmOnboardingCase.count({ where: { employeeId: r1.employeeId } });
    check('two onboarding cases on one record', cases === 2);
    const assignments = await prisma.hrmEmploymentAssignment.findMany({ where: { employeeId: r1.employeeId }, orderBy: { createdAt: 'asc' } });
    check('old assignment closed (cancelled: it had not started), one new open assignment',
      assignments.filter((a) => a.status === 'ACTIVE' && a.effectiveTo === null).length === 1 && assignments.some((a) => a.status === 'CANCELLED' || a.status === 'ENDED'),
      JSON.stringify(assignments.map((a) => [a.status, a.effectiveFrom.toISOString().slice(0, 10), a.effectiveTo?.toISOString().slice(0, 10) ?? null])));
    const salaries = await prisma.hrmCompensationRevision.findMany({ where: { employeeId: r1.employeeId } });
    check('old salary superseded, new one pending', salaries.some((x) => x.status === 'SUPERSEDED') && salaries.some((x) => x.status === 'PENDING_APPROVAL'));
  }

  // 5. no placement (old offer) -> employee created, case notes what is missing
  const legacy = await makeAcceptedOffer('legacy', { hrmOrgUnitId: null, locationType: null, stateId: null, cityId: null, salaryComponents: undefined, annualCtc: null });
  const r5 = await handOfferToHrm(legacy.id);
  check('offer without placement -> CREATED with notes', r5.outcome === 'CREATED' && r5.notes.length > 0, JSON.stringify(r5.notes));
  if (r5.outcome !== 'NEEDS_REVIEW') {
    const legacySalary = await prisma.hrmCompensationRevision.findFirst({ where: { employeeId: r5.employeeId } });
    check('offer without placement still gets its salary draft', Boolean(legacySalary), 'ctc only');
  }

  // 5b. same mobile, different person (name and email differ) and the old record left -> NEEDS_REVIEW, not a rehire
  const mobileOnly = await makeAcceptedOffer('mobileonly', { annualCtc: 240000 });
  if (r5.outcome !== 'NEEDS_REVIEW') {
    // The old record gets this candidate's mobile (candidates' mobiles are unique, HR records' are not).
    await prisma.hrmEmployee.update({ where: { id: r5.employeeId }, data: { status: 'EXITED', mobile: mobileOnly.candidate.mobile } });
    const r5b = await handOfferToHrm(mobileOnly.id);
    check('mobile-only match with a different name -> NEEDS_REVIEW (no silent rehire)', r5b.outcome === 'NEEDS_REVIEW', JSON.stringify(r5b));
  }

  // 6. background retry picks up a PENDING offer
  const pending = await makeAcceptedOffer('pending', { respondedAt: new Date(Date.now() - 10 * 60_000), updatedAt: new Date(Date.now() - 10 * 60_000) });
  const retried = await retryPendingOfferHandoffs(new Date());
  const pendingAfter = await prisma.offer.findUniqueOrThrow({ where: { id: pending.id } });
  check('background retry hands a pending offer over', retried.processed >= 1 && pendingAfter.hrmHandoffStatus === 'DONE', JSON.stringify(retried));

  console.log(results.join('\n'));
  console.log(results.some((line) => line.startsWith('FAIL')) ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
};

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
