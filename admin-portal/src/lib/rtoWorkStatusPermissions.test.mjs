import assert from 'node:assert/strict';
import test from 'node:test';

import { getRtoActionVisibility, getRtoEditableFieldKeys } from './rtoWorkStatusPermissions.mjs';

test('hides RTO actions when the employee only has read access', () => {
  assert.deepEqual(
    getRtoActionVisibility({ canUpdateRto: false, canDeleteRto: false }),
    { showActions: false, showEdit: false, showDelete: false },
  );
});

test('shows only the RTO actions granted by permissions', () => {
  assert.deepEqual(
    getRtoActionVisibility({ canUpdateRto: true, canDeleteRto: false }),
    { showActions: true, showEdit: true, showDelete: false },
  );
  assert.deepEqual(
    getRtoActionVisibility({ canUpdateRto: false, canDeleteRto: true }),
    { showActions: true, showEdit: false, showDelete: true },
  );
});

test('keeps every editable RTO financial field in one shared contract', () => {
  assert.deepEqual(getRtoEditableFieldKeys(), [
    'rtoExpenses',
    'rtoExpensesAdvance',
    'vehicleMaintenanceCost',
    'documentSendDate',
  ]);
});
