import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORY_MAP, DEFAULT_GROUPS } from './defaultChart';

test('default chart codes are unique across groups and accounts', () => {
  const codes = [...DEFAULT_GROUPS.map((group) => group.code), ...DEFAULT_ACCOUNTS.map((account) => account.code)];
  assert.equal(new Set(codes).size, codes.length);
});

test('every parent group appears before its children and every account has a group', () => {
  const seen = new Set<string>();
  DEFAULT_GROUPS.forEach((group) => {
    if (group.parentCode) assert.ok(seen.has(group.parentCode), `${group.code} parent ${group.parentCode} must come first`);
    seen.add(group.code);
  });
  DEFAULT_ACCOUNTS.forEach((account) => assert.ok(seen.has(account.groupCode), `${account.code} has unknown group`));
});

test('system keys are unique and cover what automatic posting needs', () => {
  const keys = DEFAULT_ACCOUNTS.flatMap((account) => (account.systemKey ? [account.systemKey] : []));
  assert.equal(new Set(keys).size, keys.length);
  [
    'VEHICLE_STOCK', 'DEBTORS_CONTROL', 'CREDITORS_CONTROL', 'CUSTOMER_ADVANCES', 'SELLER_ADVANCES',
    'GST_OUTPUT_CGST', 'GST_OUTPUT_SGST', 'GST_OUTPUT_IGST', 'VEHICLE_SALES_MARGIN', 'COGS_VEHICLES',
    'EXCHANGE_CLEARING', 'VEHICLE_EXPENSE_CLEARING', 'CASH_IN_HAND', 'SUSPENSE', 'OPENING_DIFFERENCE',
    'RETAINED_EARNINGS', 'PARTNER_SECURITY_DEPOSITS', 'PREPAID_API_WALLET', 'API_EXPENSE', 'SUBSCRIPTION_INCOME',
  ].forEach((key) => assert.ok(keys.includes(key), `${key} missing`));
});

test('party control accounts require a party and category map targets exist', () => {
  DEFAULT_ACCOUNTS.filter((account) => account.kind === 'PARTY_CONTROL').forEach((account) => {
    assert.equal(account.party, true, `${account.code} should require a party`);
  });
  const accountCodes = new Set(DEFAULT_ACCOUNTS.map((account) => account.code));
  Object.entries(DEFAULT_CATEGORY_MAP).forEach(([category, code]) => assert.ok(accountCodes.has(code), `${category} → ${code}`));
});
