import { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, FinHttpError, notFound } from '../http';
import { istToday } from '../utils/fy';
import { dateOnly, readDate, readMultiline, readString } from '../utils/input';
import { decryptSecret, encryptSecret, sameSecret, secretsConfigured } from '../utils/secrets';
import { writeFinAudit } from './audit.service';
import { autoMatch, createGatewaySettlements, getBankingOverview } from './banking.service';
import type { ActorContext } from './context';
import { generateDueRecurring } from './expenses.service';
import { CASH_BANK_KINDS } from './ledgerRules';
import { createVoucher, postVoucher, type LedgerAccess } from './ledger.service';
import { FIN_SETTINGS_ID } from './settings.service';
import { getAlerts } from './statements.service';

// Connectors (off by default, behind credentials), daily automation jobs and tax settings.
// Everything lives in FinSettings.config so no existing table changes.

const SYSTEM: LedgerAccess = { actor: { actorUserId: null, ipAddress: null, userAgent: null }, isSuperAdmin: false, canPostSoftClosed: false, canApprove: false };
const configOf = (config: Prisma.JsonValue | null | undefined) => (config && typeof config === 'object' && !Array.isArray(config) ? config : {}) as Record<string, unknown>;
const section = <T extends Record<string, unknown>>(config: Record<string, unknown>, key: string, fallback: T): T => ({ ...fallback, ...((config[key] && typeof config[key] === 'object' ? config[key] : {}) as Partial<T>) });

const writeConfig = async (key: string, value: unknown) => {
  const json = JSON.stringify(value);
  await prisma.$executeRaw`
    INSERT INTO "FinSettings" ("id", "config", "updatedAt") VALUES (${FIN_SETTINGS_ID}, jsonb_build_object(${key}::text, ${json}::jsonb), NOW())
    ON CONFLICT ("id") DO UPDATE SET "config" = jsonb_set(COALESCE("FinSettings"."config", '{}'::jsonb), ARRAY[${key}::text], ${json}::jsonb, true), "updatedAt" = NOW()`;
};
const readConfig = async () => configOf((await prisma.finSettings.findUnique({ where: { id: FIN_SETTINGS_ID }, select: { config: true } }))?.config);

type Integrations = {
  razorpay: { enabled: boolean; keyId: string | null; keySecret: string | null; gatewayAccountId: string | null; bankAccountId: string | null; lastPullAt: string | null };
  hdfc: { enabled: boolean; webhookSecret: string | null; bankAccountId: string | null };
  gsp: { enabled: boolean; provider: string | null; gstin: string | null; username: string | null };
};
const DEFAULT_INTEGRATIONS: Integrations = {
  razorpay: { enabled: false, keyId: null, keySecret: null, gatewayAccountId: null, bankAccountId: null, lastPullAt: null },
  hdfc: { enabled: false, webhookSecret: null, bankAccountId: null },
  gsp: { enabled: false, provider: null, gstin: null, username: null },
};
const readIntegrations = (config: Record<string, unknown>): Integrations => {
  const raw = section(config, 'integrations', {} as Record<string, unknown>);
  return {
    razorpay: section(raw, 'razorpay', DEFAULT_INTEGRATIONS.razorpay),
    hdfc: section(raw, 'hdfc', DEFAULT_INTEGRATIONS.hdfc),
    gsp: section(raw, 'gsp', DEFAULT_INTEGRATIONS.gsp),
  };
};

export const getIntegrations = async () => {
  const integrations = readIntegrations(await readConfig());
  const events = await prisma.finIntegrationEvent.groupBy({ by: ['provider', 'status'], _count: { _all: true } }).catch(() => []);
  return {
    secretsConfigured: secretsConfigured(),
    razorpay: { ...integrations.razorpay, keySecret: undefined, hasSecret: Boolean(integrations.razorpay.keySecret), keyId: integrations.razorpay.keyId ? `${integrations.razorpay.keyId.slice(0, 8)}…` : null },
    hdfc: { ...integrations.hdfc, webhookSecret: undefined, hasSecret: Boolean(integrations.hdfc.webhookSecret), webhookPath: '/api/finance-hub/integrations/hdfc/webhook' },
    gsp: integrations.gsp,
    events: events.map((row) => ({ provider: row.provider, status: row.status, count: row._count._all })),
  };
};

const checkLedger = async (id: string | null, kinds: string[], label: string) => {
  if (!id) return null;
  const account = await prisma.finAccount.findUnique({ where: { id }, select: { kind: true, isActive: true } });
  if (!account?.isActive || !kinds.includes(account.kind)) throw badRequest(`Choose a valid ${label}.`);
  return id;
};

