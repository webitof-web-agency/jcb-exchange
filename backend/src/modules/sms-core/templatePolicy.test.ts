import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DLT_VARIABLE_MAX_LENGTH,
  getMissingSmsTemplateVariables,
  getOfferSmsLinkVariables,
  getSmsTemplateVariableOptions,
  OFFER_SMS_LINK_VARIABLES,
  renderSmsVariables,
  validateSmsTemplateConfiguration,
  validateSmsTemplateVariableOrder,
} from './templatePolicy';

test('allows message-id-only templates without requiring variables', () => {
  assert.equal(validateSmsTemplateVariableOrder('LISTING_PAYMENT_APPROVED', ''), null);
  assert.deepEqual(getSmsTemplateVariableOptions('LISTING_PAYMENT_APPROVED').includes('listingTitle'), true);
});

test('accepts only event payload keys for variable templates', () => {
  assert.equal(
    validateSmsTemplateVariableOrder('LISTING_PAYMENT_APPROVED', 'listingTitle|status'),
    'listingTitle|status',
  );
  assert.throws(
    () => validateSmsTemplateVariableOrder('LISTING_PAYMENT_APPROVED', 'customerPassword'),
    /Unsupported SMS template variable: customerPassword/,
  );
});

test('detects missing runtime values before sending to the provider', () => {
  assert.deepEqual(
    getMissingSmsTemplateVariables('customerName|listingTitle|status', {
      customerName: 'Aman',
      listingTitle: '',
      status: 'APPROVED',
    }),
    ['listingTitle'],
  );
  assert.equal(renderSmsVariables('customerName|status', { customerName: 'Aman', status: 'APPROVED' }), 'Aman|APPROVED');
});

test('requires the complete payment receipt variable order when the SMS rule is enabled', () => {
  assert.throws(
    () => validateSmsTemplateConfiguration('VEHICLE_SALE_PAYMENT_RECEIPT', true, 'customerName|amount|receiptUrl'),
    /must use this exact variable order/,
  );
  assert.equal(
    validateSmsTemplateConfiguration(
      'VEHICLE_SALE_PAYMENT_RECEIPT',
      true,
      'customerName|vehicleTitle|amount|receiptNumber|balance|paymentMethod|receiptUrl',
    ),
    'customerName|vehicleTitle|amount|receiptNumber|balance|paymentMethod|receiptUrl',
  );
});

test('requires the complete invoice variable order when the SMS rule is enabled', () => {
  assert.throws(
    () => validateSmsTemplateConfiguration('VEHICLE_SALE_INVOICE', true, 'customerName|invoiceUrl'),
    /must use this exact variable order/,
  );
  assert.equal(
    validateSmsTemplateConfiguration(
      'VEHICLE_SALE_INVOICE',
      true,
      'customerName|vehicleTitle|registrationNumber|invoiceNumber|invoiceAmount|invoiceUrl',
    ),
    'customerName|vehicleTitle|registrationNumber|invoiceNumber|invoiceAmount|invoiceUrl',
  );
});

test('offer SMS exposes the short link, code, reply-by and joining values next to the long link', () => {
  assert.deepEqual(getSmsTemplateVariableOptions('RECRUITMENT_OFFER_SENT'), [
    'candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation',
    'offerResponseUrl', 'offerShortUrl', 'offerShortCode', 'offerValidUntil', 'joiningDate',
  ]);
});

test('an enabled offer SMS rule needs one offer link variable', () => {
  assert.throws(
    () => validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, 'candidateName|jobTitle|offerValidUntil'),
    /must include offerShortCode, offerShortUrl or offerResponseUrl/,
  );
  assert.throws(() => validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, ''), /must include offerShortCode/);
  // The recommended DLT text: the fixed https://<site>/o/ prefix is in the template, the 8-character code is the variable.
  assert.equal(
    validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, 'candidateName|jobTitle|offerShortCode'),
    'candidateName|jobTitle|offerShortCode',
  );
  assert.equal(
    validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, 'candidateName|offerShortUrl|offerValidUntil'),
    'candidateName|offerShortUrl|offerValidUntil',
  );
});

test('an offer SMS rule saved earlier with offerResponseUrl keeps working (save and dispatch-time re-validation)', () => {
  assert.equal(
    validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, 'candidateName|offerResponseUrl'),
    'candidateName|offerResponseUrl',
  );
  assert.equal(
    validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, ' candidateName | jobTitle | offerResponseUrl '),
    'candidateName|jobTitle|offerResponseUrl',
  );
});

