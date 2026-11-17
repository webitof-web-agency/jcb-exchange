import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RECRUITMENT_AI_PAGE_KEYS,
  recruitmentPageKeyFor,
  recruitmentPageQuestionKeys,
  recruitmentPagePermissionsFor,
} from './recruitmentAiPage.service';

test('defines a stable AI contract for every recruitment page', () => {
  assert.deepEqual(RECRUITMENT_AI_PAGE_KEYS, [
    'dashboard',
    'jobs',
    'job-detail',
    'applications',
    'application-detail',
    'candidates',
    'candidate-detail',
    'interviews',
    'offers',
    'departments',
    'pipeline',
    'settings',
  ]);

  for (const pageKey of RECRUITMENT_AI_PAGE_KEYS) {
    assert.ok(recruitmentPageQuestionKeys(pageKey).length >= 5, `question keys missing for ${pageKey}`);
    assert.ok(recruitmentPagePermissionsFor(pageKey).length > 0, `permissions missing for ${pageKey}`);
  }
});

test('recognizes English, Hindi/Hinglish page aliases and context keys', () => {
  assert.equal(recruitmentPageKeyFor('show recruitment jobs list'), 'jobs');
  assert.equal(recruitmentPageKeyFor('applications ka pura data dikhao'), 'applications');
  assert.equal(recruitmentPageKeyFor('interview schedule batao'), 'interviews');
  assert.equal(recruitmentPageKeyFor('pipeline stages dikhao'), 'pipeline');
  assert.equal(recruitmentPageKeyFor('dashboard ka summary', { moduleKey: 'dashboard' }), 'dashboard');
  assert.equal(recruitmentPageKeyFor('random request', { moduleKey: 'settings' }), 'settings');
});
