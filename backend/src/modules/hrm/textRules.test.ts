import assert from 'node:assert/strict';
import test from 'node:test';
import { HrmValidationError, parseHrmInput, schemas } from './validation';

const refused = (parse: () => unknown, field: RegExp) => assert.throws(parse, (error: unknown) => error instanceof HrmValidationError && field.test(error.message), String(field));
const rejects = (input: object, field: RegExp) => refused(() => parseHrmInput(schemas.updateEmployee, input), field);
const rejectsBank = (input: object, field: RegExp) => refused(() => parseHrmInput(schemas.createBankAccount, input), field);

test('names and places are cleaned, and must read as names', () => {
  const parsed = parseHrmInput(schemas.updateEmployee, {
    version: 1,
    preferredName: '  Asha   Rani\u202E ',
    fatherOrSpouseName: "श्री रमेश कुमार",
    currentAddress: { line1: '  Ward 4,  Sector 21 ', line2: '', city: 'Navi Mumbai (W)', state: 'Maharashtra', pincode: '400703' },
    emergencyContact: { name: "D'Souza", relation: 'Brother-in-law', mobile: '+919876543210' },
  });
  assert.equal(parsed.preferredName, 'Asha Rani');
  assert.equal(parsed.currentAddress?.line1, 'Ward 4, Sector 21');
  assert.equal(parsed.emergencyContact?.name, "D'Souza");
});

test('digits in names, number-only places, markup and bad PIN codes are refused', () => {
  const address = { line1: 'Ward 4', city: 'Raipur', state: 'Chhattisgarh', pincode: '492001' };
  rejects({ version: 1, preferredName: 'Asha123' }, /preferredName/);
  rejects({ version: 1, fatherOrSpouseName: '----' }, /fatherOrSpouseName/);
  rejects({ version: 1, currentAddress: { ...address, city: '492001' } }, /city/);
  assert.equal(parseHrmInput(schemas.updateEmployee, { version: 1, currentAddress: { ...address, city: 'North 24 Parganas' } }).currentAddress?.city, 'North 24 Parganas');
  rejects({ version: 1, currentAddress: { ...address, line1: '<b>home' } }, /line1/);
  rejects({ version: 1, currentAddress: { ...address, line1: '   ' } }, /line1/);
  rejects({ version: 1, currentAddress: { ...address, pincode: '092001' } }, /PIN/);
  rejects({ version: 1, emergencyContact: { name: '9876543210', relation: 'Father', mobile: '9876543210' } }, /name/);
  rejects({ version: 1, dateOfBirth: new Date().toISOString().slice(0, 10) }, /14/);
});

test('bank details: holder and bank names read as such', () => {
  rejectsBank({ accountNumber: '123456789', accountHolderName: 'A1' }, /accountHolderName/);
  rejectsBank({ accountNumber: '123456789', bankName: 'SBI <x>' }, /bankName/);
  assert.equal(parseHrmInput(schemas.createBankAccount, { accountNumber: '123456789', bankName: 'IDFC FIRST Bank (2)', accountHolderName: 'Asha Singh' }).bankName, 'IDFC FIRST Bank (2)');
});

test('an uploaded document title is cleaned and cannot carry markup', () => {
  assert.equal(parseHrmInput(schemas.uploadDocument, { category: 'PHOTO', title: '  Passport   photo ' }).title, 'Passport photo');
  assert.throws(() => parseHrmInput(schemas.uploadDocument, { category: 'PHOTO', title: 'a < b' }), (error: unknown) => error instanceof HrmValidationError);
});
