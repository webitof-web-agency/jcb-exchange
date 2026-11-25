import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChecklist, checklistProgress, documentState, type ChecklistFacts } from './onboardingChecklist';
import { describeShiftProblem, shiftLengthMinutes } from './shiftRules';

const empty: ChecklistFacts = {
  personal: { dateOfBirth: false, gender: false, currentAddress: false, emergencyContact: false },
  hasPlacement: false, panVerified: false, aadhaarVerified: false, bank: 'MISSING',
  documents: { OFFER: 'MISSING', ACCEPTANCE: 'MISSING', PHOTO: 'MISSING', ADDRESS: 'MISSING', EDUCATION: 'MISSING' },
  salary: 'MISSING', hasShift: false, hasLogin: false,
};

test('the joining checklist counts only required items and ignores the login', () => {
  const start = checklistProgress(buildChecklist(empty));
  assert.equal(start.done, 0);
  assert.equal(start.total, 10);
  assert.ok(!start.missingRequired.includes('LOGIN'));
  const full: ChecklistFacts = {
    personal: { dateOfBirth: true, gender: true, currentAddress: true, emergencyContact: true },
    hasPlacement: true, panVerified: true, aadhaarVerified: true, bank: 'VERIFIED',
    documents: { OFFER: 'VERIFIED', ACCEPTANCE: 'VERIFIED', PHOTO: 'VERIFIED', ADDRESS: 'MISSING', EDUCATION: 'MISSING' },
    salary: 'APPROVED', hasShift: true, hasLogin: false,
  };
  const done = checklistProgress(buildChecklist(full));
  assert.deepEqual([done.done, done.total, done.percent, done.missingRequired], [10, 10, 100, []]);
  const items = buildChecklist({ ...full, bank: 'ADDED', salary: 'PENDING' });
  assert.equal(items.find((item) => item.key === 'BANK')?.state, 'PENDING');
  assert.equal(items.find((item) => item.key === 'SALARY')?.state, 'PENDING');
  assert.equal(items.find((item) => item.key === 'ADDRESS_PROOF')?.state, 'DONE', 'Aadhaar covers address proof');
});

test('document state: verified beats pending; rejected does not count', () => {
  assert.equal(documentState(['PENDING', 'VERIFIED']), 'VERIFIED');
  assert.equal(documentState(['PENDING']), 'PENDING');
  assert.equal(documentState([]), 'MISSING');
});

test('shift timings are checked', () => {
  assert.equal(shiftLengthMinutes('09:30', '18:30', false), 540);
  assert.equal(shiftLengthMinutes('22:00', '06:00', true), 480);
  assert.equal(describeShiftProblem({ startTime: '09:30', endTime: '18:30', breakMinutes: 60, halfDayMinutes: 240, fullDayMinutes: 480 }), null);
  assert.match(describeShiftProblem({ startTime: '22:00', endTime: '06:00' }) ?? '', /Night shift/);
  assert.match(describeShiftProblem({ startTime: '09:00', endTime: '09:00' }) ?? '', /same/);
  assert.match(describeShiftProblem({ startTime: '09:00', endTime: '10:00', breakMinutes: 60 }) ?? '', /break/);
  assert.match(describeShiftProblem({ startTime: '09:00', endTime: '18:00', halfDayMinutes: 300, fullDayMinutes: 240 }) ?? '', /Half-day/);
});

test('a night shift must end the next day', () => {
  assert.match(describeShiftProblem({ startTime: '18:00', endTime: '23:00', isNightShift: true }) ?? '', /next day/);
  assert.equal(describeShiftProblem({ startTime: '22:00', endTime: '06:00', isNightShift: true }), null);
});
