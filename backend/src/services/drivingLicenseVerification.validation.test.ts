import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeDrivingLicenseNumber,
  normalizeDateOfBirth,
  validateDateOfBirth,
  validateDrivingLicenseNumber,
} from './drivingLicenseVerification.validation';

test('normalizes a driving-license number without enforcing one rigid Indian format', () => {
  assert.equal(normalizeDrivingLicenseNumber(' up 20/2015 0000000 '), 'UP20/20150000000');
  assert.equal(validateDrivingLicenseNumber('UP20/20150000000'), null);
});

test('rejects empty or unsafe driving-license input', () => {
  assert.equal(validateDrivingLicenseNumber(''), 'Driving license number is required.');
  assert.equal(validateDrivingLicenseNumber('DL<script>'), 'Enter a valid driving license number.');
});

test('normalizes valid dates and rejects impossible or future dates', () => {
  assert.equal(normalizeDateOfBirth('23/11/1996'), '1996-11-23');
  assert.equal(validateDateOfBirth('1996-11-23'), null);
  assert.equal(validateDateOfBirth('1996-02-31'), 'Enter a valid date of birth.');
  assert.equal(validateDateOfBirth('2999-01-01'), 'Enter a valid date of birth.');
  assert.equal(normalizeDateOfBirth('not-a-date'), null);
});
