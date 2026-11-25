import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildIdentityPatch,
  describeLoginStatusHint,
  describeSaveNotice,
  detectIdentityChanges,
  getLoginStatusClass,
  isProfileFormDirty,
  isValidStoredMobile,
  mergeProfileForm,
  sameEmail,
  sameMobile,
  toProfileForm,
  toStoredMobile,
  validateIdentity,
  validateLoginPassword,
} from './hrmLogin';

const baseline = { workEmail: 'asha@example.com', mobile: '9876543210' };

test('email and mobile are compared the way the login compares them', () => {
  assert.equal(sameEmail(' Asha@Example.com ', 'asha@example.com'), true);
  assert.equal(sameEmail('asha@example.com', 'other@example.com'), false);
  assert.equal(sameEmail(null, ''), true);
  assert.equal(sameMobile('+91 98765 43210', '9876543210'), true);
  assert.equal(sameMobile('09876543210', '9876543210'), true);
  assert.equal(sameMobile('9876543211', '9876543210'), false);
  assert.equal(sameMobile('', null), true);
});

test('only fields that differ count as changed', () => {
  assert.deepEqual(detectIdentityChanges({ workEmail: 'ASHA@example.com', mobile: '+919876543210' }, baseline), { email: false, mobile: false });
  assert.deepEqual(detectIdentityChanges({ workEmail: 'new@example.com', mobile: '9876543210' }, baseline), { email: true, mobile: false });
  assert.deepEqual(detectIdentityChanges({ workEmail: 'asha@example.com', mobile: '9000000000' }, baseline), { email: false, mobile: true });
});

test('a login holder is checked on what changed: email required and valid, mobile ten digits, nothing truncated', () => {
  assert.deepEqual(validateIdentity({ workEmail: 'asha@example.com', mobile: '9876543210' }, baseline, true), {});
  assert.equal(validateIdentity({ workEmail: '  ', mobile: '9876543210' }, baseline, true).workEmail, 'A login needs an email address.');
  assert.equal(validateIdentity({ workEmail: 'asha@', mobile: '9876543210' }, baseline, true).workEmail, 'Enter a valid email address.');
  assert.equal(validateIdentity({ workEmail: 'asha@example.com', mobile: '98765' }, baseline, true).mobile, 'Enter a valid 10-digit mobile number.');
  assert.equal(validateIdentity({ workEmail: 'asha@example.com', mobile: '98765 43210 99' }, baseline, true).mobile, 'Enter a valid 10-digit mobile number.');
  assert.ok(validateIdentity({ workEmail: 'asha@example.com', mobile: '' }, baseline, true).mobile);
  // a stored value that is not touched is not judged again, even if it would not pass today
  assert.deepEqual(validateIdentity({ workEmail: 'legacy', mobile: '12345' }, { workEmail: 'legacy', mobile: '12345' }, true), {});
  // no mobile on the login yet: leaving it empty is fine
  assert.deepEqual(validateIdentity({ workEmail: 'asha@example.com', mobile: '' }, { workEmail: 'asha@example.com', mobile: null }, true), {});
});

test('somebody without a login: an empty form is fine, a typed email or mobile must be one the server accepts', () => {
  assert.deepEqual(validateIdentity({ workEmail: '', mobile: '' }, { workEmail: null, mobile: null }, false), {});
  assert.equal(validateIdentity({ workEmail: 'not-an-email', mobile: '' }, { workEmail: null, mobile: null }, false).workEmail, 'Enter a valid email address.');
  // the client email rule is the server's (zod) rule, not a looser one
  assert.equal(validateIdentity({ workEmail: 'a..b@example.com', mobile: '' }, { workEmail: null, mobile: null }, false).workEmail, 'Enter a valid email address.');
  assert.match(validateIdentity({ workEmail: '', mobile: '12345' }, { workEmail: null, mobile: null }, false).mobile ?? '', /8 to 15 digits/);
  assert.deepEqual(validateIdentity({ workEmail: '', mobile: '98765 43210' }, { workEmail: null, mobile: null }, false), {});
  assert.deepEqual(validateIdentity({ workEmail: '', mobile: '+44 7911 123456' }, { workEmail: null, mobile: null }, false), {});
  // a stored number that is not touched is not judged again
  assert.deepEqual(validateIdentity({ workEmail: '', mobile: '12345' }, { workEmail: null, mobile: '12345' }, false), {});
});

test('the patch of a login holder carries only what changed, with the mobile as ten digits', () => {
  assert.deepEqual(buildIdentityPatch({ workEmail: 'asha@example.com', mobile: '9876543210' }, baseline, true), {});
  assert.deepEqual(buildIdentityPatch({ workEmail: ' new@example.com ', mobile: '9876543210' }, baseline, true), { workEmail: 'new@example.com' });
  assert.deepEqual(buildIdentityPatch({ workEmail: 'asha@example.com', mobile: '+91 90000-00000' }, baseline, true), { mobile: '9000000000' });
  assert.deepEqual(buildIdentityPatch({ workEmail: 'asha@example.com', mobile: '' }, baseline, true), { mobile: null });
});

