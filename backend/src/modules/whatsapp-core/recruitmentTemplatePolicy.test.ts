import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRecruitmentTemplateDate,
  getRecruitmentTemplateComponents,
  getRecruitmentTemplateVariables,
  resolveRecruitmentTemplateDocument,
  validateRecruitmentTemplate,
} from './recruitmentTemplatePolicy';

const offerPayload = {
  candidateName: 'Asha',
  applicationId: 'app-1',
  applicationRef: 'JCB-001',
  jobTitle: 'Site Engineer',
  designation: 'Senior Site Engineer',
  offerLetterUrl: 'https://drive.google.com/file/d/offer-file/view',
  offerLetterFileName: 'Offer_JCB-001.pdf',
  offerResponseUrl: 'https://jcbexchange.com/offer-response/token',
  offerShortUrl: 'https://jcbexchange.com/o/Ab3dEf7h',
  offerShortCode: 'Ab3dEf7h',
  offerValidUntil: '2026-12-05',
  joiningDate: '2027-01-04',
};

const body = (count: number) => ({ type: 'BODY', text: Array.from({ length: count }, (_, index) => `{{${index + 1}}}`).join(' ') });
const documentHeader = { type: 'HEADER', format: 'DOCUMENT' };
const shortLinkButtons = { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'View offer', url: 'https://jcbexchange.com/o/{{1}}' }] };

test('recruitment WhatsApp template policy maps offer values into the approved body parameter order', () => {
    assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', {
      candidateName: 'Asha',
      applicationId: 'app-1',
      applicationRef: 'JCB-001',
      jobTitle: 'Site Engineer',
      designation: 'Senior Site Engineer',
    }), [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Asha' },
        { type: 'text', text: 'app-1' },
        { type: 'text', text: 'JCB-001' },
        { type: 'text', text: 'Site Engineer' },
        { type: 'text', text: 'Senior Site Engineer' },
      ],
    }]);
});

test('uses the approved template placeholder count and includes interview status', () => {
    assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_INTERVIEW_SCHEDULED', {
      candidateName: 'Asha',
      applicationId: 'app-1',
      applicationRef: 'JCB-001',
      jobTitle: 'Site Engineer',
      scheduledAt: '04 Nov 2026, 10:00 AM',
      interviewType: 'VIDEO',
      status: 'SCHEDULED',
    }, [{ type: 'BODY', text: '{{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{7}}' }]), [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'Asha' },
        { type: 'text', text: 'app-1' },
        { type: 'text', text: 'JCB-001' },
        { type: 'text', text: 'Site Engineer' },
        { type: 'text', text: '04 Nov 2026, 10:00 AM' },
        { type: 'text', text: 'VIDEO' },
        { type: 'text', text: 'SCHEDULED' },
      ],
    }]);
});

test('offer position 6 is the short link when there is one (approved 6-variable templates keep working)', () => {
  const [component] = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', offerPayload, [documentHeader, body(6)]);
  assert.deepEqual((component?.parameters as unknown[])[5], { type: 'text', text: 'https://jcbexchange.com/o/Ab3dEf7h' });
  assert.equal((component?.parameters as unknown[]).length, 6);
});

test('offer position 6 falls back to the long link when no short link was made', () => {
  const [component] = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', { ...offerPayload, offerShortUrl: '', offerShortCode: '' }, [body(6)]);
  assert.deepEqual((component?.parameters as unknown[])[5], { type: 'text', text: 'https://jcbexchange.com/offer-response/token' });
});

test('offer position 7 is the reply-before date, appended after the link', () => {
  const [component] = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', offerPayload, [documentHeader, body(7)]);
  assert.deepEqual((component?.parameters as unknown[]).slice(4), [
    { type: 'text', text: 'Senior Site Engineer' },
    { type: 'text', text: 'https://jcbexchange.com/o/Ab3dEf7h' },
    { type: 'text', text: '05 Dec 2026' },
  ]);
  const [noDate] = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', { ...offerPayload, offerValidUntil: '' }, [body(7)]);
  assert.deepEqual((noDate?.parameters as unknown[])[6], { type: 'text', text: '-' });
});

test('a dynamic URL button gets the short code at its index in the buttons array', () => {
  const components = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', offerPayload, [
    documentHeader,
    body(5),
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Call me' }, { type: 'url', text: 'Open offer', url: 'https://jcbexchange.com/o/{{1}}' }] },
  ]);
  assert.equal(components.length, 2);
  assert.deepEqual(components[1], { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'Ab3dEf7h' }] });
});

test('a button template with no body variables sends only the button component', () => {
  assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_OFFER_SENT', offerPayload, [
    documentHeader,
    { type: 'BODY', text: 'Your offer is ready. Tap below to review it.' },
    shortLinkButtons,
  ]), [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'Ab3dEf7h' }] }]);
});

test('a synced body without variables gets no parameters instead of the default count', () => {
  assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_APPLICATION_RECEIVED', { candidateName: 'Asha' }, [{ type: 'BODY', text: 'Thank you for applying.' }]), []);
});

