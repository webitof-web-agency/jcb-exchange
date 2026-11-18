# Sold Vehicles Module Relationships

**Phase:** 7 coverage, relationship mapping and connected-module wiring  
**Audit date:** 2026-11-18

## Canonical relationship graph

```text
SellAccount
├── listingId ───────────────> Listing
│   ├── partnerId ───────────> User / PartnerProfile
│   ├── saleRecord ──────────> SaleRecord
│   ├── paymentSubmissions ──> ListingPaymentSubmission
│   ├── media ───────────────> Media
│   └── leads ───────────────> Lead
├── payments[] ──────────────> SellAccountPayment
│   └── listingPaymentId ────> ListingPaymentSubmission (optional unique link)
├── refunds[] ───────────────> SellAccountRefund
├── statusHistory[] ─────────> SellAccountStatusHistory
├── deedWorkflows[] ─────────> SellAccountDeedWorkflow
├── rtoRecord ───────────────> VehicleRtoRecord
│   ├── statusLogs[] ────────> VehicleRtoStatusLog
│   └── transferTasks[] ────> RtoTransferTask
├── finance identifiers ─────> FinVoucher / FinVoucherLine
├── finance documents ───────> FinDocument / FinDocumentLine
├── deal extension ──────────> FinVehicleDealExt (identifier-based unique link)
├── due schedules ───────────> FinPaymentSchedule (identifier-based optional link)
└── write-offs ──────────────> FinWriteOff (identifier-based optional link)
```

## Verified join keys

| From | Key | To | Relationship type | AI implication |
|---|---|---|---|---|
| SellAccount | `listingId` | Listing | nullable unique relation | primary vehicle/listing bridge |
| SellAccountPayment | `sellAccountId` | SellAccount | required FK | exact payment ledger |
| SellAccountPayment | `listingPaymentId` | ListingPaymentSubmission | optional unique business link | website advance reconciliation |
| SellAccountRefund | `sellAccountId` | SellAccount | required FK | exact refund ledger |
| SellAccountStatusHistory | `sellAccountId` | SellAccount | required FK | deal timeline |
| SellAccountLockHistory | `sellAccountId` | SellAccount | required FK | persisted lock/unlock operational timeline |
| SellAccountStatusHistory | `changedById` | User | nullable identifier | status actor when the user still exists |
| SellAccountLockHistory | `actorId` | User | nullable identifier | lock/unlock actor when the user still exists |
| SellAccountRefund | requested/approved/rejected/paid user IDs | User | nullable identifiers | maker-checker and payment audit |
| SellAccountPayment | issued/cancelled/created user IDs | User | nullable identifiers | receipt and ledger audit |
| SellAccount / SellAccountPayment | `relatedEntityType` + `relatedEntityId` | WhatsAppMessageLog / SmsMessageLog | operational polymorphic link | delivery, failure and outbox audit |
| SellAccountDeedWorkflow | `sellAccountId` | SellAccount | required FK | deed workflow |
| VehicleRtoRecord | `sellAccountId` | SellAccount | optional unique FK | RTO handoff |
| VehicleRtoRecord | `listingId` | Listing | optional FK | fallback/listing RTO context |
| RtoTransferTask | `rtoRecordId` | VehicleRtoRecord | required FK | task/document progress |
| Lead | `wonSellAccountId` | SellAccount | business relation | CRM won-deal link |
| Lead | `listingId` | Listing | optional relation | pre-sale CRM context |
| Lead | `customerId` | User | required FK | exact customer for the won deal |
| Lead | `dealerId` | User | required FK | exact dealer/partner recipient for the CRM lead |
| Lead | `ownerId` | User | nullable FK | exact CRM staff owner |
| CrmFollowUp | `leadId` | Lead | nullable FK | exact deal follow-up when the lead is a won deal |
| FinVoucher | `sellAccountId` | SellAccount | nullable identifier, not Prisma FK | accounting source link |
| FinVoucherLine | `sellAccountId` | SellAccount | nullable identifier, not Prisma FK | line-level accounting link |
| FinDocument | `sellAccountId` | SellAccount | nullable identifier, not Prisma FK | invoice/credit-note link |
| FinDocumentLine | `sellAccountId` | SellAccount | nullable identifier, not Prisma FK | document line link |
| FinVehicleDealExt | `sellAccountId` | SellAccount | unique identifier, not FK | finance terms link |
| FinPaymentSchedule | `sellAccountId` | SellAccount | nullable identifier, not FK | receivable/payable plan |
| FinWriteOff | `sellAccountId` | SellAccount | nullable identifier, not FK | balance adjustment |
| FinPartyLink | `linkType` + `linkId` | SellAccount | unique business link | seller/purchaser/broker accounting party bridge |

