import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeadCopilot, type LeadCopilotInput } from './leadCopilot.service';

const now = new Date('2026-11-14T10:00:00.000Z');

test('lead copilot prioritises an overdue hot lead and prepares a safe follow-up', () => {
  const result = buildLeadCopilot({
    status: 'NEW',
    score: 88,
    temperature: 'HOT',
    priority: 'HIGH',
    leadType: 'BUY',
    listingTitle: '2021 JCB 3DX Backhoe Loader',
    listingPrice: 2_800_000,
    requirementCity: 'Raipur',
    requirementState: 'Chhattisgarh',
    createdAt: '2026-11-10T10:00:00.000Z',
    lastContactedAt: '2026-11-12T10:00:00.000Z',
    nextFollowUpAt: '2026-11-13T10:00:00.000Z',
    slaDueAt: '2026-11-13T12:00:00.000Z',
    slaBreached: true,
  }, now);

  assert.equal(result.followUpState, 'OVERDUE');
  assert.equal(result.nextBestAction, 'CALL_AND_FOLLOW_UP');
  assert.equal(result.urgency, 'HIGH');
  assert.ok(result.reasons.some((reason) => /overdue/i.test(reason)));
  assert.match(result.draftMessage, /2021 JCB 3DX Backhoe Loader/iu);
  assert.match(result.draftMessage, /Raipur/iu);
  assert.equal('id' in result, false);
  assert.equal(result.draftMessage.includes('2,800,000'), false);
});

test('lead copilot suggests discovery for an unqualified lead without inventing facts', () => {
  const input: LeadCopilotInput = {
    status: 'NEW',
    score: null,
    temperature: null,
    priority: 'MEDIUM',
    leadType: 'BUY',
    listingTitle: null,
    listingPrice: null,
    requirementCity: null,
    requirementState: null,
    createdAt: '2026-11-14T09:00:00.000Z',
    lastContactedAt: null,
    nextFollowUpAt: null,
    slaDueAt: null,
    slaBreached: false,
  };

  const result = buildLeadCopilot(input, now);

  assert.equal(result.followUpState, 'NONE');
  assert.equal(result.nextBestAction, 'DISCOVERY');
  assert.equal(result.urgency, 'MEDIUM');
  assert.ok(result.reasons.some((reason) => /qualif/i.test(reason)));
  assert.equal(result.draftMessage.includes('undefined'), false);
});

test('lead copilot marks a closed lead as no-action even when an old follow-up remains', () => {
  const result = buildLeadCopilot({
    status: 'WON',
    score: 90,
    temperature: 'HOT',
    priority: 'HIGH',
    leadType: 'BUY',
    listingTitle: 'JCB machine',
    listingPrice: 1_000_000,
    requirementCity: 'Durg',
    requirementState: 'Chhattisgarh',
    createdAt: '2026-11-01T10:00:00.000Z',
    lastContactedAt: '2026-11-05T10:00:00.000Z',
    nextFollowUpAt: '2026-11-06T10:00:00.000Z',
    slaDueAt: null,
    slaBreached: false,
  }, now);

  assert.equal(result.followUpState, 'CLOSED');
  assert.equal(result.nextBestAction, 'NO_ACTION');
  assert.equal(result.urgency, 'LOW');
});
