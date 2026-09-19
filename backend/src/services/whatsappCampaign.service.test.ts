import assert from 'node:assert/strict';
import test from 'node:test';
import { getCampaignRecipientType } from './whatsappCampaign.service';

test('maps campaign consent categories to their recipient type', () => {
  assert.equal(getCampaignRecipientType('MARKETING'), 'CUSTOMER');
  assert.equal(getCampaignRecipientType('JOB_ALERTS'), 'CANDIDATE');
});