/** Saves one connector. Enabling a connector is limited to super admins. */
export const saveIntegration = async (provider: string, body: Record<string, unknown>, context: ActorContext, isSuperAdmin: boolean) => {
  const config = await readConfig();
  const current = readIntegrations(config);
  const enabled = body.enabled === true;
  if (enabled && !isSuperAdmin) throw new FinHttpError(403, 'Only a super admin can switch a connector on.');
  const secret = (value: unknown, existing: string | null) => {
    if (value === undefined || value === '') return existing;
    if (value === null) return null;
    return encryptSecret(String(value).trim().slice(0, 200));
  };
  let next: Integrations;
  if (provider === 'razorpay') {
    const keyId = body.keyId === undefined || body.keyId === '' ? current.razorpay.keyId : readString(body, 'keyId', 'Key id', { max: 60 });
    const razorpay = {
      ...current.razorpay, enabled, keyId, keySecret: secret(body.keySecret, current.razorpay.keySecret),
      gatewayAccountId: await checkLedger(readString(body, 'gatewayAccountId', 'Gateway ledger', { max: 60 }), ['GATEWAY_CLEARING'], 'gateway clearing ledger'),
      bankAccountId: await checkLedger(readString(body, 'bankAccountId', 'Bank', { max: 60 }), ['BANK'], 'bank ledger'),
    };
    if (enabled && (!razorpay.keyId || !razorpay.keySecret || !razorpay.gatewayAccountId || !razorpay.bankAccountId)) throw badRequest('Key id, key secret, gateway ledger and bank are needed before switching Razorpay on.');
    next = { ...current, razorpay };
  } else if (provider === 'hdfc') {
    const hdfc = { ...current.hdfc, enabled, webhookSecret: secret(body.webhookSecret, current.hdfc.webhookSecret), bankAccountId: await checkLedger(readString(body, 'bankAccountId', 'Bank', { max: 60 }), ['BANK'], 'bank ledger') };
    if (enabled && (!hdfc.webhookSecret || !hdfc.bankAccountId)) throw badRequest('Webhook secret and bank are needed before switching HDFC e-Collect on.');
    next = { ...current, hdfc };
  } else if (provider === 'gsp') {
    if (enabled) throw badRequest('GST portal filing through a GSP needs a signed GSP agreement and its API; it stays off until that integration is added.');
    next = { ...current, gsp: { enabled: false, provider: readString(body, 'provider', 'GSP', { max: 60 }), gstin: readString(body, 'gstin', 'GSTIN', { max: 15 }), username: readString(body, 'username', 'Portal username', { max: 60 }) } };
  } else throw badRequest('Unknown connector.');
  await writeConfig('integrations', next);
  await writeFinAudit({ ...context, entityType: 'FinIntegration', entityId: provider, action: 'SAVE', after: { enabled } });
  return getIntegrations();
};

// ---------------------------------------------------------------------------
// Razorpay settlements
// ---------------------------------------------------------------------------

type RazorpaySettlement = { id: string; amount: number; fees: number; tax: number; utr: string | null; status: string; created_at: number };

