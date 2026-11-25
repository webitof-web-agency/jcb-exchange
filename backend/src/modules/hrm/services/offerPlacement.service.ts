import prisma from '../../../lib/prisma';
import { HrmHttpError } from '../errors';
import { STATE_MANAGER_DESIGNATION, WORKING_STATUSES, findNationalOperationsManagers } from '../officeAssignments';
import { findActiveHeadOffice, resolveHeadOffice } from '../officeUnits';
import { designationKey, ensureSystemDesignations, listActiveDesignations } from './designation.service';

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
  const stateId = optionalInt(input.stateId);
  const cityId = optionalInt(input.cityId);
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

  if (locationType === 'HEAD_OFFICE') {
    const headOffice = await findActiveHeadOffice(prisma);
    if (!headOffice) throw new HrmHttpError(409, 'HEAD_OFFICE_NOT_SET_UP', 'The head office is not set up yet. Set it up on the HRM Organisation page, or choose State office.');
    if ((stateId === null) !== (cityId === null)) throw fail('LOCATION_INVALID', 'Select the state together with the city, or leave both empty for the head office city.');
    if (stateId && cityId) {
      place = await findCity(stateId, cityId);
    } else {
      const fallback = headOffice.stateId && headOffice.cityId ? null : await resolveHeadOffice();
      const hoState = headOffice.stateId ?? fallback?.stateId;
      const hoCity = headOffice.cityId ?? fallback?.cityId;
      if (!hoState || !hoCity) throw new HrmHttpError(409, 'HEAD_OFFICE_LOCATION_MISSING', 'The head office has no location. Set it up on the HRM Organisation page first.');
      place = await findCity(hoState, hoCity);
    }
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
 * the placement without holding HRM permissions. Only names and ids, no personal data.
 */
export const getOfferFormOptions = async () => {
  const [departments, designations, states, stateOffices, headOfficeLocation, headOfficeUnit, nationalOperationsManagers] = await Promise.all([
    prisma.hrmOrgUnit.findMany({ where: { type: 'DEPARTMENT', isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
    listActiveDesignations(),
    prisma.state.findMany({ where: { country: { iso2: 'IN' } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.hrmOrgUnit.findMany({ where: { type: 'REGION', stateId: { not: null } }, select: { stateId: true, isActive: true } }),
    resolveHeadOffice(),
    findActiveHeadOffice(prisma),
    findNationalOperationsManagers(),
  ]);
  const activeStates = new Set(stateOffices.filter((office) => office.isActive).map((office) => office.stateId!));
  const switchedOff = new Set(stateOffices.filter((office) => !office.isActive).map((office) => office.stateId!));
  return {
    departments,
    designations: designations.map((designation) => ({ id: designation.id, name: designation.name })),
    states: states.map((state) => ({ id: state.id, name: state.name, hasOffice: activeStates.has(state.id), officeSwitchedOff: !activeStates.has(state.id) && switchedOff.has(state.id) })),
    // The head office's own place (its unit's location, or the Raipur default); null until it is set up.
    headOffice: headOfficeUnit ? {
      id: headOfficeUnit.id,
      name: headOfficeUnit.name,
      stateId: headOfficeUnit.stateId ?? headOfficeLocation?.stateId ?? null,
      cityId: headOfficeUnit.cityId ?? headOfficeLocation?.cityId ?? null,
    } : null,
    nationalOperationsManagers,
    employmentTypes: [...OFFER_EMPLOYMENT_TYPES],
    stateManagerDesignation: STATE_MANAGER_DESIGNATION,
  };
};

/** Working employees a new joiner could report to (name / code search, at most 20). */
export const searchOfferReportingManagers = async (search: string) => {
  const query = search.trim().slice(0, 80);
  const rows = await prisma.hrmEmployee.findMany({
    where: {
      status: { in: [...WORKING_STATUSES] },
      archivedAt: null,
      ...(query ? { OR: [
        { legalName: { contains: query, mode: 'insensitive' as const } },
        { preferredName: { contains: query, mode: 'insensitive' as const } },
        { employeeCode: { contains: query, mode: 'insensitive' as const } },
      ] } : {}),
    },
    select: {
      id: true, employeeCode: true, legalName: true, preferredName: true,
      assignments: { where: { status: 'ACTIVE', effectiveTo: null }, orderBy: { effectiveFrom: 'desc' }, take: 1, select: { designation: true } },
    },
    orderBy: { legalName: 'asc' },
    take: 20,
  });
  return rows.map((row) => ({ id: row.id, employeeCode: row.employeeCode, name: row.preferredName || row.legalName, designation: row.assignments[0]?.designation ?? null }));
};