test('URL buttons are filled only for the offer event', () => {
  const components = getRecruitmentTemplateComponents('RECRUITMENT_OFFER_STATUS_UPDATED', offerPayload, [body(1), shortLinkButtons]);
  assert.equal(components.length, 1);
});

test('maps a published job to the five placeholders used by the approved template', () => {
    assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_NEW_JOB_PUBLISHED', {
      jobId: 'job-1',
      jobCode: 'JOB-0101',
      jobTitle: 'Operator',
      jobSlug: 'operator',
      locationCity: 'Raipur',
      locationState: 'Chhattisgarh',
    }, [{ type: 'BODY', text: '{{1}} {{2}} {{3}} {{4}} {{5}}' }]), [{
      type: 'body',
      parameters: [
        { type: 'text', text: 'job-1' },
        { type: 'text', text: 'JOB-0101' },
        { type: 'text', text: 'Operator' },
        { type: 'text', text: 'Raipur' },
        { type: 'text', text: 'Chhattisgarh' },
      ],
    }]);
});

test('the new events list their variables with the person addressed first', () => {
  assert.equal(getRecruitmentTemplateVariables('RECRUITMENT_OFFER_ACCEPTED')[0], 'candidateName');
  assert.equal(getRecruitmentTemplateVariables('RECRUITMENT_OFFER_ACCEPTED_HR')[0], 'candidateName');
  assert.equal(getRecruitmentTemplateVariables('RECRUITMENT_JOINING_REMINDER')[0], 'employeeName');
  assert.equal(getRecruitmentTemplateVariables('RECRUITMENT_JOINING_WELCOME')[0], 'employeeName');
  // The approved offer order is kept: new values only ever come after position 5.
  assert.deepEqual(getRecruitmentTemplateVariables('RECRUITMENT_OFFER_SENT').slice(0, 5), ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation']);
});

test('maps the acceptance, joining reminder and welcome values', () => {
  assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_OFFER_ACCEPTED', {
    candidateName: 'Asha', applicationRef: 'JCB-001', jobTitle: 'Site Engineer', designation: 'Senior Site Engineer',
    acceptedOn: '2026-11-25', joiningDate: '2027-01-04', acceptanceDocumentUrl: 'https://drive.google.com/file/d/cert/view',
  }, [body(6)])[0]?.parameters, [
    { type: 'text', text: 'Asha' },
    { type: 'text', text: 'Site Engineer' },
    { type: 'text', text: 'Senior Site Engineer' },
    { type: 'text', text: 'JCB-001' },
    { type: 'text', text: '25 Nov 2026' },
    { type: 'text', text: '04 Jan 2027' },
  ]);
  assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_JOINING_REMINDER', {
    employeeName: 'Ravi', employeeCode: 'EMP-7', designation: 'Operator', joiningDate: '2026-11-26', officeName: 'Raipur',
    stateName: 'Chhattisgarh', missingItems: 'PAN, Bank details', onboardingUrl: 'https://admin.jcbexchange.com/admin/hrm/onboarding/e1',
  })[0]?.parameters, [
    { type: 'text', text: 'Ravi' },
    { type: 'text', text: 'EMP-7' },
    { type: 'text', text: 'Operator' },
    { type: 'text', text: '26 Nov 2026' },
    { type: 'text', text: 'Raipur' },
    { type: 'text', text: 'Chhattisgarh' },
    { type: 'text', text: 'PAN, Bank details' },
    { type: 'text', text: 'https://admin.jcbexchange.com/admin/hrm/onboarding/e1' },
  ]);
  assert.deepEqual(getRecruitmentTemplateComponents('RECRUITMENT_JOINING_WELCOME', {
    employeeName: 'Ravi', employeeCode: 'EMP-7', designation: 'Operator', joiningDate: '2026-11-26', officeName: 'Raipur', loginEmail: '',
  })[0]?.parameters, [
    { type: 'text', text: 'Ravi' },
    { type: 'text', text: 'EMP-7' },
    { type: 'text', text: 'Operator' },
    { type: 'text', text: '26 Nov 2026' },
    { type: 'text', text: 'Raipur' },
    { type: 'text', text: '-' },
  ]);
});

test('formats calendar dates without a time zone shift and leaves other text alone', () => {
  assert.equal(formatRecruitmentTemplateDate('2026-01-01'), '01 Jan 2026');
  assert.equal(formatRecruitmentTemplateDate('2026-13-01'), '2026-13-01');
  assert.equal(formatRecruitmentTemplateDate('soon'), 'soon');
  assert.equal(formatRecruitmentTemplateDate(''), '');
});

test('offer template check: DOCUMENT header and a link (URL button or {{6}}) are accepted', () => {
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', [documentHeader, body(5), shortLinkButtons]), { ok: true });
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', [documentHeader, body(6)]), { ok: true });
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', [documentHeader, body(7)]), { ok: true });
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', [documentHeader, { type: 'BODY', text: 'Hi {{1}}' }, shortLinkButtons]), { ok: true });
});

