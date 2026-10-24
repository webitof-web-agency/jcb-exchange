import assert from 'node:assert/strict';
import test from 'node:test';
import { contactLifecyclePresentation } from './contactPresentation';

test('contact lifecycle presentation shows the saved lifecycle independently of role and pipeline stage', () => {
  assert.deepEqual(contactLifecyclePresentation('PROSPECT'), { label: 'Prospect', tone: 'amber' });
  assert.deepEqual(contactLifecyclePresentation('CUSTOMER'), { label: 'Customer', tone: 'green' });
  assert.deepEqual(contactLifecyclePresentation('INACTIVE'), { label: 'Inactive', tone: 'slate' });
});

test('contact lifecycle presentation defaults missing lifecycle data to Lead', () => {
  assert.deepEqual(contactLifecyclePresentation(null), { label: 'Lead', tone: 'blue' });
});