test('a disabled offer SMS draft can be saved without a link variable', () => {
  assert.equal(validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', false, 'candidateName|jobTitle'), 'candidateName|jobTitle');
  assert.equal(validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', false, ''), null);
});

test('lists the offer link variables a template uses, in template order', () => {
  assert.deepEqual(getOfferSmsLinkVariables('candidateName|offerResponseUrl|offerShortCode'), ['offerResponseUrl', 'offerShortCode']);
  assert.deepEqual(getOfferSmsLinkVariables('candidateName|jobTitle'), []);
  assert.deepEqual(getOfferSmsLinkVariables(null), []);
  assert.deepEqual([...OFFER_SMS_LINK_VARIABLES].sort(), ['offerResponseUrl', 'offerShortCode', 'offerShortUrl']);
});

test('the 8-character short code fits a DLT variable; the long signed link does not', () => {
  assert.equal('Ab3dEf7h'.length <= DLT_VARIABLE_MAX_LENGTH, true);
  assert.equal('https://jcbexchange.com/offer-response/offer1.eyJvZmZlcklkIjoi.sig'.length > DLT_VARIABLE_MAX_LENGTH, true);
});

test('offer accepted SMS (candidate and HR) carry the answer, never an offer link', () => {
  const expected = ['candidateName', 'applicationRef', 'jobTitle', 'designation', 'joiningDate', 'acceptedOn'];
  for (const eventCode of ['RECRUITMENT_OFFER_ACCEPTED', 'RECRUITMENT_OFFER_ACCEPTED_HR']) {
    assert.deepEqual(getSmsTemplateVariableOptions(eventCode), expected);
    assert.equal(
      validateSmsTemplateConfiguration(eventCode, true, 'candidateName|jobTitle|joiningDate|acceptedOn'),
      'candidateName|jobTitle|joiningDate|acceptedOn',
    );
    assert.equal(validateSmsTemplateConfiguration(eventCode, true, ''), null);
    for (const linkVariable of [...OFFER_SMS_LINK_VARIABLES, 'acceptanceDocumentUrl']) {
      assert.throws(() => validateSmsTemplateConfiguration(eventCode, true, `candidateName|${linkVariable}`), /Unsupported SMS template variable/);
    }
  }
});

test('joining reminder SMS exposes the checklist values for HR and the State Manager', () => {
  assert.deepEqual(getSmsTemplateVariableOptions('RECRUITMENT_JOINING_REMINDER'), [
    'employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName', 'stateName', 'missingItemsShort',
  ]);
  assert.equal(
    validateSmsTemplateConfiguration('RECRUITMENT_JOINING_REMINDER', true, 'employeeName|joiningDate|missingItemsShort'),
    'employeeName|joiningDate|missingItemsShort',
  );
  // The full list is too long for a DLT variable: only the short count is offered.
  assert.throws(() => validateSmsTemplateConfiguration('RECRUITMENT_JOINING_REMINDER', true, 'missingItems'), /Unsupported SMS template variable/);
  assert.throws(() => validateSmsTemplateConfiguration('RECRUITMENT_JOINING_REMINDER', true, 'onboardingUrl'), /Unsupported SMS template variable/);
  assert.equal(
    renderSmsVariables('employeeName|missingItemsShort', { employeeName: 'Ravi Kumar', missingItemsShort: '2 items pending' }),
    'Ravi Kumar|2 items pending',
  );
});

test('joining welcome SMS exposes the new employee values, never the login email', () => {
  assert.deepEqual(getSmsTemplateVariableOptions('RECRUITMENT_JOINING_WELCOME'), [
    'employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName',
  ]);
  assert.equal(
    validateSmsTemplateConfiguration('RECRUITMENT_JOINING_WELCOME', true, 'employeeName|employeeCode|officeName'),
    'employeeName|employeeCode|officeName',
  );
  assert.throws(() => validateSmsTemplateConfiguration('RECRUITMENT_JOINING_WELCOME', true, 'loginEmail'), /Unsupported SMS template variable/);
});

test('dispatch keeps sending offer SMS rules switched on before short links existed (no link variable)', () => {
  // Saving / switching on still needs a link variable...
  assert.throws(() => validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, 'candidateName|jobTitle'), /must include offerShortCode/);
  // ...but the check before each send does not stop a rule that is already live.
  assert.equal(
    validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, 'candidateName|jobTitle', { requireOfferLink: false }),
    'candidateName|jobTitle',
  );
  assert.equal(validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, '', { requireOfferLink: false }), null);
  // Unknown names are still refused at dispatch.
  assert.throws(() => validateSmsTemplateConfiguration('RECRUITMENT_OFFER_SENT', true, 'candidateName|secret', { requireOfferLink: false }), /Unsupported SMS template variable/);
});

test('blank optional values are sent as "-" instead of failing every retry; required blanks still stop the send', () => {
  const payload = { candidateName: 'Asha', jobTitle: 'Engineer', offerValidUntil: '', officeName: '' };
  assert.deepEqual(getMissingSmsTemplateVariables('candidateName|offerValidUntil|officeName', payload), []);
  assert.equal(renderSmsVariables('candidateName|offerValidUntil|officeName', payload), 'Asha|-|-');
  assert.deepEqual(getMissingSmsTemplateVariables('candidateName|jobTitle|offerShortCode', payload), ['offerShortCode']);
});
