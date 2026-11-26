import prisma from '../../../lib/prisma';
import type { Prisma } from '@prisma/client';
import type { RecruitmentReach } from '../../../utils/recruitmentReachRules';
import { activeChargeWhere } from '../additionalChargeRules';
import { utcToday } from '../assignmentTimeline';
import { HrmHttpError } from '../errors';
import { STATE_MANAGER_DESIGNATION, WORKING_STATUSES, currentAssignmentWhere, findNationalOperationsManagers } from '../officeAssignments';
import { listHeadOffices, requireHeadOffice } from '../officeUnits';
import { designationKey, ensureSystemDesignations, listActiveDesignations } from './designation.service';
import { parseHrmInput, schemas } from '../validation';
import { listManagerCandidates } from './managerOptions.service';

/**
 * The HRM placement chosen on a recruitment offer: department, designation (from the managed list), the office and
 * place of work, whether the person will manage that state office, employment type and reporting manager.
 *
 * It is checked against the same masters the Add Employee form uses, but nothing is created here: a state that has
 * no office yet gets one when the accepted offer is turned into an HRM record. Offers made before these fields
 * existed carry none of them and keep working (placement = null).
 */

export const OFFER_EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'FREELANCE'] as const;
export type OfferEmploymentType = (typeof OFFER_EMPLOYMENT_TYPES)[number];

export type OfferPlacementInput = {
  hrmOrgUnitId?: unknown;
  designation?: unknown;
  locationType?: unknown;
  headOfficeUnitId?: unknown;
  stateId?: unknown;
  cityId?: unknown;
  isOfficeManager?: unknown;
  employmentType?: unknown;
  reportingManagerEmployeeId?: unknown;
};

export type OfferPlacement = {
  hrmOrgUnitId: string;
  departmentName: string;
  designation: string;
  locationType: 'HEAD_OFFICE' | 'STATE_OFFICE';
  /** The head office of a head office posting; null for a state office. */
  headOfficeUnitId: string | null;
  stateId: number;
  stateName: string;
  cityId: number;
  cityName: string;
  isOfficeManager: boolean;
  employmentType: OfferEmploymentType;
  reportingManagerEmployeeId: string | null;
  reportingManagerName: string | null;
  /** "Head Office, Raipur, Chhattisgarh" or "Pune, Maharashtra": the place of posting printed on the letter. */
  placeOfPosting: string;
};

const fail = (code: string, message: string) => new HrmHttpError(400, code, message);

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const optionalInt = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : NaN;
};
const flag = (value: unknown) => value === true || value === 'true' || value === '1' || value === 1;

/** True when the request uses the HRM placement fields at all (a new-style offer). */
export const hasOfferPlacement = (input: OfferPlacementInput) =>
  Boolean(text(input.hrmOrgUnitId) || text(input.locationType));

