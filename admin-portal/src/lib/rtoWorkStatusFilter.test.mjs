import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRtoStatusFilterOptions } from './rtoWorkStatusFilter.mjs';

test('builds a complete dynamic RTO status filter with live counts', () => {
  const options = buildRtoStatusFilterOptions([
    { rtoStatus: 'PENDING' },
    { rtoStatus: 'pending' },
    { rtoStatus: 'IN_PROGRESS' },
    { rtoStatus: 'SUBMITTED' },
    { rtoStatus: 'APPROVED' },
  ]);

  assert.deepEqual(options, [
    { value: 'ALL', label: 'All RTO Statuses (5)' },
    { value: 'RTO_WORK_STARTED', label: 'RTO Work Start (2)' },
    { value: 'RTO_WORK_IN_PROGRESS', label: 'RTO Work Progress (3)' },
    { value: 'RTO_WORK_FAILED', label: 'RTO Work Failed / Errors (0)' },
    { value: 'RTO_WORK_COMPLETED', label: 'RTO Work Completed (0)' },
    { value: 'DEAL_DONE', label: 'Deal Done (0)' },
  ]);
});

test('does not let an unknown API status break the filter counts', () => {
  const options = buildRtoStatusFilterOptions([{ rtoStatus: 'unexpected-value' }]);

  assert.equal(options[0].label, 'All RTO Statuses (1)');
  assert.equal(options[1].label, 'RTO Work Start (0)');
});
