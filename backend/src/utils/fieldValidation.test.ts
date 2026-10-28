import assert from 'node:assert/strict';
import test from 'node:test';
import { FieldValidationError, validateAmount, validateField } from './fieldValidation';

test('valid values come back normalised; empty values are allowed', () => {
  assert.equal(validateField('mobile', '+91 98765 43210', 'Mobile'), '9876543210');
  assert.equal(validateField('email', ' Ramesh@Gmail.com ', 'Email'), 'ramesh@gmail.com');
  assert.equal(validateField('pan', 'abcde1234f', 'PAN'), 'ABCDE1234F');
  assert.equal(validateField('ifsc', 'sbin0001234', 'IFSC'), 'SBIN0001234');
  assert.equal(validateField('pincode', '492 001', 'PIN code'), '492001');
  assert.equal(validateField('vehicle', 'cg 04 dm-1005', 'Vehicle number'), 'CG04DM1005');
  assert.equal(validateField('vehicle', 'MP09A1234', 'Vehicle number'), 'MP09A1234');
  assert.equal(validateField('vehicle', '22 BH 1234 AB', 'Vehicle number'), '22BH1234AB');
  assert.equal(validateField('mobile', '', 'Mobile'), null);
  assert.equal(validateField('gstin', null, 'GSTIN'), null);
});

test('wrong formats are rejected with the field label', () => {
  const cases: Array<[Parameters<typeof validateField>[0], string]> = [
    ['mobile', '12345'], ['mobile', '5876543210'], ['email', 'ramesh@'], ['email', 'a b@x.com'], ['pan', 'ABCD1234F'],
    ['gstin', '22ABCDE1234F1Z0'], ['ifsc', 'SBIN1234567'], ['pincode', '012345'], ['vehicle', 'HELLO'], ['vehicle', '1234'],
  ];
  for (const [kind, value] of cases) {
    assert.throws(() => validateField(kind, value, 'Field X', { field: 'x' }), (error: unknown) =>
      error instanceof FieldValidationError && error.status === 400 && error.field === 'x' && error.message.startsWith('Field X: '), `${kind} ${value}`);
  }
});

test('an unchanged stored value is accepted, a changed one is checked', () => {
  assert.equal(validateField('mobile', '12345', 'Mobile', { previous: '12345' }), '12345');
  assert.throws(() => validateField('mobile', '123456', 'Mobile', { previous: '12345' }), FieldValidationError);
});

test('amounts', () => {
  assert.equal(validateAmount('1,25,000.50', 'Price'), 125000.5);
  assert.equal(validateAmount(0, 'Price'), 0);
  assert.equal(validateAmount('', 'Price'), null);
  assert.throws(() => validateAmount('-5', 'Price'), /Price: enter an amount/);
  assert.throws(() => validateAmount('1.234', 'Price'), FieldValidationError);
  assert.throws(() => validateAmount('abc', 'Price'), FieldValidationError);
  assert.throws(() => validateAmount('99999999999', 'Price'), /too large/);
  assert.throws(() => validateAmount('0', 'Price', { allowZero: false }), /greater than 0/);
});