export const resolveOfferPlacement = async (input: OfferPlacementInput): Promise<OfferPlacement | null> => {
  if (!hasOfferPlacement(input)) return null;

  const hrmOrgUnitId = text(input.hrmOrgUnitId);
  if (!hrmOrgUnitId) throw fail('DEPARTMENT_REQUIRED', 'Select the department.');
  const department = await prisma.hrmOrgUnit.findFirst({ where: { id: hrmOrgUnitId, type: 'DEPARTMENT', isActive: true }, select: { id: true, name: true } });
  if (!department) throw fail('DEPARTMENT_NOT_FOUND', 'The selected department was not found or is switched off.');

  const designationText = text(input.designation);
  if (!designationText) throw fail('DESIGNATION_REQUIRED', 'Select the designation.');
  await ensureSystemDesignations(prisma);
  const designation = await prisma.hrmDesignation.findUnique({ where: { nameKey: designationKey(designationText) }, select: { name: true, isActive: true } });
  if (!designation) throw fail('DESIGNATION_NOT_FOUND', `“${designationText}” is not on the designation list. Add it from HRM (Manage designations) first.`);
  if (!designation.isActive) throw new HrmHttpError(409, 'DESIGNATION_INACTIVE', `The designation “${designation.name}” is switched off. Choose another one.`);

  const employmentType = text(input.employmentType) || 'FULL_TIME';
  if (!(OFFER_EMPLOYMENT_TYPES as readonly string[]).includes(employmentType)) throw fail('EMPLOYMENT_TYPE_INVALID', 'Choose a valid employment type.');

  const locationType = text(input.locationType);
  if (locationType !== 'HEAD_OFFICE' && locationType !== 'STATE_OFFICE') throw fail('LOCATION_TYPE_REQUIRED', 'Choose Head office or State office.');
  // A head office posting takes its place from the head office, so only a state office reads the sent state and city.
  const headOffice = locationType === 'HEAD_OFFICE' ? await requireHeadOffice(prisma, text(input.headOfficeUnitId) || null) : null;
  const stateId = headOffice ? headOffice.stateId : optionalInt(input.stateId);
  const cityId = headOffice ? headOffice.cityId : optionalInt(input.cityId);
  if (Number.isNaN(stateId) || Number.isNaN(cityId)) throw fail('LOCATION_INVALID', 'Select a valid state and city.');

  let place: { stateId: number; stateName: string; cityId: number; cityName: string };
  const findCity = async (state: number, city: number) => {
    const row = await prisma.city.findFirst({
      where: { id: city, stateId: state, state: { country: { iso2: 'IN' } } },
      select: { id: true, name: true, state: { select: { id: true, name: true } } },
    });
    if (!row) throw fail('LOCATION_INVALID', 'The selected city does not belong to the selected state.');
    return { stateId: row.state.id, stateName: row.state.name, cityId: row.id, cityName: row.name };
  };

  if (headOffice) {
    place = await findCity(headOffice.stateId, headOffice.cityId);
  } else {
    if (!stateId) throw fail('STATE_REQUIRED', 'Select the state.');
    if (!cityId) throw fail('CITY_REQUIRED', 'Select the city.');
    place = await findCity(stateId, cityId);
    const offices = await prisma.hrmOrgUnit.findMany({ where: { type: 'REGION', stateId: place.stateId }, select: { isActive: true } });
    if (offices.length && !offices.some((office) => office.isActive)) {
      throw new HrmHttpError(409, 'STATE_OFFICE_SWITCHED_OFF', `The ${place.stateName} state office is switched off. Switch it on from the HRM Organisation page first.`);
    }
  }

  // Only a state office has a manager.
  const isOfficeManager = locationType === 'STATE_OFFICE' && flag(input.isOfficeManager);

  // Exactly what HR chose on the form (the form pre-fills the National Operations Manager for a State Manager);
  // the stored placement must say the same as the letter, so nothing is defaulted here.
  const reportingManagerEmployeeId: string | null = text(input.reportingManagerEmployeeId) || null;
  if (!reportingManagerEmployeeId && isOfficeManager && (await findNationalOperationsManagers()).length > 1) {
    throw fail('MANAGER_REQUIRED', 'There is more than one National Operations Manager. Choose who this State Manager will report to.');
  }
  let reportingManagerName: string | null = null;
  if (reportingManagerEmployeeId) {
    const manager = await prisma.hrmEmployee.findFirst({
      where: { id: reportingManagerEmployeeId, status: { in: [...WORKING_STATUSES] }, archivedAt: null },
      select: { legalName: true, preferredName: true },
    });
    if (!manager) throw fail('MANAGER_NOT_FOUND', 'The selected reporting manager is not available.');
    reportingManagerName = manager.preferredName || manager.legalName;
  }

  return {
    hrmOrgUnitId: department.id,
    departmentName: department.name,
    designation: designation.name,
    locationType,
    headOfficeUnitId: headOffice?.id ?? null,
    ...place,
    isOfficeManager,
    employmentType: employmentType as OfferEmploymentType,
    reportingManagerEmployeeId,
    reportingManagerName,
    placeOfPosting: locationType === 'HEAD_OFFICE'
      ? `Head Office, ${place.cityName}, ${place.stateName}`
      : `${place.cityName}, ${place.stateName}`,
  };
};

