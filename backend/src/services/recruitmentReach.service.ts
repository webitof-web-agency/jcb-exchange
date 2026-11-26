import type { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { getActiveScopes } from '../modules/hrm/access';
import { listHeadOffices } from '../modules/hrm/officeUnits';
import { loadOperatorPermissions } from '../utils/permissionGrant';
import {
  defaultJobLocationType,
  findStateByName,
  JOB_LOCATION_TYPES,
  recruitmentReachFrom,
  type JobLocationType,
  type RecruitmentReach,
} from '../utils/recruitmentReachRules';

type Operator = { userId: string; role: string };

/** The recruitment places of a login, worked out from its permissions and its HRM access scopes in force today. */
export const getRecruitmentReach = async (operator: Operator): Promise<RecruitmentReach> => {
  if (operator.role === 'SUPER_ADMIN') return { all: true, userId: operator.userId };
  const [permissions, scopes] = await Promise.all([loadOperatorPermissions(operator), getActiveScopes(operator.userId)]);
  return recruitmentReachFrom({ userId: operator.userId, role: operator.role, permissions: [...permissions], scopes });
};

/** The caller's reach, worked out once per request. */
export const requestReach = async (req: Request, res: Response): Promise<RecruitmentReach> => {
  const cached = res.locals.recruitmentReach as RecruitmentReach | undefined;
  if (cached) return cached;
  const reach = await getRecruitmentReach({ userId: req.user!.id, role: req.user!.role });
  res.locals.recruitmentReach = reach;
  return reach;
};

/** For the screens: what the caller sees, with state names. */
export const describeRecruitmentReach = async (reach: RecruitmentReach) => {
  if (reach.all) return { allIndia: true, headOffice: true, states: [] as Array<{ id: number; name: string }> };
  const states = reach.stateIds.length
    ? await prisma.state.findMany({ where: { id: { in: reach.stateIds } }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : [];
  return { allIndia: false, headOffice: reach.headOffice, states };
};

export type JobPlace = { hrmStateId: number | null; hrmLocationType: JobLocationType | null };

/**
 * The state and posting type a job is saved with: what the form chose, else worked out from the typed state name and
 * city. On an edit that does not touch the location, the stored values stay.
 */
export const resolveJobPlace = async (
  body: Record<string, unknown>,
  existing?: { locationState: string; locationCity: string; hrmStateId: number | null; hrmLocationType: string | null },
): Promise<JobPlace | { error: string }> => {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const locationState = text(body.locationState) || existing?.locationState || '';
  const locationCity = text(body.locationCity) || existing?.locationCity || '';
  const chosenState = body.hrmStateId === undefined || body.hrmStateId === null || body.hrmStateId === '' ? null : Number(body.hrmStateId);
  if (chosenState !== null && (!Number.isInteger(chosenState) || chosenState <= 0)) return { error: 'Choose a valid state.' };
  const chosenType = text(body.hrmLocationType);
  if (chosenType && !(JOB_LOCATION_TYPES as readonly string[]).includes(chosenType)) return { error: 'Choose Head office or State office.' };

  const moved = !existing
    || (text(body.locationState) !== '' && text(body.locationState) !== existing.locationState)
    || (text(body.locationCity) !== '' && text(body.locationCity) !== existing.locationCity);
  // An empty posting type sent on purpose means "work it out from the place again".
  const autoAsked = body.hrmLocationType === '';
  if (existing && !moved && chosenState === null && !chosenType && !autoAsked) {
    return { hrmStateId: existing.hrmStateId, hrmLocationType: existing.hrmLocationType as JobLocationType | null };
  }

  const states = await prisma.state.findMany({ where: { country: { iso2: 'IN' } }, select: { id: true, name: true } });
  let stateId: number | null;
  if (chosenState !== null) {
    if (!states.some((state) => state.id === chosenState)) return { error: 'The selected state was not found.' };
    stateId = chosenState;
  } else if (existing && !moved) {
    stateId = existing.hrmStateId;
  } else {
    stateId = findStateByName(states, locationState)?.id ?? null;
  }
  let type = (chosenType || null) as JobLocationType | null;
  if (!type && existing && !moved && !autoAsked && existing.hrmLocationType) type = existing.hrmLocationType as JobLocationType;
  if (!type) {
    // A head office city is any of the head offices, not only the default one.
    type = defaultJobLocationType(stateId, locationCity, await listHeadOffices());
  }
  return { hrmStateId: stateId, hrmLocationType: stateId ? type : null };
};
