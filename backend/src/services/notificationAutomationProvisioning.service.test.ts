import assert from 'node:assert/strict';
import test from 'node:test';
import { provisionAutomationRules } from './notificationAutomationProvisioning.service';

test('provisions every unique event disabled without changing existing rules', async () => {
  const calls: any[] = [];
  await provisionAutomationRules({ createMany: async (input) => { calls.push(input); return { count: 2 }; } }, [
    'PARTNER_KYC_STATUS_UPDATED', 'PARTNER_KYC_STATUS_UPDATED', 'MARKETPLACE_NEW_LISTING_PUBLISHED',
  ]);

  assert.deepEqual(calls, [{
    data: [
      { eventCode: 'PARTNER_KYC_STATUS_UPDATED', enabled: false },
      { eventCode: 'MARKETPLACE_NEW_LISTING_PUBLISHED', enabled: false },
    ],
    skipDuplicates: true,
  }]);
});
