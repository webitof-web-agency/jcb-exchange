import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMobileOtpAccount,
  type MobileOtpAccountUser,
} from './mobileOtpAccount.service';

const existingEmployee: MobileOtpAccountUser = {
  id: 'employee-1',
  mobile: '9183251751',
  email: 'employee@example.com',
  name: 'Samar',
  role: 'EMPLOYEE',
  status: 'ACTIVE',
  isMobileVerified: false,
};

test('returns no account for an unknown mobile so login does not send an OTP or create a user', async () => {
  let lookupCount = 0;

  const result = await findMobileOtpAccount('9876543210', {
    findByMobile: async () => {
      lookupCount += 1;
      return null;
    },
  });

  assert.equal(result, null);
  assert.equal(lookupCount, 1);
});

test('returns the existing account with its name and role for OTP login', async () => {
  const result = await findMobileOtpAccount('9183251751', {
    findByMobile: async () => existingEmployee,
  });

  assert.deepEqual(result, existingEmployee);
});

test('finds an existing account so signup can reject a duplicate mobile number', async () => {
  const result = await findMobileOtpAccount('9876543210', {
    findByMobile: async (mobile) =>
      mobile === '9876543210'
        ? {
            ...existingEmployee,
            id: 'customer-1',
            mobile: '9876543210',
          }
        : null,
  });

  assert.equal(result?.id, 'customer-1');
  assert.equal(result?.mobile, '9876543210');
});
