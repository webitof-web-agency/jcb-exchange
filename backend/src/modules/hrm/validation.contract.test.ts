import assert from 'node:assert/strict';
import test from 'node:test';
import { HrmHttpError } from './errors';
import { HrmValidationError, parseHrmInput, schemas } from './validation';

test('HRM mutation schemas reject unknown fields and weak idempotency keys', () => {
  assert.throws(
    () => parseHrmInput(schemas.onboardingFromOffer, { idempotencyKey: 'x', unexpected: true }),
    (error: unknown) => error instanceof HrmValidationError,
  );
});

test('HRM employee input is normalized and validated before persistence', () => {
  const input = parseHrmInput(schemas.createEmployee, {
    employeeCode: ' emp-001 ',
    legalName: '  Asha Singh  ',
    source: 'DIRECT_HR',
  });

  assert.deepEqual(input, {
    employeeCode: 'EMP-001',
    legalName: 'Asha Singh',
    source: 'DIRECT_HR',
  });
});

test('HRM KYC links only accept a masked Surepass PAN or Aadhaar verification reference', () => {
  assert.deepEqual(
    parseHrmInput(schemas.linkKycVerification, {
      documentType: 'PAN',
      verificationRecordId: 'pan-record-001',
    }),
    { documentType: 'PAN', verificationRecordId: 'pan-record-001' },
  );

  assert.throws(
    () => parseHrmInput(schemas.linkKycVerification, { documentType: 'PASSPORT', verificationRecordId: 'record-1' }),
    (error: unknown) => error instanceof HrmValidationError,
  );
});

test('HRM bank account input normalizes IFSC and rejects unsafe account-number input', () => {
  assert.deepEqual(
    parseHrmInput(schemas.createBankAccount, {
      bankName: ' HDFC Bank ',
      accountHolderName: ' Asha Singh ',
      accountNumber: '001234567890',
      ifsc: ' hdfc0001234 ',
      isPrimary: true,
    }),
    {
      bankName: 'HDFC Bank',
      accountHolderName: 'Asha Singh',
      accountNumber: '001234567890',
      ifsc: 'HDFC0001234',
      isPrimary: true,
    },
  );

  assert.throws(
    () => parseHrmInput(schemas.createBankAccount, { accountNumber: '12-34' }),
    (error: unknown) => error instanceof HrmValidationError,
  );
});

test('employee directory query accepts a status list, bounds paging and rejects unknown values', () => {
  const query = parseHrmInput(schemas.listEmployeesQuery, {
    status: 'PRE_ONBOARDING, ONBOARDING', search: '  ravi ', page: '2', limit: '50', sort: 'name', order: 'asc', kyc: 'pending', employmentType: 'CONTRACT',
  });
  assert.deepEqual(query.status, ['PRE_ONBOARDING', 'ONBOARDING']);
  assert.equal(query.search, 'ravi');
  assert.equal(query.page, 2);
  assert.equal(query.limit, 50);
  assert.deepEqual(parseHrmInput(schemas.listEmployeesQuery, {}), {});
  for (const bad of [{ limit: '101' }, { page: '0' }, { sort: 'salary' }, { status: 'ACTIVE,BOGUS' }, { kyc: 'maybe' }, { employmentType: 'ROBOT' }]) {
    assert.throws(() => parseHrmInput(schemas.listEmployeesQuery, bad), (error: unknown) => error instanceof HrmValidationError, JSON.stringify(bad));
  }
});

test('bank account numbers are capped at 20 digits so the masked value always fits its column', () => {
  const base = { accountHolderName: 'Asha Singh', ifsc: 'SBIN0001234' };
  assert.doesNotThrow(() => parseHrmInput(schemas.createBankAccount, { ...base, accountNumber: '1'.repeat(20) }));
  assert.throws(() => parseHrmInput(schemas.createBankAccount, { ...base, accountNumber: '1'.repeat(21) }), (error: unknown) => error instanceof HrmValidationError);
});

