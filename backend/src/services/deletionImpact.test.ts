import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDeleteRequest, DeletionBlockedError, finishImpact, group } from './deletionImpact';

const base = {
  entityType: 'CUSTOMER' as const,
  entityId: 'user-1',
  name: 'Ramesh',
  subtitle: '',
  currentStatus: 'ACTIVE',
  viewerCanDelete: true,
  viewerDeleteNote: null,
  alternatives: [],
};

test('empty groups are dropped and blockers are listed with their counts', () => {
  const impact = finishImpact(base, [
    group('notifications', 'Notifications', 3, 'DELETED'),
    group('listings', 'Listings', 0, 'OPTIONAL'),
    group('payments', 'Website payments', 2, 'BLOCKS'),
  ]);
  assert.deepEqual(impact.groups.map((item) => item.key), ['notifications', 'payments']);
  assert.deepEqual(impact.blockers, ['Website payments (2)']);
  assert.equal(impact.canDelete, false);
  assert.deepEqual(impact.requiredSelections, ['notifications']);
});

test('a blocked record is never deleted, whatever is ticked', () => {
  const impact = finishImpact(base, [group('payments', 'Website payments', 1, 'BLOCKS')]);
  assert.throws(() => assertDeleteRequest(impact, { include: ['payments'], confirmation: 'DELETE', reason: 'test reason' }, { requireReason: true }), DeletionBlockedError);
});

test('every DELETED group with rows must be ticked; OPTIONAL groups are a free choice', () => {
  const impact = finishImpact(base, [
    group('listings', 'Listings', 2, 'DELETED'),
    group('leads', 'Enquiries', 1, 'DELETED'),
    group('files', 'Files in Drive', 4, 'OPTIONAL', undefined, { defaultSelected: true }),
  ]);
  assert.deepEqual(impact.requiredSelections, ['listings', 'leads']);
  assert.equal(impact.groups.find((item) => item.key === 'files')?.defaultSelected, true);
  assert.throws(
    () => assertDeleteRequest(impact, { include: ['listings'], confirmation: 'DELETE', reason: 'duplicate account' }, { requireReason: true }),
    /Tick "Enquiries"/,
  );
  const kept = assertDeleteRequest(impact, { include: ['listings', 'leads'], confirmation: 'DELETE', reason: 'duplicate account' }, { requireReason: true });
  assert.equal(kept.include.has('files'), false);
  const removed = assertDeleteRequest(impact, { include: ['listings', 'leads', 'files'], confirmation: 'DELETE', reason: 'duplicate account' }, { requireReason: true });
  assert.equal(removed.include.has('files'), true);
});

test('the confirmation and, when asked, a reason are required', () => {
  const impact = finishImpact(base, [group('notifications', 'Notifications', 1, 'DELETED')]);
  assert.throws(() => assertDeleteRequest(impact, { include: ['notifications'], confirmation: 'yes' }, { requireReason: false }), /Tick the box/);
  assert.throws(() => assertDeleteRequest(impact, { include: ['notifications'], confirmation: 'delete', reason: 'no' }, { requireReason: true }), /reason/);
  assert.equal(assertDeleteRequest(impact, { include: ['notifications'], confirmation: ' delete ' }, { requireReason: false }).reason, '');
});
