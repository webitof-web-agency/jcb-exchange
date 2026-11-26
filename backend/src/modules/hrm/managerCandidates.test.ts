import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSuggestions, loopReason, managerNote, pickPreselect, reportingManagerWhere } from './managerCandidates';

const base = { purpose: 'manager' as const, managerRole: false, stateName: 'Gujarat', leaverManagerId: null, stateManagerIds: [] as string[], chargeHolderIds: [] as string[], nationalIds: ['nom'] };

test('staff of a state are offered that state\'s manager and charge holder, never the National Operations Manager', () => {
  const list = buildSuggestions({ ...base, stateManagerIds: ['sm'], chargeHolderIds: ['charge', 'sm'] });
  assert.deepEqual(list.map((item) => [item.id, item.reason]), [['sm', 'State Manager of Gujarat'], ['charge', 'Additional charge of Gujarat']]);
});

test('a State Manager is offered the National Operations Manager only', () => {
  const list = buildSuggestions({ ...base, managerRole: true, stateManagerIds: ['sm'] });
  assert.deepEqual(list.map((item) => item.id), ['nom']);
});

test('nobody is suggested to themselves', () => {
  assert.deepEqual(buildSuggestions({ ...base, stateManagerIds: ['me'], excludeId: 'me' }), []);
});

test('a successor: the leaver\'s manager first, then the state, then national for a manager who leaves', () => {
  const list = buildSuggestions({ ...base, purpose: 'successor', managerRole: true, leaverManagerId: 'boss', stateManagerIds: ['other'] });
  assert.deepEqual(list.map((item) => item.id), ['boss', 'other', 'nom']);
});

test('somebody is filled in only when the answer is obvious', () => {
  const manager = { purpose: 'manager' as const, managerRole: false };
  const pick = (ids: Parameters<typeof pickPreselect>[0], input = manager) => pickPreselect(ids, input);
  const sm = (id: string, blocked: string | null = null) => ({ id, kind: 'STATE_MANAGER' as const, reason: '', blocked });
  const charge = (id: string) => ({ id, kind: 'CHARGE' as const, reason: '' });
  const nom = (id: string) => ({ id, kind: 'NATIONAL' as const, reason: '' });
  assert.equal(pick([sm('a'), charge('c')]), 'a');
  assert.equal(pick([sm('a'), sm('b')]), null, 'two managers: HR chooses');
  assert.equal(pick([charge('c')]), 'c');
  assert.equal(pick([sm('a', 'loop'), charge('c')]), 'c', 'a manager who cannot be chosen does not count');
  assert.equal(pick([nom('n')], { purpose: 'manager', managerRole: true }), 'n');
  assert.equal(pick([nom('n'), nom('m')], { purpose: 'manager', managerRole: true }), null);
  assert.equal(pickPreselect([sm('a')], { purpose: 'successor', managerRole: false }), null);
});

test('the note says why nobody is filled in', () => {
  const note = (patch: Partial<Parameters<typeof managerNote>[0]>) => managerNote({ purpose: 'manager', managerRole: false, stateName: 'Gujarat', stateManagers: 1, chargeHolders: 0, nationals: 1, ...patch });
  assert.equal(note({}), null);
  assert.equal(note({ stateManagers: 0 }), 'Gujarat has no State Manager yet.');
  assert.equal(note({ stateManagers: 2 }), 'Gujarat has more than one manager: choose one.');
  assert.equal(note({ managerRole: true, nationals: 0 }), 'No National Operations Manager is set yet.');
  assert.match(note({ managerRole: true, nationals: 2 }) ?? '', /choose one/);
  assert.equal(note({ stateName: null, stateManagers: 0 }), null, 'head office: nothing to say');
  assert.equal(note({ purpose: 'successor', stateManagers: 0 }), null);
});

test('the own team cannot be chosen; a successor may be a direct report', () => {
  assert.equal(loopReason(undefined, 'manager', 'Asha'), null);
  assert.equal(loopReason(1, 'manager', 'Asha'), 'Reports to Asha, so cannot be their manager.');
  assert.match(loopReason(2, 'manager', 'Asha') ?? '', /team/);
  assert.equal(loopReason(1, 'successor', 'Asha'), null);
  assert.match(loopReason(2, 'successor', 'Asha') ?? '', /loop/);
});

test('"Manager not set" is the exact opposite of "Manager set", and leaves out people who left', () => {
  const today = new Date('2026-11-26T00:00:00.000Z');
  const missing = reportingManagerWhere('missing', today).AND as Array<Record<string, unknown>>;
  const assigned = reportingManagerWhere('assigned', today).AND as Array<Record<string, unknown>>;
  assert.deepEqual(missing[0], { status: { notIn: ['EXITED', 'TERMINATED'] } });
  assert.deepEqual(missing[0], assigned[0]);
  assert.deepEqual(missing[1], { NOT: assigned[1] });
});
