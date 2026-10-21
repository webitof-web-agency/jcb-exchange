import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { actorFromRequest, requestBody } from '../services/context';
import {
  completeFollowUp,
  createFollowUp,
  createSchedule,
  createWriteOff,
  getAdvances,
  getDues,
  getPartyBalances,
  getPartyStatement,
  listFollowUps,
  listSchedules,
  listWriteOffs,
  updateSchedule,
} from '../services/receivables.service';

const idParam = (req: Request) => {
  const value = req.params.id;
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};
const query = (req: Request) => req.query as Record<string, unknown>;

export const dues = handle((req) => getDues(query(req)));
export const advances = handle((req) => getAdvances(query(req)));
export const partyBalances = handle(async (req) => ({ balances: await getPartyBalances(query(req)) }));
export const partyStatement = handle((req) => getPartyStatement(idParam(req), query(req)));

export const schedules = handle(async (req) => ({ schedules: await listSchedules(query(req)) }));
export const newSchedule = handle((req) => createSchedule(requestBody(req), actorFromRequest(req)), 201);
export const changeSchedule = handle((req) => updateSchedule(idParam(req), requestBody(req), actorFromRequest(req)));

export const followUps = handle(async (req) => ({ followUps: await listFollowUps({ ...query(req), userId: req.user?.id }) }));
export const newFollowUp = handle((req) => createFollowUp(requestBody(req), actorFromRequest(req)), 201);
export const finishFollowUp = handle((req) => completeFollowUp(idParam(req), requestBody(req), actorFromRequest(req)));

export const writeOffs = handle(async (req) => ({ writeOffs: await listWriteOffs(query(req)) }));
export const newWriteOff = handle(async (req) => {
  const permissions = await getRequestPermissions(req);
  return createWriteOff(requestBody(req), {
    actor: actorFromRequest(req),
    isSuperAdmin: req.user?.role === 'SUPER_ADMIN',
    canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]),
    canApprove: hasAnyOf(permissions, [P.approve]),
    canPost: hasAnyOf(permissions, [P.booksPost]),
  });
}, 201);