test('the patch without a login carries only what changed, with the mobile the way it is stored', () => {
  assert.deepEqual(buildIdentityPatch({ workEmail: ' a@b.co ', mobile: ' 98765 43210 ' }, { workEmail: null, mobile: null }, false), { workEmail: 'a@b.co', mobile: '9876543210' });
  assert.deepEqual(buildIdentityPatch({ workEmail: '', mobile: '' }, { workEmail: 'x@y.co', mobile: '9876543210' }, false), { workEmail: null, mobile: null });
  assert.deepEqual(buildIdentityPatch({ workEmail: 'x@y.co', mobile: '+91 98765-43210' }, { workEmail: 'x@y.co', mobile: '9876543210' }, false), {});
  assert.deepEqual(buildIdentityPatch({ workEmail: 'x@y.co', mobile: '+44 7911 123456' }, { workEmail: 'x@y.co', mobile: '9876543210' }, false), { mobile: '+447911123456' });
});

test('a stored mobile is 8-15 characters including the plus, exactly like the server rule', () => {
  assert.equal(toStoredMobile(' +91 98765 43210 '), '9876543210');
  assert.equal(toStoredMobile('09876543210'), '9876543210');
  assert.equal(toStoredMobile('+44 7911 123456'), '+447911123456');
  assert.equal(toStoredMobile('   '), '');
  assert.equal(isValidStoredMobile('9876543210'), true);
  assert.equal(isValidStoredMobile('+12345678901234'), true);
  assert.equal(isValidStoredMobile('+123456789012345'), false);
  assert.equal(isValidStoredMobile('1234567'), false);
  assert.equal(isValidStoredMobile('98765 43210'), false);
});

test('a reload keeps what was typed and refreshes what was not touched', () => {
  const server = toProfileForm({ preferredName: 'Asha', workEmail: 'asha@example.com', mobile: '9876543210', status: 'ACTIVE', version: 3 });
  const next = toProfileForm({ preferredName: 'Asha K', workEmail: 'asha@corp.com', mobile: '9876543210', status: 'ACTIVE', version: 4 });
  // untouched form: everything follows the server
  assert.deepEqual(mergeProfileForm(server, server, next), next);
  // a typed preferred name survives; the untouched email follows; the version always follows
  const typed = { ...server, preferredName: 'Ashu' };
  assert.deepEqual(mergeProfileForm(typed, server, next), { ...next, preferredName: 'Ashu', version: 4 });
  // first read: the server data is the form
  assert.deepEqual(mergeProfileForm(typed, null, next), next);
  assert.equal(isProfileFormDirty(server, server), false);
  assert.equal(isProfileFormDirty(typed, server), true);
  assert.equal(isProfileFormDirty(typed, null), false);
});

test('the notice says when the person was signed out', () => {
  assert.equal(describeSaveNotice({ email: false, mobile: false }, { hasLogin: true }), 'Employee details saved.');
  assert.equal(describeSaveNotice({ email: true, mobile: false }, { hasLogin: false }), 'Employee details saved.');
  assert.equal(describeSaveNotice({ email: true, mobile: false }, { hasLogin: true }), 'Saved. They have been signed out and must sign in with the new email.');
  assert.equal(describeSaveNotice({ email: false, mobile: true }, { hasLogin: true }), 'Saved. They have been signed out and must sign in with the new mobile number.');
  assert.equal(describeSaveNotice({ email: true, mobile: true }, { hasLogin: true }), 'Saved. They have been signed out and must sign in with the new email and mobile.');
  assert.match(describeSaveNotice({ email: true, mobile: false }, { hasLogin: true, ownLogin: true }), /Your own sign-in email changed/);
});

test('password length is checked in characters and in bytes', () => {
  assert.equal(validateLoginPassword('Strong@123'), null);
  assert.match(validateLoginPassword('short') ?? '', /at least 8/);
  assert.equal(validateLoginPassword('x'.repeat(72)), null);
  assert.match(validateLoginPassword('x'.repeat(73)) ?? '', /72 bytes/);
  assert.match(validateLoginPassword('é'.repeat(37)) ?? '', /72 bytes/);
  assert.equal(validateLoginPassword('é'.repeat(36)), null);
});

test('a login that cannot sign in gets a hint, an active one does not', () => {
  assert.equal(describeLoginStatusHint('ACTIVE'), null);
  assert.equal(describeLoginStatusHint(undefined), null);
  assert.match(describeLoginStatusHint('INACTIVE') ?? '', /Deactivate \/ Reactivate/);
  assert.match(describeLoginStatusHint('SUSPENDED') ?? '', /Reactivate the employee/);
  assert.match(describeLoginStatusHint('BLOCKED') ?? '', /Users screen/);
});

test('login status chips: green when it can sign in, red when switched off, grey when blocked', () => {
  assert.match(getLoginStatusClass('ACTIVE'), /emerald/);
  assert.match(getLoginStatusClass('INACTIVE'), /rose/);
  assert.match(getLoginStatusClass('SUSPENDED'), /rose/);
  assert.match(getLoginStatusClass('BLOCKED'), /slate/);
});