## Phase 6 operational audit edges

```text
SellAccount
├── statusHistory[] ──> SellAccountStatusHistory ──changedById──> User
├── lockHistory[] ────> SellAccountLockHistory ────actorId────> User
├── refunds[] ────────> SellAccountRefund ───────── maker/checker/paid IDs ──> User
├── payments[] ───────> SellAccountPayment ─────── receipt actors ───────────> User
│   └── listingPaymentId ──> ListingPaymentSubmission (online advance)
├── communication logs by (SELL_ACCOUNT, sellAccountId)
├── payment communication logs by (SELL_ACCOUNT_PAYMENT, paymentId)
└── operational notes from SellAccount, RTO, Finance extension and Listing saleRecord
```

The AI read model treats these as source-backed operational records. It returns explicit missing/unmatched warnings and does not infer an actor, timestamp, delivery outcome or payment bridge.

## Phase 7 connected-module graph

```text
SellAccount (canonical deal)
├── listingId ──> Listing ──categoryId/brandId/modelId──> Inventory masters
│   ├── partnerId ──> User ──> PartnerProfile
│   ├── saleRecord ──> SaleRecord
│   ├── paymentSubmissions ──> ListingPaymentSubmission
│   └── media[] ──> Media
├── Lead.wonSellAccountId ──> exact CRM Lead
│   ├── customerId ──> customer User
│   ├── dealerId ──> dealer/partner User
│   ├── ownerId ──> CRM staff User
│   └── followUps[] ──> CrmFollowUp
├── VehicleRtoRecord.sellAccountId ──> RTO Work
│   └── transferTasks[].rtoRecordId ──> RtoTransferTask ──documents
├── Fin*.sellAccountId ──> Finance Hub / Accounting
│   ├── FinPartyLink(linkType, linkId) ──> seller/purchaser/broker party
│   └── sourceType=SELL_ACCOUNT, sourceId=dealId ──> Tally export source
├── SellAccountPayment.listingPaymentId ──> website advance
└── communication(relatedEntityType, relatedEntityId) ──> WhatsApp/SMS logs
```

The projection rejects a row when its key does not match the canonical deal, listing, RTO record or payment set. A generic global Tasks page has no direct Sold Vehicle foreign key in the current schema; only exact CRM follow-ups and RTO transfer tasks are returned.

## Phase 8 document graph

```text
SellAccount (deal)
├── invoiceNumber ──> generated Bill of Supply PDF
├── payments[].id ──> issued money receipt PDF
├── refunds[].id ──> paid refund advice PDF
├── creditNoteNumber ──> generated credit note PDF
├── completedAt + not draft/cancelled ──> delivery challan PDF
├── documents JSON ──> purchase/sale deed and KYC file slots
├── rtoRecord.id ──> transfer summary; transferTasks[].documents[].id ──> RTO file
├── listingId ──> Listing.media[] ──> vehicle image/video file
└── payments[].listingPaymentId ──> advance receipt proof
```

Every document action carries the exact deal/document/payment/refund/task/media key and resolves to an authenticated internal route. The AI action layer never accepts an external URL as a file action and never treats a draft/unavailable source as a downloadable final document.

## Relationship risks to resolve before exact AI answers

