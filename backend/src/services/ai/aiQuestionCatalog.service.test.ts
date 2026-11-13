import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AI_QUESTION_CATALOG,
  findSupportedQuestionMatches,
  getQuestionCatalogCoverage,
  normalizeAiQuestion,
} from './aiQuestionCatalog.service';
import type { AiQuestionIntent } from './aiQuestionCatalog.service';

test('catalog covers the standard question families for every operational module', () => {
  const coverage = getQuestionCatalogCoverage();
  const requiredIntents = new Set<AiQuestionIntent>([
    'summary',
    'list',
    'search',
    'detail',
    'status',
    'history',
    'activity',
    'compare',
    'trend',
    'forecast',
  ]);

  assert.ok(AI_QUESTION_CATALOG.length >= 100);
  assert.ok(coverage.modules.length >= 15);
  for (const module of coverage.modules) {
    for (const intent of requiredIntents) {
      assert.ok(
        coverage.byModule[module]?.has(intent),
        `missing ${intent} catalog entry for ${module}`,
      );
    }
  }
});

test('catalog recognizes English, Hindi, Hinglish, spelling variants, and WhatsApp shorthand', () => {
  const queries = [
    'how many listings do we have',
    '\u0915\u093f\u0924\u0928\u0940 \u0932\u093f\u0938\u094d\u091f\u093f\u0902\u0917 \u0939\u0948\u0902',
    'listing me kon kon se hai btao',
    'listng cnt pls',
  ];

  for (const query of queries) {
    const matches = findSupportedQuestionMatches(query);
    assert.ok(matches.some((match) => match.toolName === 'listing.statistics' || match.toolName === 'listing.summary'));
  }
});

test('catalog recognizes detail, status, comparison, trend, and forecast language', () => {
  assert.equal(findSupportedQuestionMatches('show listing details for JCB 3DX')[0]?.intent, 'detail');
  assert.equal(findSupportedQuestionMatches('partner ka status batao')[0]?.intent, 'status');
  assert.equal(findSupportedQuestionMatches('compare finance this month vs last month')[0]?.intent, 'compare');
  assert.equal(findSupportedQuestionMatches('inventory ka trend dikhao')[0]?.intent, 'trend');
  assert.equal(findSupportedQuestionMatches('agle 14 din ka sales forecast')[0]?.intent, 'forecast');
});

test('normalization keeps identifiers and user words usable for routing', () => {
  assert.equal(normalizeAiQuestion('  LISTNG   CNT: CG04NF0268  '), 'listing count cg04nf0268');
});

test('planned catalog coverage never appears as an executable supported match', () => {
  const matches = findSupportedQuestionMatches('show all customer contacts and visitors');
  assert.ok(matches.every((match) => match.coverage === 'supported'));
});

test('catalog exposes dedicated customer, enquiry, and task operational tools', () => {
  assert.ok(findSupportedQuestionMatches('show all customers and visitors').some((match) => match.toolName === 'customer.summary'));
  assert.ok(findSupportedQuestionMatches('customer Ramesh ka detail batao').some((match) => match.toolName === 'customer.detail'));
  assert.ok(findSupportedQuestionMatches('crm ki enquiries dikhao').some((match) => match.toolName === 'enquiry.summary'));
  assert.ok(findSupportedQuestionMatches('enquiry details for JCB 3DX').some((match) => match.toolName === 'enquiry.detail'));
  assert.ok(findSupportedQuestionMatches('pending tasks ka summary batao').some((match) => match.toolName === 'tasks.summary'));
});

test('catalog exposes Phase 4 campaign and delivery-log tools', () => {
  assert.ok(findSupportedQuestionMatches('show WhatsApp campaigns status').some((match) => match.toolName === 'whatsapp.campaigns.summary'));
  assert.ok(findSupportedQuestionMatches('show WhatsApp and SMS delivery logs').some((match) => match.toolName === 'communication.delivery.summary'));
});

test('catalog exposes Phase 5 finance and commercial tools', () => {
  assert.ok(findSupportedQuestionMatches('show invoice summary').some((match) => match.toolName === 'invoice.summary'));
  assert.ok(findSupportedQuestionMatches('payments summary').some((match) => match.toolName === 'payment.summary'));
  assert.ok(findSupportedQuestionMatches('show margin report').some((match) => match.toolName === 'margin.summary'));
  assert.ok(findSupportedQuestionMatches('show api billing usage').some((match) => match.toolName === 'api.billing.summary'));
  assert.ok(findSupportedQuestionMatches('show refund history').some((match) => match.toolName === 'refund.summary'));
  assert.ok(findSupportedQuestionMatches('show finance workspace summary').some((match) => match.toolName === 'finance.workspace.summary'));
  assert.ok(findSupportedQuestionMatches('show journal trend').some((match) => match.toolName === 'journal.summary'));
});

test('catalog exposes Phase 6 remaining-module tools', () => {
  assert.ok(findSupportedQuestionMatches('categories summary').some((match) => match.toolName === 'categories.summary'));
  assert.ok(findSupportedQuestionMatches('brands summary').some((match) => match.toolName === 'brands.summary'));
  assert.ok(findSupportedQuestionMatches('models summary').some((match) => match.toolName === 'models.summary'));
  assert.ok(findSupportedQuestionMatches('locations summary').some((match) => match.toolName === 'locations.summary'));
  assert.ok(findSupportedQuestionMatches('blogs summary').some((match) => match.toolName === 'blogs.summary'));
  assert.ok(findSupportedQuestionMatches('translations summary').some((match) => match.toolName === 'translations.summary'));
  assert.ok(findSupportedQuestionMatches('settings summary').some((match) => match.toolName === 'settings.summary'));
  assert.ok(findSupportedQuestionMatches('users summary').some((match) => match.toolName === 'users.summary'));
  assert.ok(findSupportedQuestionMatches('roles summary').some((match) => match.toolName === 'roles.summary'));
  assert.ok(findSupportedQuestionMatches('subscriptions summary').some((match) => match.toolName === 'subscriptions.summary'));
});
