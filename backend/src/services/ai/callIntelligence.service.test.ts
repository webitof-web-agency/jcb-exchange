import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCallIntelligence } from './callIntelligence.service';

test('builds bounded call intelligence from call activities without returning notes or contact data', () => {
  const result = buildCallIntelligence([
    { type: 'CALL', title: 'Call connected', content: 'Customer discussed price and asked for callback on 9876543210.', createdAt: '2026-11-14T10:00:00.000Z' },
    { type: 'CALL', title: 'Missed call', content: 'No answer; email john@example.com', createdAt: '2026-11-13T10:00:00.000Z' },
    { type: 'NOTE', title: 'Not a call', content: 'ignore', createdAt: '2026-11-12T10:00:00.000Z' },
  ]);

  assert.deepEqual(result, {
    totalCalls: 2,
    outcomeCounts: { ANSWERED: 1, MISSED: 1, CALLBACK: 0, UNKNOWN: 0 },
    followUpRequired: true,
    topicCounts: { PRICE: 1, FINANCE: 0, RTO: 0, LISTING: 0, SUPPORT: 0, OTHER: 1 },
    recent: [
      { outcome: 'ANSWERED', topic: 'PRICE', occurredAt: '2026-11-14T10:00:00.000Z' },
      { outcome: 'MISSED', topic: 'OTHER', occurredAt: '2026-11-13T10:00:00.000Z' },
    ],
    maskedFields: ['content', 'leadId', 'actorId', 'phone', 'email'],
  });
  assert.equal(JSON.stringify(result).includes('9876543210'), false);
  assert.equal(JSON.stringify(result).includes('john@example.com'), false);
  assert.equal(JSON.stringify(result).includes('Customer discussed'), false);
});

test('handles empty and malformed activity data safely', () => {
  assert.deepEqual(buildCallIntelligence([{}, { type: 'CALL', title: null, content: null, createdAt: 'not-a-date' }]), {
    totalCalls: 1,
    outcomeCounts: { ANSWERED: 0, MISSED: 0, CALLBACK: 0, UNKNOWN: 1 },
    followUpRequired: false,
    topicCounts: { PRICE: 0, FINANCE: 0, RTO: 0, LISTING: 0, SUPPORT: 0, OTHER: 1 },
    recent: [],
    maskedFields: ['content', 'leadId', 'actorId', 'phone', 'email'],
  });
});