1. Finance identifiers are intentionally not foreign keys; the adapter must validate the target SellAccount exists and report orphaned finance rows.
2. A Listing can be released after a cancelled sale and later listed/sold again. AI must use `SellAccount.id`/`recordNumber` as the deal identity and never infer a deal from Listing alone.
3. `ListingPaymentSubmission` can be an advance before a SellAccount exists. It must not be counted twice after `SellAccountPayment.listingPaymentId` is attached.
4. Listing-level RTO and SellAccount-level RTO are not automatically the same handover. The explicit SellAccount RTO link is authoritative for a Sold Vehicle deal.
5. CRM linkage can be by explicit lead ID or won leads on the listing. Multiple CRM rows must be represented with source and count, not silently collapsed.
6. Payment totals depend on receipt status; draft and cancelled receipts must not be treated as received money.
7. Refund totals depend on refund status; only paid refunds affect money/balance calculations.
8. The displayed profit uses tax mode and margin basis; AI must reuse the canonical finance calculation and expose the basis/date.

## Phase 2 identity rules

| Identity | Verified source | What is not present |
|---|---|---|
| Deal | `SellAccount.id` with human key `SellAccount.recordNumber` | No separate deal table is required for the current module. |
| Vehicle | `SellAccount.listingId` → `Listing.id`, with registration/chassis business keys | No standalone `Vehicle.id` is present in the Sold Vehicle schema. |
| Customer | `Lead.customerId` or `ListingPaymentSubmission.buyerId` only when linked to the deal | `SellAccount` has no `customerId`; purchaser name/number are snapshots. |
| Partner | `Listing.partnerId` → `User.id` → `PartnerProfile.userId` | `SellAccount` has no direct `partnerId`; seller text is not a partner key. |

## Relationship graph with AI boundaries

```text
SellAccount (canonical deal)
├── listingId ───────────────> Listing
│   ├── partnerId ────────────> User ──> PartnerProfile
│   ├── saleRecord ───────────> SaleRecord
│   ├── paymentSubmissions ───> ListingPaymentSubmission ──> buyer User
│   └── leads ────────────────> Lead ──> customer User / CRM activity / follow-ups
├── payments[] ───────────────> SellAccountPayment
│   └── listingPaymentId ─────> ListingPaymentSubmission (optional one-to-one bridge)
├── refunds[] ────────────────> SellAccountRefund
├── statusHistory[] ──────────> SellAccountStatusHistory
├── deedWorkflows[] ──────────> SellAccountDeedWorkflow
├── rtoRecord ────────────────> VehicleRtoRecord
│   ├── statusLogs[] ─────────> VehicleRtoStatusLog
│   └── transferTasks[] ──────> RtoTransferTask ──> task documents
└── identifier-based finance links
    ├── FinVoucher / FinVoucherLine
    ├── FinDocument / FinDocumentLine
    ├── FinVehicleDealExt
    ├── FinPaymentSchedule
    └── FinWriteOff
```

Phase 2 canonical resolver rule: resolve `SellAccount.id` first, then traverse only verified edges. Listing, name, phone and registration matches are search inputs, not proof of identity until they resolve to one deal.

## Phase 9 intelligence data flow

```text
SellAccount (selected period / exact deal)
├── SellAccountPayment[] ──> customer receipts / seller payments / cash flow
├── SellAccountRefund[] ──> requested, approved, paid and pending refunds
├── VehicleRtoRecord ──> delay days, status and pending transfer tasks
├── documents JSON + RTO task documents ──> document readiness
└── Listing.brand/model ──> model-wise performance
        └── canonical financial reconciliation ──> profit, GST, margin, balances
                └── daily source series ──> revenue/cash-flow forecast
```

The Phase 9 read model uses `sold.vehicle.analytics`. Period totals are restricted to non-draft, non-cancelled deals in the selected effective-date range. Exact deal identifiers are authoritative for one deal even when the deal is older than the default range. Forecasts are estimates with explicit assumptions and confidence, never current facts or guarantees.
