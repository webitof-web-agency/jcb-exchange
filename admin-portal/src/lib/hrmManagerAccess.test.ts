import assert from 'node:assert/strict';
import test from 'node:test';
import type { HrmManagerAccessContext } from './hrmApi';
import {
  accessBlockedMessage, canOfferAccess, createChargeForm, createManagerAccessForm, describeAccessResult, describeChargePeriod, describeEndedCharges,
  endableCharges, KEEP_ROLE, NO_ROLE, toManagerAccessPayload, validateChargeForm,
} from './hrmManagerAccess';

const context = (patch: Partial<HrmManagerAccessContext> = {}): HrmManagerAccessContext => ({
  hasLogin: true, login: { status: 'ACTIVE', isEmployee: true, role: { id: 'r1', name: 'Sales' } }, state: { id: 1, name: 'Gujarat' },
  alreadyHasStateAccess: false, canChangeRole: true, canGrantAccess: true, viewerCanGrant: true, blockedReason: null,
  roles: [{ id: 'r2', name: 'State Manager' }], charges: [], ...patch,
});

test('access is ticked by default and the role is kept unless chosen', () => {
  assert.deepEqual(toManagerAccessPayload(createManagerAccessForm(), context(), 'posting'), { grantStateAccess: true });
  assert.equal(toManagerAccessPayload({ grant: false, roleId: KEEP_ROLE }, context(), 'posting'), undefined);
  assert.deepEqual(toManagerAccessPayload({ grant: false, roleId: 'r2' }, context(), 'posting'), { customRoleId: 'r2' });
  assert.deepEqual(toManagerAccessPayload({ grant: false, roleId: NO_ROLE }, context(), 'posting'), { customRoleId: null });
  // Choosing the role they already have changes nothing.
  assert.equal(toManagerAccessPayload({ grant: false, roleId: 'r1' }, context(), 'posting'), undefined);
});

test('nothing is sent that cannot be given', () => {
  const noLogin = context({ hasLogin: false, login: null, canChangeRole: false, canGrantAccess: false, blockedReason: 'NO_LOGIN' });
  assert.equal(toManagerAccessPayload({ grant: true, roleId: 'r2' }, noLogin, 'posting'), undefined);
  assert.match(accessBlockedMessage(noLogin, 'posting')!, /No login/);
  // A charge may give the access once a login exists.
  assert.deepEqual(toManagerAccessPayload(createManagerAccessForm(), noLogin, 'charge'), { grantStateAccess: true });
  assert.equal(canOfferAccess({ ...noLogin, viewerCanGrant: false }, 'charge'), false);
  assert.equal(canOfferAccess(context({ alreadyHasStateAccess: true }), 'posting'), false);
  assert.equal(canOfferAccess(context({ alreadyHasStateAccess: true }), 'charge'), true);
  // Access that follows the posting moves by itself: no tick, nothing sent, and not a "no permission" message.
  const follows = context({ followsPosting: true, canChangeRole: false });
  assert.equal(canOfferAccess(follows, 'posting'), false);
  assert.equal(toManagerAccessPayload(createManagerAccessForm(), follows, 'posting'), undefined);
  assert.equal(accessBlockedMessage(follows, 'posting'), null);
  assert.equal(toManagerAccessPayload(createManagerAccessForm(), null, 'posting'), undefined);
  assert.match(accessBlockedMessage(context({ blockedReason: 'OWN_RECORD' }), 'posting')!, /somebody else/);
});

test('result and charge sentences', () => {
  assert.equal(describeAccessResult({ access: 'NOT_ASKED', roleChanged: false }), '');
  assert.match(describeAccessResult({ access: 'GRANTED', roleChanged: true }), /State access given\..*role changed/);
  assert.equal(describeEndedCharges([{ officeName: 'Rajasthan State Office' }]), ' Additional charge ended: Rajasthan State Office.');
  assert.equal(describeChargePeriod({ effectiveFrom: '2026-11-01', effectiveTo: null }), 'From 01 Nov 2026, until it is ended');
});

test('the destination office charge ends by itself, so it is not offered', () => {
  const charges = [{ id: 'c1', officeUnitId: 'o1', officeName: 'A', effectiveFrom: '2026-01-01', effectiveTo: null }, { id: 'c2', officeUnitId: 'o2', officeName: 'B', effectiveFrom: '2026-01-01', effectiveTo: null }];
  assert.deepEqual(endableCharges(charges, 'o1').map((charge) => charge.id), ['c2']);
});

test('a new charge needs a person, an office and sensible dates', () => {
  const today = '2026-11-25';
  assert.deepEqual(Object.keys(validateChargeForm(createChargeForm(today), today)).sort(), ['employeeId', 'officeId']);
  const filled = createChargeForm(today, { employeeId: 'e', officeId: 'o' });
  assert.deepEqual(validateChargeForm(filled, today), {});
  assert.ok(validateChargeForm({ ...filled, openEnded: false }, today).effectiveTo);
  assert.ok(validateChargeForm({ ...filled, openEnded: false, effectiveFrom: '2026-11-01', effectiveTo: '2026-11-10' }, today).effectiveTo);
  assert.deepEqual(validateChargeForm({ ...filled, openEnded: false, effectiveTo: '2027-03-31' }, today), {});
});
