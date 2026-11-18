# Phase 7 — Sold Vehicle Connected Modules Wiring

**Date:** 2026-11-18  
**Canonical tool:** `sold.vehicle.detail`  
**Projection:** `connectedModules`

## Verified relationship contract

The projection starts from one exact `SellAccount.id`. It accepts a connected record only when its stored relationship key matches that deal, its listing, its RTO record or one of its payment IDs.

| Module | Verified key | Result |
|---|---|---|
| Listings / Inventory | `SellAccount.listingId = Listing.id` | Listing, category, brand, model, sale record, media and inventory state |
| CRM / Customer | `Lead.wonSellAccountId = SellAccount.id` | Exact won leads, customer, dealer, owner and CRM follow-ups |
| Partners / Dealers | `Listing.partnerId = User.id`; `Lead.dealerId = User.id` | Partner user and attached `PartnerProfile`, plus CRM dealer |
| RTO Work | `VehicleRtoRecord.sellAccountId = SellAccount.id` | Exact RTO record, status and compliance |
| RTO tasks | `RtoTransferTask.rtoRecordId = VehicleRtoRecord.id` | Transfer tasks and task documents |
| Finance Hub | each `Fin*.sellAccountId = SellAccount.id` | Vouchers, documents, deal extension, schedules and write-offs |
| Accounting parties | `FinPartyLink.linkType + linkId` | Seller/purchaser/broker party bridge |
| Accounting / Tally | `sourceType=SELL_ACCOUNT`, `sourceId=dealId` | Tally export source derived from verified finance rows |
| Website advances | `SellAccountPayment.listingPaymentId = ListingPaymentSubmission.id` | Advance-to-receipt mapping and unmatched rows |
| WhatsApp / SMS | `relatedEntityType + relatedEntityId` | Deal/payment delivery logs and errors |
| Vehicle documents | deal, listing and RTO task source keys | Account documents, deeds, media and task documents |
| Tasks | `CrmFollowUp.leadId` or `RtoTransferTask.rtoRecordId` | Only exact connected tasks; no guessed global task link |

## Wrong-record and duplicate protection

- A listing mismatch excludes the listing from the connected result and emits a warning.
- CRM leads are filtered by the exact `wonSellAccountId`; leads for another deal never become customer data for this deal.
- RTO records are filtered by exact `sellAccountId`; a listing-only RTO record is not accepted as the Sold Vehicle RTO record.
- Finance rows are filtered by exact `sellAccountId`; party bridges are filtered by their exact link type and deal ID.
- Communication rows are accepted only for the deal or known payment IDs.
- Duplicate IDs are deduplicated while the `integrity.duplicateRecordsExcluded` count remains visible.
- Rejected records and their source keys are summarized in `warnings` and `integrity.wrongRecordsExcluded`.

## Explicit non-relations

The current schema has no generic Sold Vehicle task foreign key and no separate Tally transaction table. The AI therefore returns exact CRM follow-ups/RTO tasks and Finance/Tally export source metadata only; it does not claim a relationship that the database does not store.

## Verification

- Connected-module unit projection: 2/2 passed.
- Exact detail integration: 5/5 targeted tests passed.
- TypeScript validation: passed.
- Phase 6 migrations deployed; Prisma reports the database schema up to date.
- Live/staging comparison remains required before the registry status can become `verified`.
