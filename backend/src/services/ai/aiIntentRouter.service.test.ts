import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAiMessage, routeAiMessage, type AiIntentContextMessage } from './aiIntentRouter.service';

test('routes an English listing count question to the read-only statistics tool', () => {
  assert.deepEqual(routeAiMessage('How many listings do we have?'), {
    name: 'listing.statistics',
    arguments: {},
  });
});

test('routes Hinglish listing questions and preserves an explicit day range', () => {
  assert.deepEqual(routeAiMessage('meri total listing pichle 7 din me kitni bani?'), {
    name: 'listing.statistics',
    arguments: { days: 7 },
  });
  assert.deepEqual(routeAiMessage('why not count listing btao'), {
    name: 'listing.statistics',
    arguments: {},
  });
});

test('routes an explicit listing search to the permissioned search tool', () => {
  assert.deepEqual(routeAiMessage('search listings for JCB 3DX'), {
    name: 'listing.search',
    arguments: { query: 'jcb 3dx', limit: 10 },
  });
  assert.deepEqual(routeAiMessage('show me JCB 3DX listings'), {
    name: 'listing.search',
    arguments: { query: 'jcb 3dx', limit: 10 },
  });
});

test('normalizes Devanagari Hindi, Hinglish spelling variants, and routes the same intent', () => {
  assert.deepEqual(routeAiMessage('\u0915\u093f\u0924\u0928\u0940 \u0932\u093f\u0938\u094d\u091f\u093f\u0902\u0917 \u0939\u0948\u0902?'), {
    name: 'listing.statistics',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('meri total listng pichle 7 din me kitni bani?'), {
    name: 'listing.statistics',
    arguments: { days: 7 },
  });
});

test('detects registration, listing, invoice, and partner identifiers before generic routing', () => {
  const listingId = '6fc03e62-6ba2-4e2c-8f5e-12eaa2b9d7ac';
  assert.deepEqual(routeAiMessage('listing id ' + listingId + ' ka detail batao'), {
    name: 'listing.detail',
    arguments: { listingId },
  });
  assert.deepEqual(routeAiMessage('invoice no JCB/26-27/0001 ka detail batao'), {
    name: 'listing.detail',
    arguments: { invoiceNumber: 'JCB/26-27/0001' },
  });
  assert.deepEqual(routeAiMessage('CG04NF0268 ka engine number/status batao'), {
    name: 'vehicle.identity',
    arguments: { query: 'CG04NF0268' },
  });
  assert.deepEqual(routeAiMessage('partner code CG-RAIPUR-01 ka performance batao'), {
    name: 'partner.performance',
    arguments: { partnerCode: 'CG-RAIPUR-01' },
  });
});

test('routes a generic listing request to the safe inventory summary tool', () => {
  assert.deepEqual(routeAiMessage('show me the listings'), {
    name: 'listing.summary',
    arguments: {},
  });
});

test('does not route mutation requests to read-only tools', () => {
  assert.equal(routeAiMessage('Create a new listing for this vehicle'), null);
  assert.equal(routeAiMessage('Delete the listing with id 123'), null);
});

test('routes supported operational aggregate questions', () => {
  assert.equal(routeAiMessage('show pending KYC cases')?.name, 'pending.kyc');
  assert.equal(routeAiMessage('how much revenue did we make this month')?.name, 'revenue.summary');
  assert.equal(routeAiMessage('give me the lead statistics for the last 30 days')?.name, 'lead.statistics');
});

test('routes CRM lead totals and lead lists to the scoped CRM summary tool', () => {
  assert.deepEqual(routeAiMessage('crm me kitne leads hai'), {
    name: 'crm.leads.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('how many leads are in CRM'), {
    name: 'crm.leads.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('crm me kaun kaun se leads hain'), {
    name: 'crm.leads.summary',
    arguments: {},
  });
});

test('routes a specific CRM lead question to the safe lead detail tool', () => {
  assert.deepEqual(routeAiMessage('show lead details for Ramesh JCB 3DX'), {
    name: 'crm.lead.detail',
    arguments: { query: 'ramesh jcb 3dx' },
  });
});

test('detects a lead ID and preserves that lead for a detail follow-up', () => {
  const leadId = '6fc03e62-6ba2-4e2c-8f5e-12eaa2b9d7ac';
  assert.deepEqual(routeAiMessage(`lead id ${leadId} ka status batao`), {
    name: 'crm.lead.detail',
    arguments: { leadId },
  });

  const result = resolveAiMessage('iska owner status batao', [
    { role: 'USER', content: `lead id ${leadId} ka status batao` },
    { role: 'ASSISTANT', content: 'Lead details fetched.', toolName: 'crm.lead.detail' },
  ]);
  assert.deepEqual(result, {
    kind: 'tool',
    request: { name: 'crm.lead.detail', arguments: { leadId } },
  });
});

test('asks for a lead identifier when lead details are requested without a specific lead', () => {
  const result = resolveAiMessage('leads ka detail batao');
  assert.equal(result.kind, 'clarification');
  if (result.kind === 'clarification') assert.match(result.message, /specific lead/i);
});

test('routes listing inventory lists to a summary that includes safe item rows', () => {
  assert.deepEqual(routeAiMessage('vehicle listing me kon kon se listing hia btao mujhe'), {
    name: 'listing.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('which listings are available'), {
    name: 'listing.summary',
    arguments: { status: 'PUBLISHED' },
  });
  assert.deepEqual(routeAiMessage('show me all vehicle listings'), {
    name: 'listing.summary',
    arguments: {},
  });
});

test('keeps a listing status follow-up on the item-returning summary tool', () => {
  const result = resolveAiMessage('PUBLISHED: 7 iska detail batao', [
    { role: 'USER', content: 'vehicle listing me kon kon se listing hia btao mujhe' },
    { role: 'ASSISTANT', content: 'Listing summary fetched.', toolName: 'listing.statistics' },
  ]);
  assert.deepEqual(result, {
    kind: 'tool',
    request: { name: 'listing.summary', arguments: { status: 'PUBLISHED' } },
  });
});

test('routes Phase 3 detail and trend questions to safe read-only tools', () => {
  assert.deepEqual(routeAiMessage('show me details for JCB 3DX listing'), {
    name: 'listing.detail',
    arguments: { query: 'jcb 3dx' },
  });
  assert.deepEqual(routeAiMessage('how many sold vehicles in the last 14 days'), {
    name: 'sold.vehicles',
    arguments: { days: 14 },
  });
  assert.deepEqual(routeAiMessage('show inventory trend for the last 30 days'), {
    name: 'inventory.trend',
    arguments: { days: 30 },
  });
  assert.deepEqual(routeAiMessage('which partners have the best performance'), {
    name: 'partner.performance',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('show finance trend this month'), {
    name: 'finance.trend',
    arguments: { days: 30 },
  });
});

test('routes partner lists and finance activity questions to bounded summary tools', () => {
  assert.deepEqual(routeAiMessage('which partners are there'), {
    name: 'partner.statistics',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('partners ki list dikhao'), {
    name: 'partner.statistics',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('show finance transactions for last 7 days'), {
    name: 'finance.trend',
    arguments: { days: 7 },
  });
});

test('routes Phase 5 finance and commercial questions to dedicated read-only tools', () => {
  assert.equal(routeAiMessage('show invoices and bills for last 30 days')?.name, 'invoice.summary');
  assert.equal(routeAiMessage('payment receipts ka summary batao')?.name, 'payment.summary');
  assert.equal(routeAiMessage('margin report for this month')?.name, 'margin.summary');
  assert.equal(routeAiMessage('API wallet balance batao')?.name, 'wallet.summary');
  assert.equal(routeAiMessage('show API billing usage')?.name, 'api.billing.summary');
  assert.equal(routeAiMessage('sell accounts ka status batao')?.name, 'sell.accounts.summary');
  assert.equal(routeAiMessage('refunds ka summary batao')?.name, 'refund.summary');
  assert.equal(routeAiMessage('finance workspace summary')?.name, 'finance.workspace.summary');
  assert.equal(routeAiMessage('journal activity dikhao')?.name, 'journal.summary');
  assert.equal(routeAiMessage('accounting chart of accounts summary')?.name, 'accounting.summary');
});

test('routes Phase 6 remaining-module questions to dedicated read-only tools', () => {
  assert.equal(routeAiMessage('show categories summary')?.name, 'categories.summary');
  assert.equal(routeAiMessage('brands ki list batao')?.name, 'brands.summary');
  assert.equal(routeAiMessage('show models for this month')?.name, 'models.summary');
  assert.equal(routeAiMessage('locations ka summary batao')?.name, 'locations.summary');
  assert.equal(routeAiMessage('show blog status')?.name, 'blogs.summary');
  assert.equal(routeAiMessage('translation catalog summary')?.name, 'translations.summary');
  assert.equal(routeAiMessage('platform settings ka status batao')?.name, 'settings.summary');
  assert.equal(routeAiMessage('show users summary')?.name, 'users.summary');
  assert.equal(routeAiMessage('roles ki list dikhao')?.name, 'roles.summary');
  assert.equal(routeAiMessage('subscription status batao')?.name, 'subscriptions.summary');
});

test('routes Phase 3 customer, enquiry, and task questions to dedicated tools', () => {
  assert.deepEqual(routeAiMessage('show all customers and visitors'), {
    name: 'customer.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('customer Ramesh ka detail batao'), {
    name: 'customer.detail',
    arguments: { query: 'ramesh' },
  });
  assert.deepEqual(routeAiMessage('crm ki enquiries dikhao'), {
    name: 'enquiry.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('enquiry details for JCB 3DX'), {
    name: 'enquiry.detail',
    arguments: { query: 'jcb 3dx' },
  });
  assert.deepEqual(routeAiMessage('pending tasks ka summary batao'), {
    name: 'tasks.summary',
    arguments: {},
  });
});

test('routes Vehicle Identity and RTO/Documents questions to bounded read-only tools', () => {
  assert.deepEqual(routeAiMessage('what is the verification status of vehicle CG04NF0268'), {
    name: 'vehicle.identity',
    arguments: { query: 'CG04NF0268' },
  });
  assert.deepEqual(routeAiMessage('RC documents ka status btao'), {
    name: 'rto.documents.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('show RTO document readiness for last 14 days'), {
    name: 'rto.documents.summary',
    arguments: { days: 14 },
  });
});

test('routes Phase 3 verification and provider status questions to safe summaries', () => {
  assert.deepEqual(routeAiMessage('PAN GST Aadhaar verification status btao'), {
    name: 'verification.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('is Surepass configured and working?'), {
    name: 'surepass.status',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('WhatsApp templates and integration status'), {
    name: 'whatsapp.status',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('SMS delivery last 7 days'), {
    name: 'sms.activity.summary',
    arguments: { days: 7 },
  });
  assert.deepEqual(routeAiMessage('kitne notifications unread hain'), {
    name: 'notifications.summary',
    arguments: {},
  });
});

test('routes Phase 4 campaign and delivery-log questions to bounded read-only tools', () => {
  assert.deepEqual(routeAiMessage('show WhatsApp campaigns status'), {
    name: 'whatsapp.campaigns.summary',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('show combined WhatsApp and SMS delivery logs for last 7 days'), {
    name: 'communication.delivery.summary',
    arguments: { days: 7 },
  });
});

test('does not auto-route Phase 3 mutation requests', () => {
  assert.equal(routeAiMessage('sell this vehicle now'), null);
  assert.equal(routeAiMessage('update partner performance record'), null);
});

test('routes future operational questions to the forecast tool with metric and horizon', () => {
  assert.deepEqual(routeAiMessage('forecast inventory for the next 14 days'), {
    name: 'forecast.operations',
    arguments: { metric: 'inventory', horizon: 14 },
  });
  assert.deepEqual(routeAiMessage('how many vehicles will we sell next month?'), {
    name: 'forecast.operations',
    arguments: { metric: 'sales', horizon: 30 },
  });
  assert.deepEqual(routeAiMessage('predict finance cash flow for next 7 days'), {
    name: 'forecast.operations',
    arguments: { metric: 'finance', horizon: 7 },
  });
  assert.deepEqual(routeAiMessage('predict CRM leads for next 14 days'), {
    name: 'forecast.operations',
    arguments: { metric: 'leads', horizon: 14 },
  });
  assert.deepEqual(routeAiMessage('KYC verification forecast for next month'), {
    name: 'forecast.operations',
    arguments: { metric: 'kyc', horizon: 30 },
  });
  assert.deepEqual(routeAiMessage('partner onboarding forecast for next 7 days'), {
    name: 'forecast.operations',
    arguments: { metric: 'partners', horizon: 7 },
  });
  assert.deepEqual(routeAiMessage('payment collection forecast for next 7 days'), {
    name: 'forecast.operations',
    arguments: { metric: 'collections', horizon: 7 },
  });
});

test('uses the multilingual question catalog for WhatsApp shorthand and intent aliases', () => {
  assert.deepEqual(routeAiMessage('listng cnt pls'), {
    name: 'listing.statistics',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('partners ka status batao'), {
    name: 'partner.performance',
    arguments: {},
  });
  assert.deepEqual(routeAiMessage('finance compare karo this month vs last month'), {
    name: 'finance.trend',
    arguments: { days: 30 },
  });
});

test('does not execute a vehicle identity lookup without a bounded identifier or query', () => {
  assert.equal(routeAiMessage('vehicle identity status batao'), null);
  assert.equal(routeAiMessage('vehicle status batao'), null);
  assert.equal(routeAiMessage('owner information batao'), null);
});

test('does not treat an immediate sell command as a forecast', () => {
  assert.equal(routeAiMessage('sell this vehicle now'), null);
});

test('returns null for unrelated or ambiguous messages', () => {
  assert.equal(routeAiMessage('hello'), null);
  assert.equal(routeAiMessage('Explain how the listing workflow works'), null);
});

test('resolves a generic listing request with the inventory summary tool', () => {
  const result = resolveAiMessage('show me the listings');
  assert.deepEqual(result, {
    kind: 'tool',
    request: { name: 'listing.summary', arguments: {} },
  });
});

test('routes Hindi and Hinglish generic listing requests to the inventory summary tool', () => {
  const hindi = resolveAiMessage('\u0926\u093f\u0916\u093e\u0913 \u0932\u093f\u0938\u094d\u091f\u093f\u0902\u0917');
  const hinglish = resolveAiMessage('listing dikhao');
  assert.deepEqual(hindi, { kind: 'tool', request: { name: 'listing.summary', arguments: {} } });
  assert.deepEqual(hinglish, { kind: 'tool', request: { name: 'listing.summary', arguments: {} } });
});

test('keeps a natural follow-up on the previous read-only tool and entity', () => {
  const context: AiIntentContextMessage[] = [
    { role: 'USER', content: 'show me details for JCB 3DX listing' },
    { role: 'ASSISTANT', content: 'Listing details fetched.', toolName: 'listing.detail' },
  ];
  const result = resolveAiMessage('iska invoice batao', context);
  assert.deepEqual(result, {
    kind: 'tool',
    request: { name: 'listing.detail', arguments: { query: 'jcb 3dx' } },
  });
});

test('uses a previous aggregate subject for a short range follow-up', () => {
  const context: AiIntentContextMessage[] = [
    { role: 'USER', content: 'how many listings do we have?' },
    { role: 'ASSISTANT', content: 'There are 12 listings.', toolName: 'listing.statistics' },
  ];
  const result = resolveAiMessage('pichle 7 din ka batao', context);
  assert.deepEqual(result, {
    kind: 'tool',
    request: { name: 'listing.statistics', arguments: { days: 7 } },
  });
});
