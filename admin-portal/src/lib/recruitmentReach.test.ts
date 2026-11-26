import assert from 'node:assert/strict';
import test from 'node:test';
import { describeRecruitmentReach, jobPostingOptionsFor, jobStatesFor } from './recruitmentReach';

const states = [{ id: 1, name: 'Goa' }, { id: 2, name: 'Gujarat' }];
const limited = { allIndia: false, headOffice: false, states: [states[1]!] };

test('no banner for all-India; a state list for a limited viewer; a warning without any state', () => {
  assert.equal(describeRecruitmentReach({ allIndia: true, headOffice: true, states: [] }), null);
  assert.equal(describeRecruitmentReach(null), null);
  assert.equal(describeRecruitmentReach(limited)?.text, 'You are seeing recruitment for: Gujarat. Company-wide settings are view only.');
  assert.equal(describeRecruitmentReach({ allIndia: false, headOffice: false, states: [] })?.tone, 'warning');
  assert.match(describeRecruitmentReach({ ...limited, headOffice: true })!.text, /Head office postings/);
});

test('a limited viewer is offered only their states and posting types', () => {
  assert.deepEqual(jobStatesFor(states, limited).map((state) => state.id), [2]);
  assert.deepEqual(jobStatesFor(states, null).map((state) => state.id), [1, 2]);
  assert.deepEqual(jobStatesFor(states, { ...limited, headOffice: true }).map((state) => state.id), [1, 2]);
  assert.deepEqual(jobPostingOptionsFor(limited).map((option) => option.value), ['', 'STATE_OFFICE']);
  assert.deepEqual(jobPostingOptionsFor({ allIndia: false, headOffice: true, states: [] }).map((option) => option.value), ['', 'HEAD_OFFICE']);
  assert.equal(jobPostingOptionsFor(null).length, 3);
});