const razorpay = async (path: string) => {
  const settings = readIntegrations(await readConfig()).razorpay;
  if (!settings.enabled) throw badRequest('Switch the Razorpay connector on first (Integrations & Notifications).');
  const auth = Buffer.from(`${settings.keyId}:${decryptSecret(settings.keySecret!)}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => ({})) as { error?: { description?: string } } & Record<string, unknown>;
  if (!response.ok) throw badRequest(`Razorpay: ${body.error?.description ?? response.statusText}`);
  return { settings, body };
};

export const testRazorpay = async () => {
  await razorpay('/settlements?count=1');
  return { ok: true };
};

/** Lists processed settlements in a date range; posts them as gateway settlements unless dryRun. */
export const pullRazorpay = async (body: Record<string, unknown>, access: LedgerAccess, context: ActorContext) => {
  const to = readDate(body, 'to', 'To') ?? istToday();
  const from = readDate(body, 'from', 'From') ?? new Date(to.getTime() - 7 * 86400000);
  const settlements: RazorpaySettlement[] = [];
  let settings: Integrations['razorpay'] | null = null;
  for (let skip = 0; skip < 1000; skip += 100) {
    const result = await razorpay(`/settlements?from=${Math.floor(from.getTime() / 1000)}&to=${Math.floor(to.getTime() / 1000) + 86399}&count=100&skip=${skip}`);
    settings = result.settings;
    const items = (result.body.items ?? []) as RazorpaySettlement[];
    settlements.push(...items);
    if (items.length < 100) break;
  }
  const rows = settlements.filter((item) => item.status === 'processed').map((item) => ({
    gatewayAccountId: settings!.gatewayAccountId, bankAccountId: settings!.bankAccountId, utr: item.utr || item.id,
    date: new Date(item.created_at * 1000 + 330 * 60000).toISOString().slice(0, 10),
    gross: ((item.amount + item.fees) / 100).toFixed(2), fee: ((item.fees - item.tax) / 100).toFixed(2), gst: (item.tax / 100).toFixed(2), gstSplit: 'IGST',
  }));
  if (body.dryRun !== false || !rows.length) return { dryRun: true, rows };
  const posted = await createGatewaySettlements({ rows }, access);
  await writeConfig('integrations', { ...readIntegrations(await readConfig()), razorpay: { ...settings!, lastPullAt: new Date().toISOString() } });
  await writeFinAudit({ ...context, entityType: 'FinIntegration', entityId: 'razorpay', action: 'PULL', after: { posted: posted.posted, failed: posted.failed } });
  return { dryRun: false, rows, ...posted };
};

// ---------------------------------------------------------------------------
// HDFC e-Collect (inbound credits)
// ---------------------------------------------------------------------------

const pick = (body: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
};

/** Public webhook: checks the shared secret header, stores the credit once (by UTR). */
export const receiveHdfcWebhook = async (headers: Record<string, unknown>, body: Record<string, unknown>) => {
  const settings = readIntegrations(await readConfig()).hdfc;
  if (!settings.enabled || !settings.webhookSecret) throw new FinHttpError(404, 'Not found.');
  const given = typeof headers['x-finance-hub-secret'] === 'string' ? headers['x-finance-hub-secret'] : '';
  if (!given || !sameSecret(given, decryptSecret(settings.webhookSecret))) throw new FinHttpError(401, 'Invalid secret.');
  const externalId = pick(body, ['utr', 'UTR', 'transactionId', 'txnId', 'referenceNumber']);
  const amount = Number(pick(body, ['amount', 'Amount', 'txnAmount']));
  if (!externalId || !Number.isFinite(amount) || amount <= 0) throw badRequest('utr and amount are required.');
  const rawDate = pick(body, ['date', 'txnDate', 'transactionDate']);
  const eventDate = rawDate && /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? new Date(`${rawDate.slice(0, 10)}T00:00:00.000Z`) : istToday();
  await prisma.finIntegrationEvent.upsert({
    where: { provider_externalId: { provider: 'HDFC', externalId: externalId.slice(0, 100) } },
    create: { provider: 'HDFC', eventType: 'CREDIT', externalId: externalId.slice(0, 100), amount: new Prisma.Decimal(amount.toFixed(2)), eventDate, reference: pick(body, ['virtualAccount', 'van', 'vanNumber', 'beneficiaryAccount'])?.slice(0, 100) ?? null, payerName: pick(body, ['remitterName', 'payerName', 'senderName'])?.slice(0, 200) ?? null, payload: JSON.parse(JSON.stringify(body)) },
    update: {},
  });
  return { ok: true };
};

export const listEvents = async (query: Record<string, unknown>) => {
  const events = await prisma.finIntegrationEvent.findMany({ where: { ...(typeof query.status === 'string' && query.status ? { status: query.status } : {}) }, orderBy: { receivedAt: 'desc' }, take: 300 });
  return events.map((event) => ({ ...event, amount: event.amount?.toNumber() ?? null, eventDate: dateOnly(event.eventDate) }));
};

export const bookEvent = async (id: string, body: Record<string, unknown>, access: LedgerAccess & { canPost: boolean }) => {
  const event = await prisma.finIntegrationEvent.findUnique({ where: { id } });
  if (!event) throw notFound('Event not found.');
  if (event.status !== 'RECEIVED') throw badRequest('Already handled.');
  const settings = readIntegrations(await readConfig());
  const bankAccountId = event.provider === 'HDFC' ? settings.hdfc.bankAccountId : null;
  if (!bankAccountId) throw badRequest('Set the bank for this connector first.');
  const counterAccountId = readString(body, 'counterAccountId', 'Received for', { max: 60, required: true })!;
  const partyId = readString(body, 'partyId', 'Party', { max: 60 });
  const counter = await prisma.finAccount.findUnique({ where: { id: counterAccountId }, select: { kind: true, requiresParty: true } });
  if (!counter || CASH_BANK_KINDS.includes(counter.kind)) throw badRequest('Choose the ledger the money is for (e.g. Sundry Debtors).');
  if (counter.requiresParty && !partyId) throw badRequest('That ledger needs a party.');
  const amount = event.amount!.toFixed(2);
  const draft = await createVoucher({
    type: 'RECEIPT', date: dateOnly(event.eventDate ?? istToday()), narration: `${event.provider} credit ${event.externalId}${event.payerName ? ` from ${event.payerName}` : ''}`, reference: event.externalId.slice(0, 80), paymentMethod: 'BANK_TRANSFER',
    lines: [{ accountId: bankAccountId, debit: amount, credit: null }, { accountId: counterAccountId, partyId, debit: null, credit: amount }],
  }, access);
  const posted = access.canPost ? await postVoucher(draft.id, access) : { status: draft.status, number: null };
  await prisma.finIntegrationEvent.update({ where: { id }, data: { status: 'BOOKED', voucherId: draft.id, handledById: access.actor.actorUserId } });
  return { id, status: posted.status, number: posted.number };
};

export const ignoreEvent = async (id: string, body: Record<string, unknown>, context: ActorContext) => {
  const note = readMultiline(body, 'note', 'Reason', 500);
  if (!note) throw badRequest('Give a reason.');
  await prisma.finIntegrationEvent.update({ where: { id }, data: { status: 'IGNORED', note, handledById: context.actorUserId } });
  return { id, status: 'IGNORED' };
};

// ---------------------------------------------------------------------------
// Daily automation
// ---------------------------------------------------------------------------

type Automation = { recurringDrafts: boolean; bankAutoMatch: boolean; alertDigest: boolean; runAfterHourIst: number };
const DEFAULT_AUTOMATION: Automation = { recurringDrafts: false, bankAutoMatch: false, alertDigest: false, runAfterHourIst: 7 };

export const getAutomation = async () => {
  const config = await readConfig();
  return { settings: section(config, 'automation', DEFAULT_AUTOMATION), state: section(config, 'automationState', { lastRunDate: null as string | null, lastResult: null as unknown }) };
};

export const saveAutomation = async (body: Record<string, unknown>, context: ActorContext) => {
  const hour = Number(body.runAfterHourIst ?? 7);
  const settings: Automation = { recurringDrafts: body.recurringDrafts === true, bankAutoMatch: body.bankAutoMatch === true, alertDigest: body.alertDigest === true, runAfterHourIst: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 7 };
  await writeConfig('automation', settings);
  await writeFinAudit({ ...context, entityType: 'FinAutomation', entityId: 'daily', action: 'SAVE', after: settings });
  return getAutomation();
};

/**
 * Once a day (after `runAfterHourIst`): create due recurring drafts, auto-match bank rows of
 * the last 45 days, and drop an in-app digest of open alerts for admins. Every job is off by default.
 */
export const runDailyAutomation = async (options: { force?: boolean } = {}) => {
  const { settings, state } = await getAutomation();
  if (!settings.recurringDrafts && !settings.bankAutoMatch && !settings.alertDigest) return { skipped: 'nothing switched on' };
  const now = new Date(Date.now() + 330 * 60000);
  const today = now.toISOString().slice(0, 10);
  if (!options.force && (state.lastRunDate === today || now.getUTCHours() < settings.runAfterHourIst)) return { skipped: 'not due' };
  const result: Record<string, unknown> = {};
  if (settings.recurringDrafts) {
    try {
      const generated = await generateDueRecurring({}, SYSTEM);
      result.recurring = { created: generated.created.length, failed: generated.failed.length };
    } catch (error) { result.recurring = { error: (error as Error).message }; }
  }
  if (settings.bankAutoMatch) {
    try {
      let matched = 0;
      const from = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
      for (const bank of (await getBankingOverview()).filter((item) => item.aliases.length)) matched += (await autoMatch(bank.id, { from, to: today }, SYSTEM.actor)).matched;
      result.bankAutoMatch = { matched };
    } catch (error) { result.bankAutoMatch = { error: (error as Error).message }; }
  }
  if (settings.alertDigest) {
    try {
      const alerts = (await getAlerts()).alerts;
      if (alerts.length) {
        const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, status: 'ACTIVE' }, select: { id: true, role: true } });
        await prisma.notification.createMany({
          data: admins.map((admin) => ({
            userId: admin.id, type: 'FINANCE_DIGEST', title: `Finance: ${alerts.length} item${alerts.length === 1 ? '' : 's'} need attention`,
            message: alerts.slice(0, 4).map((alert) => `${alert.label} (${alert.count})`).join(' · '),
            link: `/${admin.role === 'SUPER_ADMIN' ? 'superadmin' : 'admin'}/finance/workspace?module=alerts-pending-approvals`,
          })),
        });
        result.alertDigest = { notified: admins.length, alerts: alerts.length };
      } else result.alertDigest = { notified: 0 };
    } catch (error) { result.alertDigest = { error: (error as Error).message }; }
  }
  await writeConfig('automationState', { lastRunDate: today, lastResult: { ...result, at: new Date().toISOString() } });
  return result;
};

// ---------------------------------------------------------------------------
// Tax configuration
// ---------------------------------------------------------------------------

type TdsSection = { section: string; nature: string; rate: number; rateNoPan: number; threshold: number | null; thresholdNote: string | null };
/** Defaults for FY 2025-26 onwards; the law changes, so the list is editable. Verify with the CA. */
export const DEFAULT_TDS_SECTIONS: TdsSection[] = [
  { section: '192', nature: 'Salary', rate: 0, rateNoPan: 20, threshold: null, thresholdNote: 'Slab rates on estimated annual income' },
  { section: '194A', nature: 'Interest (other than securities)', rate: 10, rateNoPan: 20, threshold: 10000, thresholdNote: 'Per year (₹50,000 for banks / senior citizens)' },
  { section: '194C', nature: 'Contractors (individual / HUF 1%, others 2%)', rate: 2, rateNoPan: 20, threshold: 30000, thresholdNote: 'Single bill; ₹1,00,000 a year' },
  { section: '194H', nature: 'Commission / brokerage', rate: 2, rateNoPan: 20, threshold: 20000, thresholdNote: 'Per year' },
  { section: '194I', nature: 'Rent of land / building (plant & machinery 2%)', rate: 10, rateNoPan: 20, threshold: 50000, thresholdNote: 'Per month' },
  { section: '194J', nature: 'Professional fees (technical services 2%)', rate: 10, rateNoPan: 20, threshold: 50000, thresholdNote: 'Per year' },
  { section: '194Q', nature: 'Purchase of goods', rate: 0.1, rateNoPan: 5, threshold: 5000000, thresholdNote: 'Above ₹50 lakh a year (buyer turnover > ₹10 cr)' },
];
export const DEFAULT_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40];

export const getTaxConfig = async () => {
  const config = await readConfig();
  const tax = section(config, 'tax', { tdsSections: DEFAULT_TDS_SECTIONS, gstRates: DEFAULT_GST_RATES } as Record<string, unknown>);
  return { tdsSections: tax.tdsSections as TdsSection[], gstRates: tax.gstRates as number[], marginSchemeRate: 18 };
};

export const saveTaxConfig = async (body: Record<string, unknown>, context: ActorContext) => {
  const sections = Array.isArray(body.tdsSections) ? (body.tdsSections as Array<Record<string, unknown>>) : null;
  if (!sections?.length) throw badRequest('Keep at least one TDS section.');
  const tdsSections = sections.map((row, index) => {
    const code = String(row.section ?? '').trim().toUpperCase();
    if (!/^(19[0-9][A-Z]{0,3}|206[A-Z0-9]{0,4})$/.test(code)) throw badRequest(`Row ${index + 1}: section looks wrong.`);
    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) throw badRequest(`Row ${index + 1}: rate looks wrong.`);
    return { section: code, nature: String(row.nature ?? '').slice(0, 120), rate, rateNoPan: Number(row.rateNoPan) || 20, threshold: row.threshold === null || row.threshold === '' ? null : Number(row.threshold) || null, thresholdNote: row.thresholdNote ? String(row.thresholdNote).slice(0, 120) : null };
  });
  const gstRates = Array.isArray(body.gstRates) ? Array.from(new Set((body.gstRates as unknown[]).map(Number).filter((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 50))).sort((a, b) => a - b) : DEFAULT_GST_RATES;
  await writeConfig('tax', { tdsSections, gstRates });
  await writeFinAudit({ ...context, entityType: 'FinTaxConfig', entityId: 'tax', action: 'SAVE', after: { sections: tdsSections.length, gstRates } });
  return getTaxConfig();
};
