import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  applicationReachWhere,
  candidateReachWhere,
  defaultJobLocationType,
  filterOfferDocuments,
  interviewReachWhere,
  jobReachWhere,
  limitOfferActivity,
  offerReachWhere,
  placeInReach,
  reachesNothing,
  RECRUITMENT_ROUTE_ACCESS,
  recruitmentReachFrom,
} from './recruitmentReachRules';

const login = (permissions: string[] = [], scopes: Array<{ scopeType: string; stateId?: number | null }> = [], role = 'EMPLOYEE') =>
  recruitmentReachFrom({ userId: 'u1', role, permissions, scopes });

test('all of India: Super Admin, the all-India permissions, or an All-India scope', () => {
  assert.equal(login([], [], 'SUPER_ADMIN').all, true);
  for (const permission of ['ALL_ACCESS', 'recruitment.scope.all', 'hrm.scope.all']) assert.equal(login([permission]).all, true, permission);
  assert.equal(login([], [{ scopeType: 'ALL_INDIA' }]).all, true);
  // The legacy ADMIN role works by its permissions, like an employee.
  assert.equal(login(['recruitment.offers.read'], [], 'ADMIN').all, false);
});

test('otherwise only the STATE scopes (once each) and the head office scope', () => {
  const reach = login(['recruitment.offers.read'], [
    { scopeType: 'STATE', stateId: 4030 }, { scopeType: 'STATE', stateId: 4030 }, { scopeType: 'STATE', stateId: 4008 },
    { scopeType: 'DIRECT_REPORTS' }, { scopeType: 'DEPARTMENT' },
  ]);
  assert.deepEqual(reach, { all: false, userId: 'u1', stateIds: [4030, 4008], headOffice: false });
  assert.equal(reachesNothing(login()), true);
  assert.equal(reachesNothing(login([], [{ scopeType: 'HEAD_OFFICE' }])), false);
});

test('an all-India viewer is never filtered', () => {
  const all = login(['recruitment.scope.all']);
  for (const where of [jobReachWhere(all), offerReachWhere(all), applicationReachWhere(all), interviewReachWhere(all), candidateReachWhere(all)]) {
    assert.deepEqual(where, {});
  }
});

test('a login with no state sees nothing, except the interviews it takes', () => {
  const none = login();
  const nothing = { id: { in: [] } };
  assert.deepEqual(jobReachWhere(none), nothing);
  assert.deepEqual(offerReachWhere(none), nothing);
  assert.deepEqual(applicationReachWhere(none), nothing);
  assert.deepEqual(candidateReachWhere(none), nothing);
  assert.deepEqual(interviewReachWhere(none), { interviewerId: 'u1' });
});

test('a State Manager sees state office jobs and offers of the state, not head office ones in the same state', () => {
  const reach = login([], [{ scopeType: 'STATE', stateId: 4030 }]);
  assert.deepEqual(jobReachWhere(reach), { OR: [{ hrmLocationType: 'STATE_OFFICE', hrmStateId: { in: [4030] } }] });
  assert.deepEqual(offerReachWhere(reach), {
    OR: [{ locationType: 'STATE_OFFICE', stateId: { in: [4030] } }, { locationType: null, job: jobReachWhere(reach) }],
  });
  assert.deepEqual(applicationReachWhere(reach), {
    OR: [{ job: jobReachWhere(reach) }, { offers: { some: { OR: [{ locationType: 'STATE_OFFICE', stateId: { in: [4030] } }] } } }],
  });
  assert.equal(placeInReach(reach, { locationType: 'STATE_OFFICE', stateId: 4030 }), true);
  assert.equal(placeInReach(reach, { locationType: 'STATE_OFFICE', stateId: 4008 }), false);
  assert.equal(placeInReach(reach, { locationType: 'HEAD_OFFICE', stateId: 4030 }), false);
  assert.equal(placeInReach(reach, { locationType: null, stateId: 4030 }), false);
});

test('a job gets head office only in a head office city', () => {
  const headOffices = [{ stateId: 4040, cityName: 'Raipur' }, { stateId: 4042, cityName: 'Mumbai' }, { stateId: null, cityName: null }];
  assert.equal(defaultJobLocationType(4040, ' raipur ', headOffices), 'HEAD_OFFICE');
  assert.equal(defaultJobLocationType(4042, 'Mumbai', headOffices), 'HEAD_OFFICE', 'any head office, not only the default');
  assert.equal(defaultJobLocationType(4040, 'Bilaspur', headOffices), 'STATE_OFFICE');
  assert.equal(defaultJobLocationType(4030, 'Raipur', headOffices), 'STATE_OFFICE');
  assert.equal(defaultJobLocationType(4030, 'Pune', []), 'STATE_OFFICE');
  assert.equal(defaultJobLocationType(null, 'Pune', headOffices), null);
});