test('offer template check keeps already-approved 5-variable templates and unsynced templates working', () => {
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', [documentHeader, body(5)]), { ok: true });
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', null), { ok: true });
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', []), { ok: true });
});

test('offer template check rejects a missing DOCUMENT header, a wrong button and extra variables', () => {
  const rejected = (components: unknown, pattern: RegExp) => {
    const check = validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', components);
    assert.equal(check.ok, false);
    assert.match(check.ok ? '' : check.error, pattern);
  };
  rejected([body(6)], /DOCUMENT header/);
  rejected([{ type: 'HEADER', format: 'IMAGE' }, body(6)], /DOCUMENT header/);
  // An approved template with fewer variables and no button keeps sending (the link goes by email / SMS).
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_SENT', [documentHeader, body(3)]), { ok: true });
  rejected([documentHeader, body(8)], /\{\{8\}\}/);
  rejected([documentHeader, body(5), { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Open', url: 'https://jcbexchange.com/offer-response/{{1}}' }] }], /\/o\/\{\{1\}\}/);
});

test('acceptance template check: DOCUMENT header or none, synced, no URL button to fill', () => {
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_ACCEPTED', [documentHeader, body(6)]), { ok: true });
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_ACCEPTED', [body(4)]), { ok: true });
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_ACCEPTED', [{ type: 'HEADER', format: 'TEXT', text: 'Welcome aboard' }, body(2)]), { ok: true });
  for (const components of [
    null,
    [{ type: 'HEADER', format: 'IMAGE' }, body(2)],
    [{ type: 'HEADER', format: 'TEXT', text: 'Hi {{1}}' }, body(2)],
    [documentHeader, body(7)],
    [documentHeader, body(2), shortLinkButtons],
  ]) {
    assert.equal(validateRecruitmentTemplate('RECRUITMENT_OFFER_ACCEPTED', components).ok, false);
  }
});

test('other recruitment events are not shape-checked', () => {
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_JOINING_WELCOME', null), { ok: true });
  // The HR alert is checked like the candidate confirmation (same template may be picked for both).
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_OFFER_ACCEPTED_HR', [documentHeader, body(6)]), { ok: true });
  assert.equal(validateRecruitmentTemplate('RECRUITMENT_OFFER_ACCEPTED_HR', null).ok, false);
});

test('the offer always carries its letter; the acceptance carries the certificate only for a DOCUMENT header', () => {
  assert.deepEqual(resolveRecruitmentTemplateDocument('RECRUITMENT_OFFER_SENT', null, offerPayload), {
    ok: true,
    document: { url: 'https://drive.google.com/file/d/offer-file/view', fileName: 'Offer_JCB-001.pdf' },
  });
  assert.equal(resolveRecruitmentTemplateDocument('RECRUITMENT_OFFER_SENT', null, { ...offerPayload, offerLetterUrl: '' }).ok, false);

  const accepted = { acceptanceDocumentUrl: 'https://drive.google.com/file/d/cert/view', acceptanceDocumentFileName: 'Offer_Acceptance_JCB-001.pdf' };
  assert.deepEqual(resolveRecruitmentTemplateDocument('RECRUITMENT_OFFER_ACCEPTED', [documentHeader, body(6)], accepted), {
    ok: true,
    document: { url: 'https://drive.google.com/file/d/cert/view', fileName: 'Offer_Acceptance_JCB-001.pdf' },
  });
  assert.deepEqual(resolveRecruitmentTemplateDocument('RECRUITMENT_OFFER_ACCEPTED', [body(6)], accepted), { ok: true, document: null });
  // DOCUMENT header but no certificate: the message is not sent rather than sent without its header.
  assert.equal(resolveRecruitmentTemplateDocument('RECRUITMENT_OFFER_ACCEPTED', [documentHeader, body(6)], { acceptanceDocumentUrl: '' }).ok, false);
  assert.deepEqual(resolveRecruitmentTemplateDocument('RECRUITMENT_JOINING_WELCOME', [documentHeader], {}), { ok: true, document: null });
});

test('joining templates: plain text only (no media header, no URL button variable, body within the filled count)', () => {
  const plain = [{ type: 'BODY', text: '{{1}} joins on {{4}}' }];
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_JOINING_REMINDER', plain), { ok: true });
  assert.equal(validateRecruitmentTemplate('RECRUITMENT_JOINING_WELCOME', [{ type: 'HEADER', format: 'DOCUMENT' }, ...plain]).ok, false);
  assert.equal(validateRecruitmentTemplate('RECRUITMENT_JOINING_WELCOME', [{ type: 'BODY', text: '{{7}}' }]).ok, false);
  assert.equal(validateRecruitmentTemplate('RECRUITMENT_JOINING_REMINDER', [...plain, { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Open', url: 'https://x.in/o/{{1}}' }] }]).ok, false);
  assert.deepEqual(validateRecruitmentTemplate('RECRUITMENT_JOINING_REMINDER', null), { ok: true });
});
