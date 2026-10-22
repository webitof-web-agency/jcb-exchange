import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeMatches, reconcile } from './bankingRules';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('a unique amount within the date window matches', () => {
  const matches = proposeMatches(
    [{ id: 's1', date: day('2026-10-05'), amount: 50000, text: 'NEFT CR RAMESH' }],
    [{ id: 'b1', date: day('2026-10-03'), amount: 50000, refs: ['RV/26-27/00001'] }, { id: 'b2', date: day('2026-10-03'), amount: -50000, refs: [] }],
  );
  assert.deepEqual(matches, [{ statementId: 's1', bookId: 'b1', reason: 'UNIQUE' }]);
});

test('outside the window, or opposite direction, does not match', () => {
  assert.deepEqual(proposeMatches([{ id: 's1', date: day('2026-10-10'), amount: 50000, text: '' }], [{ id: 'b1', date: day('2026-10-01'), amount: 50000, refs: [] }]), []);
  assert.deepEqual(proposeMatches([{ id: 's1', date: day('2026-10-01'), amount: -50000, text: '' }], [{ id: 'b1', date: day('2026-10-01'), amount: 50000, refs: [] }]), []);
});

test('several candidates: the reference in the narration wins, else the nearest date, else none', () => {
  const book = [{ id: 'b1', date: day('2026-10-01'), amount: 1000, refs: ['UTR998877'] }, { id: 'b2', date: day('2026-10-02'), amount: 1000, refs: ['UTR112233'] }];
  assert.deepEqual(proposeMatches([{ id: 's1', date: day('2026-10-02'), amount: 1000, text: 'IMPS/UTR998877/X' }], book), [{ statementId: 's1', bookId: 'b1', reason: 'REFERENCE' }]);
  assert.deepEqual(proposeMatches([{ id: 's1', date: day('2026-10-02'), amount: 1000, text: 'CASH DEP' }], book), [{ statementId: 's1', bookId: 'b2', reason: 'NEAREST' }]);
  const tie = [{ id: 'b1', date: day('2026-10-01'), amount: 1000, refs: [] }, { id: 'b2', date: day('2026-10-03'), amount: 1000, refs: [] }];
  assert.deepEqual(proposeMatches([{ id: 's1', date: day('2026-10-02'), amount: 1000, text: '' }], tie), []);
});

test('a book line is used once', () => {
  const matches = proposeMatches(
    [{ id: 's1', date: day('2026-10-01'), amount: 500, text: '' }, { id: 's2', date: day('2026-10-01'), amount: 500, text: '' }],
    [{ id: 'b1', date: day('2026-10-01'), amount: 500, refs: [] }],
  );
  assert.equal(matches.length, 1);
});

test('BRS: book balance adjusted for one-sided items equals the statement', () => {
  const result = reconcile({
    bookBalance: 100000,
    statementBalance: 129400,
    bookOnly: [{ amount: 20000 }, { amount: -50000 }],
    statementOnly: [{ amount: -600 }],
  });
  assert.equal(result.depositsNotCredited, 20000);
  assert.equal(result.paymentsNotPresented, 50000);
  assert.equal(result.bankDebitsNotInBooks, 600);
  assert.equal(result.expectedStatement, 129400);
  assert.equal(result.difference, 0);
  assert.equal(reconcile({ bookBalance: 10, statementBalance: null, bookOnly: [], statementOnly: [] }).difference, null);
});