/**
 * Everything the recruitment offer form needs from HRM, in one call: so a recruiter who may create offers can fill
 * the placement without holding HRM permissions. Only names and ids, no personal data. A state-limited recruiter is
 * only offered their own places.
 */
export const getOfferFormOptions = async (reach: RecruitmentReach) => {
  const [departments, designations, states, stateOffices, headOffices, nationalOperationsManagers] = await Promise.all([
    prisma.hrmOrgUnit.findMany({ where: { type: 'DEPARTMENT', isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    listActiveDesignations(),
    prisma.state.findMany({ where: { country: { iso2: 'IN' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.hrmOrgUnit.findMany({ where: { type: 'REGION', stateId: { not: null } }, select: { stateId: true, isActive: true } }),
    listHeadOffices(prisma),
    findNationalOperationsManagers(),
  ]);
  const activeStates = new Set(stateOffices.filter((office) => office.isActive).map((office) => office.stateId!));
  const switchedOff = new Set(stateOffices.filter((office) => !office.isActive).map((office) => office.stateId!));
  // A head office posting may be in any state HR chooses, so somebody who covers the head office sees every state.
  const offered = reach.all || reach.headOffice ? states : states.filter((state) => reach.stateIds.includes(state.id));
  const mayHeadOffice = reach.all || reach.headOffice;
  return {
    departments,
    designations: designations.map((designation) => ({ id: designation.id, name: designation.name })),
    states: offered.map((state) => ({ id: state.id, name: state.name, hasOffice: activeStates.has(state.id), officeSwitchedOff: !activeStates.has(state.id) && switchedOff.has(state.id) })),
    // Which places the caller may post a candidate to (the form hides the others; the server checks again).
    places: { headOffice: mayHeadOffice, stateIds: reach.all ? null : reach.stateIds },
    // Every head office, the default first; empty until one is set up, or outside the caller's places.
    headOffices: mayHeadOffice ? headOffices : [],
    nationalOperationsManagers,
    employmentTypes: [...OFFER_EMPLOYMENT_TYPES],
    stateManagerDesignation: STATE_MANAGER_DESIGNATION,
  };
};

/**
 * The managers a state-limited recruiter may name: people working in their places, whoever holds an additional charge
 * there, and the National Operations Manager (every State Manager reports to them).
 */
const managersInReach = async (reach: Extract<RecruitmentReach, { all: false }>): Promise<Prisma.HrmEmployeeWhereInput> => {
  const today = utcToday();
  const places: Prisma.HrmEmploymentAssignmentWhereInput[] = [
    ...(reach.stateIds.length ? [{ stateId: { in: reach.stateIds }, officeUnit: { type: 'REGION' as const } }] : []),
    ...(reach.headOffice ? [{ officeUnit: { type: 'HEAD_OFFICE' as const } }] : []),
  ];
  const national = (await findNationalOperationsManagers()).map((manager) => manager.id);
  return {
    OR: [
      { id: { in: national } },
      ...(places.length ? [{ assignments: { some: { AND: [currentAssignmentWhere(today), { OR: places }] } } }] : []),
      ...(reach.stateIds.length ? [{ additionalCharges: { some: { ...activeChargeWhere(today), officeUnit: { stateId: { in: reach.stateIds } } } } }] : []),
    ],
  };
};

/**
 * The reporting manager list of the offer form: the same grouping and suggestions as inside HRM, limited to the
 * recruiter's places (plus the National Operations Manager). Names, codes, jobs and roles only.
 */
export const searchOfferReportingManagers = async (rawQuery: unknown, reach: RecruitmentReach) => {
  const query = parseHrmInput(schemas.managerOptionsQuery, rawQuery);
  return listManagerCandidates(
    // An offer is for somebody who has no HR record yet, so nobody is excluded and no team can loop.
    { stateId: query.stateId, headOffice: query.headOffice, managerRole: query.managerRole ?? false, search: query.search },
    {
      visible: reach.all ? null : await managersInReach(reach),
      seesState: (stateId) => reach.all || reach.stateIds.includes(stateId),
      searchContacts: false,
    },
  );
};
