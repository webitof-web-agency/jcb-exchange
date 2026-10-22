import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { actorFromRequest, requestBody } from '../services/context';
import { bookEvent, getAutomation, getIntegrations, getTaxConfig, ignoreEvent, listEvents, pullRazorpay, receiveHdfcWebhook, runDailyAutomation, saveAutomation, saveIntegration, saveTaxConfig, testRazorpay } from '../services/integrations.service';

const param = (req: Request, name = 'id') => {
  const value = req.params[name];
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};
const ledgerAccess = async (req: Request) => {
  const permissions = await getRequestPermissions(req);
  return { actor: actorFromRequest(req), isSuperAdmin: req.user?.role === 'SUPER_ADMIN', canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]), canApprove: hasAnyOf(permissions, [P.approve]), canPost: hasAnyOf(permissions, [P.booksPost]) };
};

export const integrations = handle(() => getIntegrations());
export const putIntegration = handle((req) => saveIntegration(param(req, 'provider'), requestBody(req), actorFromRequest(req), req.user?.role === 'SUPER_ADMIN'));
export const razorpayTest = handle(() => testRazorpay());
export const razorpayPull = handle(async (req) => pullRazorpay(requestBody(req), await ledgerAccess(req), actorFromRequest(req)));
export const hdfcWebhook = handle((req) => receiveHdfcWebhook(req.headers as Record<string, unknown>, requestBody(req)));
export const events = handle(async (req) => ({ events: await listEvents(req.query as Record<string, unknown>) }));
export const book = handle(async (req) => bookEvent(param(req), requestBody(req), await ledgerAccess(req)));
export const ignore = handle((req) => ignoreEvent(param(req), requestBody(req), actorFromRequest(req)));
export const automation = handle(() => getAutomation());
export const putAutomation = handle((req) => saveAutomation(requestBody(req), actorFromRequest(req)));
export const runAutomation = handle(() => runDailyAutomation({ force: true }));
export const taxConfig = handle(() => getTaxConfig());
export const putTaxConfig = handle((req) => saveTaxConfig(requestBody(req), actorFromRequest(req)));
