import { NextFunction, Request, Response, Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import { crmAccessOf, requireCrmCapability, requireCrmUser } from './access';
import { handle, queryString, requestBody, routeParam } from './http';
import * as assignment from './services/assignment.service';
import * as contacts from './services/contacts.service';
import * as dataExchange from './services/dataExchange.service';
import * as followUps from './services/followups.service';
import * as leads from './services/leads.service';
import * as meta from './services/meta.service';
import * as publicForms from './services/public.service';
import * as reports from './services/reports.service';
import * as segments from './services/segments.service';
import { publicCrmConfig, updateCrmConfig } from './services/settings.service';
import { crmTick } from './worker';

const router = Router();

// ───────────── Unauthenticated: website forms + lead-capture API ─────────────

const WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map<string, { count: number; resetAt: number }>();
const limit = (perWindow: number) => (req: Request, res: Response, next: NextFunction) => {
  const now = Date.now();
  const mobile = String((req.body as Record<string, unknown> | undefined)?.mobile ?? '').replace(/\D/g, '').slice(-10);
  for (const key of [`ip:${req.path}:${req.ip || 'unknown'}`, ...(mobile ? [`m:${req.path}:${mobile}`] : [])]) {
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    const max = key.startsWith('m:') ? 3 : perWindow;
    if (bucket.count > max) return res.status(429).json({ error: 'Too many submissions. Please try again in a few minutes.' });
  }
  if (buckets.size > 10_000) for (const [key, value] of buckets) if (value.resetAt <= now) buckets.delete(key);
  next();
};

router.get('/public/catalog', handle(() => publicForms.publicCatalog()));
router.post('/public/requirement', limit(20), handle((req) => publicForms.submitRequirement(requestBody(req)), 201));
router.post('/public/sell-machine', limit(20), handle((req) => publicForms.submitSellMachine(requestBody(req)), 201));
router.post('/webhook/leads', limit(600), handle((req) => publicForms.webhookLead(req.get('x-crm-key'), requestBody(req)), 201));

// ───────────── Portal (staff + partners) ─────────────

router.use(requireAuth, requireCrmUser);
const q = (req: Request) => Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')]));
const settings = requireCrmCapability('canSettings');

router.get('/meta', handle((req) => meta.getMeta(crmAccessOf(req))));
router.get('/dashboard', handle((req) => reports.getDashboard(crmAccessOf(req))));
router.get('/reports', handle((req) => reports.getReports(crmAccessOf(req), q(req))));
router.get('/templates', handle((req) => meta.listSendableTemplates(crmAccessOf(req))));
router.get('/inventory', handle((req) => leads.searchInventory(crmAccessOf(req), q(req))));

router.get('/leads', handle((req) => leads.listLeads(crmAccessOf(req), q(req))));
router.get('/leads/board', handle((req) => leads.boardLeads(crmAccessOf(req), q(req))));
router.get('/leads/export.csv', async (req, res, next) => {
  try {
    const csv = await reports.exportLeadsCsv(crmAccessOf(req), q(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="crm-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`﻿${csv}`);
  } catch (error) {
    handle(async () => { throw error; })(req, res, next);
  }
});
router.post('/leads', handle((req) => leads.createLead(crmAccessOf(req), requestBody(req)), 201));
router.post('/leads/bulk', handle((req) => leads.bulkLeads(crmAccessOf(req), requestBody(req))));
router.get('/leads/:id', handle((req) => leads.getLead(crmAccessOf(req), routeParam(req, 'id'))));
router.patch('/leads/:id', handle((req) => leads.updateLead(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.post('/leads/:id/status', handle((req) => leads.changeStatus(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.post('/leads/:id/assign', handle((req) => leads.assignLead(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.post('/leads/:id/activities', handle((req) => leads.addLeadActivity(crmAccessOf(req), routeParam(req, 'id'), requestBody(req)), 201));
router.post('/leads/:id/merge', handle((req) => leads.mergeLeads(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.get('/leads/:id/matches', handle((req) => leads.leadMatches(crmAccessOf(req), routeParam(req, 'id'))));
router.post('/leads/:id/whatsapp', handle((req) => meta.sendLeadWhatsApp(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));

router.get('/followups', handle((req) => followUps.listFollowUps(crmAccessOf(req), q(req))));
router.get('/followups/summary', handle((req) => followUps.followUpSummary(crmAccessOf(req), queryString(req, 'ownerId'))));
router.post('/followups', handle((req) => followUps.createFollowUp(crmAccessOf(req), requestBody(req)), 201));
router.post('/followups/bulk-reschedule', handle((req) => followUps.bulkReschedule(crmAccessOf(req), requestBody(req))));
router.post('/followups/:id/complete', handle((req) => followUps.completeFollowUp(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.post('/followups/:id/reschedule', handle((req) => followUps.rescheduleFollowUp(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.post('/followups/:id/reassign', handle((req) => followUps.reassignFollowUp(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.post('/followups/:id/cancel', handle((req) => followUps.cancelFollowUp(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));

router.get('/contacts', handle((req) => contacts.listContacts(crmAccessOf(req), q(req))));
router.get('/contacts/lookup', handle((req) => contacts.lookupByMobile(crmAccessOf(req), queryString(req, 'mobile'))));
router.post('/contacts', handle((req) => contacts.createContact(crmAccessOf(req), requestBody(req)), 201));
router.get('/contacts/:id', handle((req) => contacts.getContact360(crmAccessOf(req), routeParam(req, 'id'))));
router.patch('/contacts/:id', handle((req) => contacts.updateContact(crmAccessOf(req), routeParam(req, 'id'), requestBody(req))));
router.post('/contacts/:id/activities', handle((req) => contacts.addContactActivity(crmAccessOf(req), routeParam(req, 'id'), requestBody(req)), 201));

router.post('/import', handle((req) => dataExchange.importLeads(crmAccessOf(req), requestBody(req))));
router.get('/import/history', handle((req) => dataExchange.importHistory(crmAccessOf(req))));

router.get('/segments', handle((req) => segments.listSegments(crmAccessOf(req))));
router.post('/segments/preview', handle((req) => segments.previewSegment(crmAccessOf(req), requestBody(req))));
router.post('/segments', handle((req) => segments.saveSegment(crmAccessOf(req), requestBody(req)), 201));
router.put('/segments/:id', handle((req) => segments.saveSegment(crmAccessOf(req), requestBody(req), routeParam(req, 'id'))));
router.delete('/segments/:id', handle((req) => segments.deleteSegment(crmAccessOf(req), routeParam(req, 'id'))));
router.post('/segments/:id/campaign', handle((req) => segments.segmentCampaign(crmAccessOf(req), routeParam(req, 'id'), requestBody(req)), 201));

router.put('/settings', settings, handle(async (req) => publicCrmConfig(await updateCrmConfig(requestBody(req), crmAccessOf(req).userId))));
router.post('/settings/webhook-key', settings, handle((req) => publicForms.rotateWebhookKey(crmAccessOf(req), requestBody(req).enabled !== false)));
router.put('/settings/webhook', settings, handle((req) => publicForms.setWebhookEnabled(crmAccessOf(req), Boolean(requestBody(req).enabled))));
router.post('/automation/run', settings, handle(() => crmTick()));
router.get('/assignment-rules', settings, handle(() => assignment.listRules()));
router.post('/assignment-rules', settings, handle((req) => assignment.createRule(requestBody(req)), 201));
router.put('/assignment-rules/:id', settings, handle((req) => assignment.updateRule(routeParam(req, 'id'), requestBody(req))));
router.delete('/assignment-rules/:id', settings, handle((req) => assignment.deleteRule(routeParam(req, 'id'))));

export default router;
