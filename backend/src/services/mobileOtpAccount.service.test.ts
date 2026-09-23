import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findOrCreateMobileOtpAccount,
  getNewMobileOtpCustomerData,
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

test('creates only an active customer for a previously unknown verified mobile', async () => {
  const created = {
    id: 'customer-1',
    ...getNewMobileOtpCustomerData('9876543210'),
  } as MobileOtpAccountUser;

  const result = await findOrCreateMobileOtpAccount('9876543210', {
    findByMobile: async () => null,
    createCustomer: async (mobile) => ({ ...created, mobile }),
  });

  assert.equal(result.created, true);
  assert.equal(result.user.role, 'CUSTOMER');
  assert.equal(result.user.status, 'ACTIVE');
  assert.equal(result.user.mobile, '9876543210');
  assert.equal(result.user.isMobileVerified, true);
});

test('preserves the role and identity of an existing account', async () => {
  const result = await findOrCreateMobileOtpAccount('9183251751', {
    findByMobile: async () => existingEmployee,
    createCustomer: async () => {
      throw new Error('must not create an existing account');
    },
  });

  assert.equal(result.created, false);
  assert.equal(result.user.id, existingEmployee.id);
  assert.equal(result.user.role, 'EMPLOYEE');
});

test('handles a concurrent mobile insert by reading the account created by the other request', async () => {
  let lookupCount = 0;
  const result = await findOrCreateMobileOtpAccount('9876543210', {
    findByMobile: async () => {
      lookupCount += 1;
      return lookupCount === 1 ? null : { id: 'customer-2', ...getNewMobileOtpCustomerData('9876543210') };
    },
    createCustomer: async () => {
      throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
    },
  });

  assert.equal(result.created, false);
  assert.equal(result.user.id, 'customer-2');
});
