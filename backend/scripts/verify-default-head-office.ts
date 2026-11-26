/**
 * End-to-end check of the default head office: marking it, what may not be switched off or deleted, and where an
 * employee, an assignment or an offer goes with and without a chosen head office. It writes real rows, so it ONLY runs
 * against a local scratch database (see scratch-db-guard.ts):
 *
 *   createdb jcbexchange_hrm_scratch
 *   $env:DATABASE_URL="postgresql://postgres:<password>@localhost:5432/jcbexchange_hrm_scratch?schema=public"
 *   npx prisma db push
 *   npx tsx scripts/verify-default-head-office.ts
 *
 * Run it on a fresh scratch database (drop and create it again for a second run).
 */
import './scratch-db-guard';
import prisma from '../src/lib/prisma';
import * as org from '../src/modules/hrm/services/organisation.service';
import * as life from '../src/modules/hrm/services/officeLifecycle.service';
import { getEmployeeFormOptions, onboardEmployeeWithLogin } from '../src/modules/hrm/services/employeeOnboarding.service';
import { ensureSystemDesignations } from '../src/modules/hrm/services/designation.service';
import { handOfferToHrm } from '../src/modules/hrm/services/offerHandoff.service';
import { getOfferFormOptions, resolveOfferPlacement } from '../src/modules/hrm/services/offerPlacement.service';
import { getHrmManagerOptions } from '../src/modules/hrm/services/managerOptions.service';
import { istToday } from '../src/modules/hrm/istDate';

