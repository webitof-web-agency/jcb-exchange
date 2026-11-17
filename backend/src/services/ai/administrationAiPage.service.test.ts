import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMINISTRATION_AI_PAGE_KEYS,
  administrationPageKeyFor,
  administrationPagePermissionsFor,
  administrationPageQuestionKeys,
} from './administrationAiPage.service';

test('defines a stable AI contract for every Administration page', () => {
  assert.deepEqual(ADMINISTRATION_AI_PAGE_KEYS, ['users', 'roles', 'settings', 'whatsapp', 'sms']);

  for (const pageKey of ADMINISTRATION_AI_PAGE_KEYS) {
    assert.ok(administrationPageQuestionKeys(pageKey).length >= 5, `question keys missing for ${pageKey}`);
    assert.ok(administrationPagePermissionsFor(pageKey).length > 0, `permissions missing for ${pageKey}`);
  }
});

test('recognizes Administration page aliases and page context', () => {
  assert.equal(administrationPageKeyFor('show all users and their status'), 'users');
  assert.equal(administrationPageKeyFor('roles aur permissions ka full data batao'), 'roles');
  assert.equal(administrationPageKeyFor('platform settings readiness dikhao'), 'settings');
  assert.equal(administrationPageKeyFor('whatsapp campaign delivery report'), 'whatsapp');
  assert.equal(administrationPageKeyFor('sms logs aur failed messages dikhao'), 'sms');
  assert.equal(administrationPageKeyFor('random request', { moduleKey: 'settings' }), 'settings');
});