test('Surepass documents can only be created by the server-side KYC link flow', () => {
  const doc = { category: 'TAX', title: 'PAN', fileRef: 'internal:1' };
  assert.doesNotThrow(() => parseHrmInput(schemas.createDocument, { ...doc, provider: 'MANUAL' }));
  assert.throws(() => parseHrmInput(schemas.createDocument, { ...doc, provider: 'SUREPASS' }), (error: unknown) => error instanceof HrmValidationError);
});

test('validation failures are HRM HTTP errors (400) whose message names the invalid fields', () => {
  try {
    parseHrmInput(schemas.createEmployee, { employeeCode: 'E', legalName: 'Asha', source: 'DIRECT_HR', mobile: '98765 43210' });
    assert.fail('expected a validation error');
  } catch (error) {
    assert.ok(error instanceof HrmHttpError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'HRM_VALIDATION_FAILED');
    assert.match(error.message, /employeeCode/);
    assert.match(error.message, /mobile/);
  }
});

test('add-employee-with-login input is validated, strict and needs a state and city for a state office', () => {
  const base = {
    fullName: ' Asha Singh ', email: 'asha@example.com', mobile: '9876543210', password: 'Strong@123',
    joiningDate: '2026-11-24', designation: 'State Manager', orgUnitId: 'dept-1', locationType: 'HEAD_OFFICE',
  };
  const parsed = parseHrmInput(schemas.onboardEmployee, base);
  assert.equal(parsed.fullName, 'Asha Singh');
  assert.throws(() => parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'STATE_OFFICE' }), (error: unknown) => error instanceof HrmValidationError && /stateId/.test(error.message) && /cityId/.test(error.message));
  assert.doesNotThrow(() => parseHrmInput(schemas.onboardEmployee, { ...base, locationType: 'STATE_OFFICE', stateId: 4040, cityId: 133590 }));
  for (const bad of [{ password: 'short' }, { password: 'x'.repeat(73) }, { email: 'nope' }, { joiningDate: '24-11-2026' }, { unexpected: true }, { employmentType: 'ROBOT' }]) {
    assert.throws(() => parseHrmInput(schemas.onboardEmployee, { ...base, ...bad }), (error: unknown) => error instanceof HrmValidationError, JSON.stringify(bad));
  }
});

test('the login password limit is counted in bytes because bcrypt ignores everything after 72 bytes', () => {
  const base = { fullName: 'Asha Singh', email: 'asha@example.com', mobile: '9876543210', joiningDate: '2026-11-24', designation: 'State Manager', orgUnitId: 'dept-1', locationType: 'HEAD_OFFICE' };
  assert.doesNotThrow(() => parseHrmInput(schemas.onboardEmployee, { ...base, password: 'a'.repeat(72) }));
  assert.throws(() => parseHrmInput(schemas.onboardEmployee, { ...base, password: 'a'.repeat(73) }), (error: unknown) => error instanceof HrmValidationError);
  assert.throws(() => parseHrmInput(schemas.onboardEmployee, { ...base, password: 'é'.repeat(40) }), (error: unknown) => error instanceof HrmValidationError);
});

test('joining date must be a real date and at most a year ahead', () => {
  const base = { fullName: 'Asha Singh', email: 'asha@example.com', mobile: '9876543210', password: 'Strong@123', designation: 'State Manager', orgUnitId: 'dept-1', locationType: 'HEAD_OFFICE' };
  const ok = (joiningDate: string) => parseHrmInput(schemas.onboardEmployee, { ...base, joiningDate });
  assert.doesNotThrow(() => ok('2026-02-28'));
  for (const bad of ['2026-02-31', '2026-13-01', '2026-00-10', '1949-12-31', '2099-01-01']) {
    assert.throws(() => ok(bad), (error: unknown) => error instanceof HrmValidationError, bad);
  }
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.doesNotThrow(() => ok(nextMonth));
});