const results: string[] = [];
const check = (label: string, ok: boolean, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  -> ' + extra : ''}`); };
const failure = async (work: () => Promise<unknown>) => { try { await work(); return 'ok'; } catch (error: any) { return `${error.statusCode ?? error.name}:${error.code ?? ''}:${String(error.message).slice(0, 160)}`; } };
const day = (offset: number) => new Date(istToday().getTime() + offset * 86_400_000);
const text = (offset: number) => day(offset).toISOString().slice(0, 10);
const stamp = Date.now().toString(36);
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

const GEO = [
  ['Chhattisgarh', 4040, 'CT', [[133590, 'Raipur'], [133595, 'Bhilai']]],
  ['Gujarat', 4041, 'GJ', [[133591, 'Ahmedabad']]],
  ['Maharashtra', 4042, 'MH', [[133592, 'Mumbai']]],
] as const;

async function main() {
  await prisma.country.upsert({ where: { id: 101 }, update: {}, create: { id: 101, name: 'India', iso2: 'IN', iso3: 'IND' } });
  for (const [name, id, stateCode, cities] of GEO) {
    await prisma.state.upsert({ where: { id }, update: {}, create: { id, name, countryId: 101, countryCode: 'IN', stateCode } });
    for (const [cityId, city] of cities) await prisma.city.upsert({ where: { id: cityId }, update: {}, create: { id: cityId, name: city, stateId: id, countryId: 101, stateCode, countryCode: 'IN' } });
  }
  await ensureSystemDesignations(prisma);
  const admin = await prisma.user.create({ data: { name: 'Admin', email: `admin-${stamp}@probe.test`, mobile: mobile(), password: 'x', role: 'SUPER_ADMIN', status: 'ACTIVE' } });
  const actor = { userId: admin.id, role: 'SUPER_ADMIN' };
  await prisma.hrmDesignation.upsert({ where: { nameKey: 'sales executive' }, create: { name: 'Sales Executive', nameKey: 'sales executive' }, update: {} });

  const defaults = async () => (await prisma.hrmOrgUnit.findMany({ where: { type: 'HEAD_OFFICE', isDefault: true }, select: { id: true } })).map((row) => row.id);
  const onlyDefault = async (id: string) => (await defaults()).join() === id;

  // 1. The mark
  check('no head office: nothing to offer', (await getEmployeeFormOptions(actor)).headOffices.length === 0);
  await org.setupHeadOffice(actor, { stateId: 4040, cityId: 133590, departments: ['Sales'] });
  const raipur = await prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'HEAD_OFFICE' } });
  check('the first head office is the default', await onlyDefault(raipur.id));
  const mumbai = (await org.createOrganisationUnit(actor, { kind: 'HEAD_OFFICE', name: 'Mumbai Office', stateId: 4042, cityId: 133592 })).unit;
  check('a second one without the tick leaves the default', await onlyDefault(raipur.id));
  const amd = (await org.createOrganisationUnit(actor, { kind: 'HEAD_OFFICE', name: 'Ahmedabad Office', stateId: 4041, cityId: 133591, isDefault: true })).unit;
  check('created with the tick: it becomes the only default', await onlyDefault(amd.id));
  await org.updateOrganisationUnit(actor, mumbai.id, { isDefault: true });
  check('ticking another moves the default', await onlyDefault(mumbai.id));
  check('the change is in the audit trail', (await prisma.auditLog.count({ where: { entityId: mumbai.id, action: 'DEFAULT_HEAD_OFFICE_SET' } })) === 1);
  const page = await org.getOrganisation(actor);
  check('organisation page marks exactly that one', page.units.filter((unit) => unit.isDefault).map((unit) => unit.id).join() === mumbai.id);
  let choices = (await getEmployeeFormOptions(actor)).headOffices;
  check('forms list every head office, the default first', choices.length === 3 && choices[0]!.id === mumbai.id && choices[0]!.isDefault && choices.filter((row) => row.isDefault).length === 1 && choices[0]!.cityName === 'Mumbai');
  await org.updateOrganisationUnit(actor, raipur.id, { isDefault: true });
  check('and back to Raipur', await onlyDefault(raipur.id));
  const off = await failure(() => org.updateOrganisationUnit(actor, raipur.id, { isActive: false }));
  check('the default cannot be switched off while others exist', off.includes('Make another head office the default first'), off);
  const del = await failure(() => org.deleteOrganisationUnit(actor, raipur.id));
  check('nor deleted', del.includes('Make another head office the default first'), del);
  await org.createStateOffices(actor, { stateIds: [4040] });
  const stateUnit = await prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'REGION', stateId: 4040 } });
  const wrong = await failure(() => org.updateOrganisationUnit(actor, stateUnit.id, { isDefault: true }));
  check('a state office cannot be the default', wrong.includes('NOT_A_HEAD_OFFICE'), wrong);

  // Departments follow the default where no head office is chosen
  const parentOf = async (id: string) => (await prisma.hrmOrgUnit.findUniqueOrThrow({ where: { id }, select: { parentId: true } })).parentId;
  const accounts = (await org.createOrganisationUnit(actor, { kind: 'DEPARTMENT', name: 'Accounts' })).unit;
  check('a new department goes to the default head office', (await parentOf(accounts.id)) === raipur.id);
  const temporary = (await org.createOrganisationUnit(actor, { kind: 'HEAD_OFFICE', name: 'Temporary Office', stateId: 4040, cityId: 133595 })).unit;
  await prisma.hrmOrgUnit.update({ where: { id: accounts.id }, data: { parentId: temporary.id } });
  await org.deleteOrganisationUnit(actor, temporary.id);
  check('deleting another head office moves its departments to the default', (await parentOf(accounts.id)) === raipur.id);
  await prisma.hrmOrgUnit.update({ where: { id: accounts.id }, data: { parentId: amd.id } });

  // 2. Add employee
  const department = await prisma.hrmOrgUnit.findFirstOrThrow({ where: { type: 'DEPARTMENT', name: 'Sales' }, select: { id: true, name: true } });
  const add = async (name: string, extra: Record<string, unknown>) => {
    const made: any = await onboardEmployeeWithLogin(actor, {
      fullName: `${name} Probe`, email: `${name.toLowerCase()}-${stamp}@probe.test`, mobile: mobile(), password: 'Probe@12345', employmentType: 'FULL_TIME',
      orgUnitId: department.id, designation: 'Sales Executive', joiningDate: text(-20), locationType: 'HEAD_OFFICE', ...extra,
    });
    await prisma.hrmEmployee.update({ where: { id: made.employee.id }, data: { status: 'ACTIVE' } });
    return made.employee.id as string;
  };
  const posting = (employeeId: string) => prisma.hrmEmploymentAssignment.findFirstOrThrow({ where: { employeeId, status: 'ACTIVE' }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] });
  const asha = await add('Asha', {});
  let row = await posting(asha);
  check('no head office chosen: the default and its city', row.officeUnitId === raipur.id && row.stateId === 4040 && row.cityId === 133590);
  const bela = await add('Bela', { headOfficeUnitId: mumbai.id, stateId: 4040, cityId: 133595 });
  row = await posting(bela);
  check('the chosen one, with its own place (a sent city is ignored)', row.officeUnitId === mumbai.id && row.stateId === 4042 && row.cityId === 133592);
  const chet = await add('Chet', { locationType: 'STATE_OFFICE', stateId: 4040, cityId: 133590 });
  row = await posting(chet);
  check('State office in the head office city stays a state office', row.officeUnitId === stateUnit.id);
  const unknown = await failure(() => add('Dina', { headOfficeUnitId: stateUnit.id }));
  check('a unit that is not a head office is refused', unknown.includes('HEAD_OFFICE_NOT_FOUND'), unknown);

  // 3. Add assignment
  const blank = async (name: string) => (await prisma.hrmEmployee.create({ data: { employeeCode: `X-${name}-${stamp}`.slice(0, 30), legalName: `${name} Blank`, status: 'ACTIVE', source: 'DIRECT_HR', createdById: admin.id } })).id;
  const base = { orgUnitId: department.id, designation: 'Sales Executive', effectiveFrom: text(0) };
  const e1 = await blank('E1');
  await life.addAssignment(actor, e1, { ...base, locationType: 'HEAD_OFFICE' });
  row = await posting(e1);
  check('assignment: head office without a choice uses the default', row.officeUnitId === raipur.id && row.cityId === 133590);
  const e2 = await blank('E2');
  await life.addAssignment(actor, e2, { ...base, locationType: 'HEAD_OFFICE', headOfficeUnitId: amd.id });
  row = await posting(e2);
  check('assignment: the chosen head office', row.officeUnitId === amd.id && row.stateId === 4041 && row.cityId === 133591);
  const e3 = await blank('E3');
  await life.addAssignment(actor, e3, { ...base, locationType: 'STATE_OFFICE', stateId: 4040, cityId: 133590 });
  row = await posting(e3);
  check('assignment: State office in the head office city', row.officeUnitId === stateUnit.id);
  const e4 = await blank('E4');
  await life.addAssignment(actor, e4, { ...base, stateId: 4040, cityId: 133590 });
  row = await posting(e4);
  check('assignment without a location type keeps the older rule', row.officeUnitId === raipur.id);
  const managers = await getHrmManagerOptions(actor, { stateId: '4040' });
  check('manager list: a state is the state, whatever the head office city', managers.target.kind === 'STATE');

  // 4. Offers
  const placement = (extra: Record<string, unknown>) => resolveOfferPlacement({ hrmOrgUnitId: department.id, designation: 'Sales Executive', locationType: 'HEAD_OFFICE', ...extra });
  const plain = await placement({});
  check('offer without a choice: the default head office', plain?.headOfficeUnitId === raipur.id && plain.cityName === 'Raipur' && plain.placeOfPosting === 'Head Office, Raipur, Chhattisgarh', plain?.placeOfPosting ?? '');
  const chosen = await placement({ headOfficeUnitId: mumbai.id, stateId: '4040', cityId: '133595' });
  check('offer: the chosen head office and its place', chosen?.headOfficeUnitId === mumbai.id && chosen.cityName === 'Mumbai');
  const offerForm = await getOfferFormOptions({ all: true } as never);
  check('offer form lists them, the default first', offerForm.headOffices.length === 3 && offerForm.headOffices[0]!.id === raipur.id);

  const jobDepartment = await prisma.jobDepartment.upsert({ where: { code: 'PROBE' }, update: {}, create: { name: 'Probe Dept', code: 'PROBE' } });
  const job = await prisma.job.create({ data: { title: 'Probe Job', slug: `probe-${stamp}`, jobCode: `PRB-${stamp}`, departmentId: jobDepartment.id, locationCity: 'Raipur', locationState: 'Chhattisgarh', description: 'probe' } });
  const acceptedOffer = async (key: string, over: Record<string, unknown>) => {
    const candidate = await prisma.candidate.create({ data: { fullName: `Offer ${key}`, email: `offer-${key}-${stamp}@probe.test`, mobile: mobile() } });
    const application = await prisma.jobApplication.create({ data: { applicationRef: `APP-${key}-${stamp}`, jobId: job.id, candidateId: candidate.id, currentStage: 'OFFER_ACCEPTED' } });
    return prisma.offer.create({
      data: {
        applicationId: application.id, candidateId: candidate.id, jobId: job.id, designation: 'Sales Executive', department: department.name, joiningLocation: 'Raipur', ctc: 30000,
        joiningDate: day(7), status: 'ACCEPTED', respondedAt: new Date(), acceptanceMethod: 'TYPED', acceptedName: `Offer ${key}`, acceptedPlace: 'Raipur', documentHash: 'a'.repeat(64),
        hrmHandoffStatus: 'PENDING', hrmOrgUnitId: department.id, locationType: 'HEAD_OFFICE', stateId: 4042, cityId: 133592, employmentType: 'FULL_TIME', createdById: admin.id, ...over,
      },
    });
  };
  const handed = async (offerId: string) => { const result: any = await handOfferToHrm(offerId); return result.employeeId ? { result, assignment: await prisma.hrmEmploymentAssignment.findFirst({ where: { employeeId: result.employeeId, status: 'ACTIVE' } }) } : { result, assignment: null }; };
  const first = await acceptedOffer('chosen', { headOfficeUnitId: mumbai.id });
  const h1 = await handed(first.id);
  check('accepted offer goes to the head office on it', h1.assignment?.officeUnitId === mumbai.id, JSON.stringify(h1.result));
  const old = await acceptedOffer('old', { stateId: 4040, cityId: 133590 });
  const h2 = await handed(old.id);
  check('an older offer (none named) goes to the default', h2.assignment?.officeUnitId === raipur.id);

  // 5. Offers hold their head office; the others can be switched off
  const waiting = await acceptedOffer('hold', { status: 'SENT', headOfficeUnitId: amd.id, hrmHandoffStatus: null });
  const e2End = await prisma.hrmEmploymentAssignment.updateMany({ where: { officeUnitId: amd.id }, data: { status: 'CANCELLED' } });
  check('(the Ahmedabad assignment is cleared for the next check)', e2End.count === 1);
  const held = await failure(() => org.updateOrganisationUnit(actor, amd.id, { isActive: false }));
  check('a head office with an open offer is not switched off', held.includes('open offer'), held);
  await prisma.offer.update({ where: { id: waiting.id }, data: { status: 'WITHDRAWN' } });
  await org.updateOrganisationUnit(actor, amd.id, { isActive: false });
  check('without it, a non-default head office is switched off; the default stays', await onlyDefault(raipur.id));
  check('its departments move to the default', (await parentOf(accounts.id)) === raipur.id);
  choices = (await getEmployeeFormOptions(actor)).headOffices;
  check('a switched off head office is not offered', choices.length === 2 && !choices.some((item) => item.id === amd.id));
  const inactive = await failure(() => org.updateOrganisationUnit(actor, amd.id, { isDefault: true }));
  check('a switched off head office cannot be the default', inactive.includes('switched off'), inactive);
  const gone = await acceptedOffer('gone', { headOfficeUnitId: amd.id });
  const h3 = await handed(gone.id);
  check('an offer whose head office was switched off is not moved elsewhere', !h3.assignment && JSON.stringify(h3.result).includes('switched off or removed'), JSON.stringify(h3.result).slice(0, 200));
  const inactiveChoice = await failure(() => add('Esha', { headOfficeUnitId: amd.id }));
  check('add employee refuses a switched off head office', inactiveChoice.includes('HEAD_OFFICE_NOT_FOUND'), inactiveChoice);

  // An older offer (no head office named) holds, and goes to, the head office at its place
  const oldAtMumbai = await acceptedOffer('oldmum', { stateId: 4042, cityId: 133592 });
  await prisma.hrmEmploymentAssignment.updateMany({ where: { officeUnitId: mumbai.id }, data: { status: 'CANCELLED' } });
  const heldOld = await failure(() => org.updateOrganisationUnit(actor, mumbai.id, { isActive: false }));
  check('an older open offer at its place holds a head office', heldOld.includes('open offer'), heldOld);
  const h4 = await handed(oldAtMumbai.id);
  check('and is handed over there, not to the default', h4.assignment?.officeUnitId === mumbai.id && h4.assignment.cityId === 133592, JSON.stringify(h4.result).slice(0, 200));

  // A head office that moved: the new posting records the new place
  const beforeMove = await acceptedOffer('moved', { headOfficeUnitId: mumbai.id });
  await org.updateOrganisationUnit(actor, mumbai.id, { stateId: 4040, cityId: 133595 });
  const h5 = await handed(beforeMove.id);
  check('offer of a moved head office: the office and its new place', h5.assignment?.officeUnitId === mumbai.id && h5.assignment.stateId === 4040 && h5.assignment.cityId === 133595, JSON.stringify(h5.result).slice(0, 200));
  await org.updateOrganisationUnit(actor, mumbai.id, { stateId: 4042, cityId: 133592 });

  // A head office without a place is neither made the default nor given another office's place
  const bare = await prisma.hrmOrgUnit.create({ data: { code: 'HO-BARE', name: 'Bare Office', type: 'HEAD_OFFICE', createdById: admin.id } });
  const bareDefault = await failure(() => org.updateOrganisationUnit(actor, bare.id, { isDefault: true }));
  check('a head office without a place cannot be the default', bareDefault.includes('state and city'), bareDefault);
  const bareMove = await failure(() => life.transferEmployee(actor, asha, { toOfficeUnitId: bare.id, effectiveFrom: text(1) }));
  check('nobody is moved there with another office\'s place', bareMove.includes('HEAD_OFFICE_LOCATION_MISSING'), bareMove);
  await org.deleteOrganisationUnit(actor, bare.id);

  // 6. Older data without a mark behaves like the default was the oldest
  await prisma.hrmOrgUnit.updateMany({ where: { type: 'HEAD_OFFICE' }, data: { isDefault: false } });
  choices = (await getEmployeeFormOptions(actor)).headOffices;
  check('nothing marked: the oldest is used and shown as default', choices[0]!.id === raipur.id && choices[0]!.isDefault);
  await org.updateOrganisationUnit(actor, mumbai.id, { name: 'Mumbai Corporate Office' });
  check('the next change writes the mark', await onlyDefault(raipur.id));
}

main()
  .then(() => { console.log(results.join('\n')); const failed = results.filter((line) => line.startsWith('FAIL')).length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0); })
  .catch((error) => { console.log(results.join('\n')); console.error(error); process.exit(1); });