test('activity about offers a viewer cannot see is left out, and no entry shows the salary', () => {
  const log = (action: string, applicationId: string, details: string) => ({ action, applicationId, details });
  const logs = [
    log('OFFER_CREATED', 'a1', 'Offer created for designation "Sales" with CTC ₹500000'),
    log('STAGE_CHANGED', 'a1', 'Moved'),
    log('OFFER_CREATED', 'a2', 'Offer created for designation "Clerk" with CTC ₹300000'),
  ];
  const shown = limitOfferActivity(logs, [{ applicationId: 'a1' }]);
  assert.deepEqual(shown.map((row) => [row.action, row.details]), [['STAGE_CHANGED', 'Moved'], ['OFFER_CREATED', 'Offer created for designation "Clerk"']]);
});

test('offer documents of a hidden offer are not listed', () => {
  const offer = (applicationId: string, letter: string) => ({ applicationId, offerLetterUrl: letter, signatureFileUrl: null, acceptanceCertificateUrl: null, signedLetterUrl: null });
  const documents = [
    { category: 'RESUME', fileUrl: 'resume', applicationId: 'a1' },
    { category: 'OFFER_LETTER', fileUrl: 'mine', applicationId: 'a1' },
    { category: 'OFFER_LETTER', fileUrl: 'theirs', applicationId: 'a1' },
    { category: 'OFFER_LETTER_SIGNED', fileUrl: 'old-copy', applicationId: 'a1' },
    { category: 'OFFER_LETTER', fileUrl: 'other', applicationId: 'a2' },
  ];
  const listed = filterOfferDocuments(documents, [offer('a1', 'mine')], [offer('a1', 'theirs')]).map((row) => row.fileUrl);
  assert.deepEqual(listed, ['resume', 'mine', 'other']);
  assert.equal(filterOfferDocuments(documents, [], []).length, documents.length);
});

// ---- no recruitment route without a state rule ----

const read = (file: string) => readFileSync(path.join(__dirname, '..', file), 'utf8');
const routeLines = () => read('routes/recruitment.routes.ts').split(/\r?\n/)
  .map((line) => /^router\.(get|post|put|patch|delete)\('(\/admin\/[^']*)',(.*)\);\s*$/.exec(line))
  .filter((match): match is RegExpExecArray => Boolean(match))
  // Accounts screens (RTO, sold vehicles, transport) share the router but are not recruitment.
  .filter((match) => !/^\/admin\/(rto|sell-accounts|vehicle-transports)/.test(match[2]!))
  .map((match) => ({ key: `${match[1]!.toUpperCase()} ${match[2]}`, rest: match[3]!, handler: match[3]!.split(',').pop()!.trim() }));

const handlerSource = (name: string) => {
  const source = read('controllers/recruitment.controller.ts');
  const start = source.indexOf(`export const ${name} = `);
  assert.ok(start >= 0, `handler ${name}`);
  const next = source.indexOf('\nexport const ', start + 10);
  return source.slice(start, next < 0 ? source.length : next);
};

test('every admin recruitment route is listed with its state rule, and the list has no stale entry', () => {
  const routes = routeLines().map((route) => route.key).sort();
  assert.deepEqual(routes, Object.keys(RECRUITMENT_ROUTE_ACCESS).sort());
});

test('record routes carry a guard, company-wide changes need all-India, scoped handlers read the reach', () => {
  const GUARD = /require(Job|Application|Candidate|Offer|Interview)(View)?InReach|requireInterviewFeedbackAccess/;
  for (const route of routeLines()) {
    const rule = RECRUITMENT_ROUTE_ACCESS[route.key];
    if (rule === 'RECORD') assert.match(route.rest, GUARD, route.key);
    if (rule === 'MASTER_WRITE') assert.match(route.rest, /requireAllIndiaRecruitment/, route.key);
    if (rule === 'MASTER_MAIL') assert.match(route.rest, /refuseStateLimitedRecruitmentMail/, route.key);
    // A record route that changes something is checked by the exact id it changes, never by a slug or reference.
    if (rule === 'RECORD' && !route.key.startsWith('GET ')) assert.doesNotMatch(route.rest, /ViewInReach/, route.key);
    if (rule === 'SCOPED') assert.match(handlerSource(route.handler), /requestReach\(req, res\)/, route.key);
  }
  // These show or change related records too, so the handler narrows them as well.
  for (const handler of ['getAdminApplicationById', 'getAdminCandidateById', 'updateJob', 'updateOffer', 'deleteApplication']) {
    assert.match(handlerSource(handler), /requestReach\(req, res\)/, handler);
  }
});
