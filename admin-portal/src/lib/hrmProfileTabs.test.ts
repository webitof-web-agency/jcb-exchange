import assert from 'node:assert/strict';
import test from 'node:test';
import type { HrmChecklistItem, HrmChecklistState } from './hrmApi';
import { checklistAction, checklistTab, nextOpenItem, openItemsByTab, readProfileTab, visibleProfileTabs, type ProfileTabAccess } from './hrmProfileTabs';
import { defaultDocumentTitle, documentGroupFor, documentKindLabel, documentOrigin, visibleDocumentGroups } from './hrmDocuments';

const everything: ProfileTabAccess = {
  documentsVisible: true,
  tabs: { kyc: true, attendance: true, leave: true, compensation: true, performance: true, exit: true },
  read: { salary: true, shift: true },
};
const item = (key: string, state: HrmChecklistState, required = true): HrmChecklistItem => ({ key, label: key, state, required, counted: required, hint: '' });

test('reads the tab from new and old links', () => {
  assert.equal(readProfileTab('documents'), 'documents');
  assert.equal(readProfileTab('compensation'), 'salary');
  assert.equal(readProfileTab('kyc'), 'kyc');
  assert.equal(readProfileTab('nonsense'), 'overview');
  assert.equal(readProfileTab(null), 'overview');
});

test('shows only the sections the viewer may open, and no attendance / exit before somebody starts', () => {
  const joiner = visibleProfileTabs('PRE_ONBOARDING', everything).map((tab) => tab.id);
  assert.deepEqual(joiner, ['overview', 'personal', 'job', 'kyc', 'documents', 'salary', 'shift', 'access']);
  assert.ok(visibleProfileTabs('ACTIVE', everything).some((tab) => tab.id === 'attendance'));
  const limited = visibleProfileTabs('ACTIVE', {
    documentsVisible: false,
    tabs: { kyc: false, attendance: false, leave: false, compensation: false, performance: false, exit: false },
    read: { salary: false, shift: false },
  }).map((tab) => tab.id);
  assert.deepEqual(limited, ['overview', 'personal', 'job', 'access']);
});

test('each joining item has its tab, and open required items are counted per tab', () => {
  assert.equal(checklistTab('PERSONAL'), 'personal');
  assert.equal(checklistTab('PLACEMENT'), 'job');
  assert.equal(checklistTab('BANK'), 'kyc');
  assert.equal(checklistTab('ACCEPTANCE'), 'documents');
  assert.equal(checklistTab('LOGIN'), 'access');
  assert.equal(checklistTab('UNKNOWN'), null);
  const counts = openItemsByTab([item('PAN', 'MISSING'), item('AADHAAR', 'DONE'), item('BANK', 'PENDING'), item('OFFER_LETTER', 'MISSING'), item('EDUCATION', 'MISSING', false)]);
  assert.deepEqual(counts, { kyc: 2, documents: 1 });
});

test('the button follows the state and what the viewer may do', () => {
  assert.equal(checklistAction(item('PAN', 'MISSING'), { open: true, complete: true }), 'Complete');
  assert.equal(checklistAction(item('PAN', 'MISSING'), { open: true, complete: false }), 'View');
  assert.equal(checklistAction(item('BANK', 'PENDING'), { open: true, complete: true }), 'Review');
  assert.equal(checklistAction(item('PAN', 'DONE'), { open: true, complete: true }), 'View');
  assert.equal(checklistAction(item('PAN', 'DONE'), { open: false, complete: false }), null);
});

test('"next" is the next missing item the viewer can do, wrapping to the top', () => {
  const list = [item('PERSONAL', 'MISSING'), item('PAN', 'DONE'), item('BANK', 'MISSING'), item('SALARY', 'MISSING')];
  const can = (entry: HrmChecklistItem) => entry.key !== 'SALARY';
  assert.equal(nextOpenItem(list, 'PERSONAL', can)?.key, 'BANK');
  assert.equal(nextOpenItem(list, 'BANK', can)?.key, 'PERSONAL');
  assert.equal(nextOpenItem([item('PAN', 'MISSING')], 'PAN', () => true), null);
});

test('documents are grouped, the offer files together, and a focus shows one group', () => {
  const files = [{ category: 'OFFER' }, { category: 'ACCEPTANCE' }, { category: 'TAX' }];
  const all = visibleDocumentGroups(files, null);
  assert.deepEqual(all.map((group) => group.id), ['OFFER', 'PHOTO', 'ADDRESS', 'EDUCATION', 'TAX']);
  assert.equal(all[0]!.documents.length, 2);
  assert.deepEqual(visibleDocumentGroups(files, 'PHOTO').map((group) => group.id), ['PHOTO']);
  assert.equal(documentGroupFor('ACCEPTANCE'), 'OFFER');
  assert.equal(documentGroupFor('PAN'), null);
});

test('says where a file came from and what it is', () => {
  assert.equal(documentOrigin({ provider: 'GOOGLE_DRIVE', metadata: { source: 'RECRUITMENT_OFFER' }, uploadedById: 'hr' }, 'emp'), 'OFFER');
  assert.equal(documentOrigin({ provider: 'SUREPASS' }, 'emp'), 'KYC');
  assert.equal(documentOrigin({ provider: 'GOOGLE_DRIVE', uploadedById: 'emp' }, 'emp'), 'EMPLOYEE');
  assert.equal(documentOrigin({ provider: 'GOOGLE_DRIVE', uploadedById: 'hr' }, null), 'HR');
  assert.equal(documentKindLabel({ category: 'ACCEPTANCE', metadata: { kind: 'ACCEPTANCE_CERTIFICATE' } }), 'Acceptance certificate');
  assert.equal(documentKindLabel({ category: 'ACCEPTANCE', metadata: null }), 'Signed offer letter');
  assert.equal(documentKindLabel({ category: 'OFFER', metadata: null }), 'Offer letter');
  assert.equal(defaultDocumentTitle('ACCEPTANCE'), 'Signed offer letter');
  assert.equal(defaultDocumentTitle('OTHER'), '');
});
