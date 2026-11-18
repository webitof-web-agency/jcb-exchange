import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoldVehicleConnectedModules } from './soldVehicleConnectedModules.service';

test('connects every Sold Vehicle module through verified keys and preserves exact records', () => {
  const result = buildSoldVehicleConnectedModules({
    dealId: 'deal-1',
    listingId: 'listing-1',
    listing: {
      id: 'listing-1',
      partnerId: 'partner-1',
      partner: { id: 'partner-1', profileId: 'profile-1' },
      paymentSubmissions: [{ id: 'advance-1', listingId: 'listing-1', amount: 250000 }],
    },
    crmLeads: [{
      id: 'lead-1', listingId: 'listing-1', wonSellAccountId: 'deal-1', customerId: 'customer-1', dealerId: 'partner-1',
      customer: { id: 'customer-1', name: 'Buyer' }, dealer: { id: 'partner-1', name: 'Dealer' },
      followUps: [{ id: 'follow-up-1', leadId: 'lead-1', status: 'PENDING' }],
    }],
    rto: { id: 'rto-1', sellAccountId: 'deal-1', listingId: 'listing-1', transferTasks: [{ id: 'task-1', rtoRecordId: 'rto-1', status: 'PENDING' }] },
    finance: {
      vouchers: [{ id: 'voucher-1', sellAccountId: 'deal-1', sourceType: 'SELL_ACCOUNT', sourceId: 'deal-1' }],
      documents: [{ id: 'document-1', sellAccountId: 'deal-1' }],
      dealExtension: { id: 'extension-1', sellAccountId: 'deal-1' },
      schedules: [{ id: 'schedule-1', sellAccountId: 'deal-1' }],
      writeOffs: [{ id: 'write-off-1', sellAccountId: 'deal-1' }],
      partyLinks: [{ partyId: 'party-1', linkType: 'SELL_ACCOUNT_SELLER', linkId: 'deal-1' }],
    },
    documents: { accountDocuments: [{ fileName: 'invoice.pdf' }], deedWorkflows: [{ id: 'deed-1' }], listingMedia: [{ id: 'media-1' }], rtoTaskDocuments: [{ fileName: 'rc.pdf' }] },
    websiteAdvances: { submissions: [{ id: 'advance-1', listingId: 'listing-1', amount: 250000 }], linkedReceipts: [{ paymentId: 'payment-1', listingPaymentId: 'advance-1' }] },
    communications: { whatsapp: [{ id: 'wa-1', relatedEntityType: 'SELL_ACCOUNT', relatedEntityId: 'deal-1' }], sms: [{ id: 'sms-1', relatedEntityType: 'SELL_ACCOUNT_PAYMENT', relatedEntityId: 'payment-1' }] },
  });

  assert.equal(result.integrity.allRelationshipsVerified, true);
  assert.equal(result.modules.listingsInventory.status, 'VERIFIED');
  assert.equal((result.modules.crmCustomer.records[0]?.customer as any)?.id, 'customer-1');
  assert.equal((result.modules.partnersDealers.records[0]?.user as any)?.id, 'partner-1');
  assert.equal(result.modules.rtoWork.records[0]?.id, 'rto-1');
  assert.equal(result.modules.financeHub.records.length, 5);
  assert.equal(result.modules.accountingTally.vouchers.length, 1);
  assert.equal(result.modules.tasks.records.length, 2);
  assert.equal(result.modules.vehicleDocuments.records.length, 4);
  assert.equal(result.modules.websiteAdvances.links[0]?.matched, true);
  assert.equal(result.modules.whatsappSms.records.length, 2);
});

test('excludes wrong and duplicate connected rows and reports their exact source keys', () => {
  const result = buildSoldVehicleConnectedModules({
    dealId: 'deal-1',
    listingId: 'listing-1',
    listing: { id: 'listing-other', partnerId: 'partner-1', partner: { id: 'wrong-partner' }, paymentSubmissions: [] },
    crmLeads: [
      { id: 'lead-1', listingId: 'listing-1', wonSellAccountId: 'other-deal', customerId: 'customer-x', dealerId: 'partner-x' },
      { id: 'lead-1', listingId: 'listing-1', wonSellAccountId: 'deal-1', customerId: 'customer-1', dealerId: 'partner-1' },
    ],
    rto: { id: 'rto-1', sellAccountId: 'other-deal', listingId: 'listing-1', transferTasks: [] },
    finance: { vouchers: [{ id: 'voucher-1', sellAccountId: 'other-deal' }, { id: 'voucher-1', sellAccountId: 'deal-1' }], documents: [], dealExtension: null, schedules: [], writeOffs: [], partyLinks: [] },
    documents: { accountDocuments: [], deedWorkflows: [], listingMedia: [], rtoTaskDocuments: [] },
    websiteAdvances: { submissions: [{ id: 'advance-1', listingId: 'other-listing', amount: 1 }], linkedReceipts: [] },
    communications: { whatsapp: [{ id: 'wa-wrong', relatedEntityType: 'SELL_ACCOUNT', relatedEntityId: 'other-deal' }], sms: [] },
  });

  assert.equal(result.modules.listingsInventory.status, 'MISMATCH');
  assert.equal(result.modules.crmCustomer.records.length, 1);
  assert.equal(result.modules.rtoWork.records.length, 0);
  assert.equal(result.modules.financeHub.records.length, 1);
  assert.equal(result.modules.whatsappSms.records.length, 0);
  assert.equal(result.integrity.duplicateRecordsExcluded > 0, true);
  assert.equal(result.integrity.wrongRecordsExcluded > 0, true);
  assert.match(result.warnings.join('\n'), /other-deal|listing-other|wrong-partner/);
});
