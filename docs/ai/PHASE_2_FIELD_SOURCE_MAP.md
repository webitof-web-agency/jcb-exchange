# Phase 2 — Sold Vehicles Field Source Map

**Audit date:** 2026-11-17  
**Scope:** Sold Vehicles / `SellAccount` and verified connected records  
**Evidence:** `backend/prisma/schema.prisma`, canonical Sold Vehicle services, AI read-only tools and route controllers

## Reading this map

- **Direct** means the value is stored on the authoritative row named in the source column.
- **Derived** means the value is calculated from one or more authoritative rows. AI must reuse the canonical service calculation.
- **Snapshot** means the value was copied into the Sold Vehicle record at a business event and may not equal the current related profile.
- **Restricted** means the value is available only when the operator has the relevant field permission.
- **Never expose** means credentials, tokens, password material and private file-link secrets must not enter an AI response or provider context.

## Canonical identifiers

| Business identifier | Database source | Relationship/authority | Phase 2 rule |
|---|---|---|---|
| Deal ID | `SellAccount.id` | UUID primary key | Canonical deal identity for every cross-module query. |
| Deal number | `SellAccount.recordNumber` | Unique business key | Accept as a human-facing deal lookup key; resolve to `SellAccount.id` first. |
| Vehicle/listing ID | `Listing.id` via `SellAccount.listingId` | Nullable unique bridge | There is no standalone `Vehicle.id` in the Sold Vehicle schema. Do not invent one. |
| Vehicle business identity | `SellAccount.vehicleNumber`, `SellAccount.chassisNumber` | Deal snapshot; listing has normalized registration/chassis keys | Use registration/chassis only as search keys; resolve the deal before answering. |
| Customer ID | `Lead.customerId` or `ListingPaymentSubmission.buyerId` | Only available when the deal has the corresponding CRM/payment link | `SellAccount.purchaserName` and `purchaserNumber` are snapshots, not a customer FK. Report `customerId` as unavailable when no verified bridge exists. |
| Partner ID | `Listing.partnerId` → `User.id`; `PartnerProfile.userId` | Listing owner is the authoritative marketplace partner link | `SellAccount` has no direct `partnerId`; do not infer partner from seller name alone. |
| RTO ID | `VehicleRtoRecord.id` | `VehicleRtoRecord.sellAccountId` is the authoritative deal handoff | Prefer the SellAccount-linked RTO over listing-level RTO rows. |
| Invoice ID/number | `SellAccount.invoiceNumber`; finance `FinDocument.number` may be linked by `sellAccountId` | SellAccount invoice number is the operational sale document identity | Reconcile both sources and report discrepancies. |
| Payment ID | `SellAccountPayment.id` | Required `sellAccountId` FK | Receipt identity is `receiptNumber` only after the receipt is issued. |
| Refund ID | `SellAccountRefund.id` | Required `sellAccountId` FK | Refund business number is `refundNumber` when assigned. |

## Direct `SellAccount` field coverage

| AI field | Database source | Kind | Exposure rule / notes |
|---|---|---|---|
| `id` | `SellAccount.id` | Direct | Internal ID; use for joins, expose only to authorized operators. |
| `recordNumber` | `SellAccount.recordNumber` | Direct | Safe business lookup key. |
| `listingId` | `SellAccount.listingId` | Direct | Nullable bridge to `Listing.id`. |
| `listingTitle` | `SellAccount.listingTitle` | Snapshot | Deal-time listing title. |
| `ownerName` | `SellAccount.ownerName` | Snapshot / Restricted | Vehicle owner identity; permissioned PII. |
| `ownerNumber` | `SellAccount.ownerNumber` | Snapshot / Restricted | Phone/PII; permissioned. |
| `vehicleNumber` | `SellAccount.vehicleNumber` | Snapshot / Restricted | Registration number; permissioned vehicle identity. |
| `chassisNumber` | `SellAccount.chassisNumber` | Snapshot / Restricted | Sensitive vehicle identity. |
| `sellDate` | `SellAccount.sellDate` | Direct | Sale date. |
| `purchaserDate` | `SellAccount.purchaserDate` | Direct | Purchaser-side date. |
| `sellerDate` | `SellAccount.sellerDate` | Direct | Seller-side date. |
| `vehicleType` | `SellAccount.vehicleType` | Snapshot | Deal-time vehicle category/type. |
| `brandName` | `SellAccount.brandName` | Snapshot | Deal-time brand. |
| `vehicleModel` | `SellAccount.vehicleModel` | Snapshot | Deal-time model. |
| `sellerName` | `SellAccount.sellerName` | Snapshot / Restricted | Seller identity; permissioned PII. |
| `sellerNumber` | `SellAccount.sellerNumber` | Snapshot / Restricted | Seller phone; permissioned. |
| `purchaserName` | `SellAccount.purchaserName` | Snapshot / Restricted | Buyer identity; permissioned. |
| `purchaserNumber` | `SellAccount.purchaserNumber` | Snapshot / Restricted | Buyer phone; permissioned. |
| `sellerState` | `SellAccount.sellerState` | Direct | Seller location; permissioned where required. |
| `purchaserState` | `SellAccount.purchaserState` | Direct | Buyer location; permissioned where required. |
| `sellerCity` | `SellAccount.sellerCity` | Direct | Seller location. |
| `purchaserCity` | `SellAccount.purchaserCity` | Direct | Buyer location. |
| `sourceType` | `SellAccount.sourceType` | Direct | Own stock/partner/other source enum. |
| `purchaseType` | `SellAccount.purchaseType` | Direct | Purchase mode enum. |
| `saleType` | `SellAccount.saleType` | Direct | Sale mode enum. |
| `purchaseExchangeValue` | `SellAccount.purchaseExchangeValue` | Direct | Purchase-side exchange value. |
| `purchaseExchangeVehicle` | `SellAccount.purchaseExchangeVehicle` | Direct | Purchase-side exchange vehicle. |
| `saleExchangeValue` | `SellAccount.saleExchangeValue` | Direct | Sale-side exchange value. |
| `saleExchangeVehicle` | `SellAccount.saleExchangeVehicle` | Direct | Sale-side exchange vehicle. |
| `brokerName` | `SellAccount.brokerName` | Snapshot / Restricted | Broker identity. |
| `brokerNumber` | `SellAccount.brokerNumber` | Snapshot / Restricted | Broker phone. |
| `expenseBreakdown` | `SellAccount.expenseBreakdown` | Direct JSON | Must be reconciled to `expenses`; report raw approved breakdown when authorized. |
| `purchaseAmount` | `SellAccount.purchaseAmount` | Direct | Purchase cost basis. |
| `sellAmount` | `SellAccount.sellAmount` | Direct | Customer sale value. |
| `expenses` | `SellAccount.expenses` | Direct | Total entered/derived expenses. |
| `balanceAmount` | `SellAccount.balanceAmount` | Derived/cache | Prefer canonical payment/refund calculation for current balance. |
| `netProfit` | `SellAccount.netProfit` | Derived/cache | Explain calculation basis and date. |
| `netProfitAfterGst` | `SellAccount.netProfitAfterGst` | Derived/cache | Prefer canonical finance calculation and show GST basis. |
| `gstRatePercent` | `SellAccount.gstRatePercent` | Direct | Tax configuration for the deal. |
| `taxMode` | `SellAccount.taxMode` | Direct | GST/tax mode enum. |
| `marginBasis` | `SellAccount.marginBasis` | Direct | Before/after-expenses margin basis. |
| `transferDetails` | `SellAccount.transferDetails` | Direct / Restricted | Operational note; field permission required. |
| `remarks` | `SellAccount.remarks` | Direct / Restricted | Internal operational note; do not disclose by default. |
| `documents` | `SellAccount.documents` | Direct JSON / Restricted | Metadata only in AI; files must use secure file actions. |
| `isDraft` | `SellAccount.isDraft` | Direct | Draft state. |
| `draftSavedAt` | `SellAccount.draftSavedAt` | Direct | Draft timestamp. |
| `isLocked` | `SellAccount.isLocked` | Direct | Lock state. |
| `lockedAt` | `SellAccount.lockedAt` | Direct | Lock timestamp. |
| `lockedById` | `SellAccount.lockedById` | Direct / Restricted | Actor ID; expose only with audit permission. |
| `dealStatus` | `SellAccount.dealStatus` | Direct | Primary deal status enum. |
| `rtoStatusSnapshot` | `SellAccount.rtoStatusSnapshot` | Snapshot | Display snapshot; authoritative live status is `VehicleRtoRecord.rtoStatus`. |
| `completedAt` | `SellAccount.completedAt` | Direct | Final completion timestamp. |
| `invoiceNumber` | `SellAccount.invoiceNumber` | Direct | Operational invoice number. |
| `invoiceGeneratedAt` | `SellAccount.invoiceGeneratedAt` | Direct | Invoice generation timestamp. |
| `invoiceTokenHash` | `SellAccount.invoiceTokenHash` | Secret hash | Never expose. |
| `invoiceTokenExpiresAt` | `SellAccount.invoiceTokenExpiresAt` | Direct / Restricted | Do not expose token material; date may be permissioned. |
| `invoiceSentAt` | `SellAccount.invoiceSentAt` | Direct | Delivery-attempt success timestamp. |
| `invoiceDelivery` | `SellAccount.invoiceDelivery` | Direct JSON | Delivery audit; expose channel/status/error, never credentials/tokens. |
| `cancelledAt` | `SellAccount.cancelledAt` | Direct | Cancellation timestamp. |
| `cancelledById` | `SellAccount.cancelledById` | Direct / Restricted | Actor ID. |
| `cancelReason` | `SellAccount.cancelReason` | Direct / Restricted | Cancellation reason. |
| `creditNoteNumber` | `SellAccount.creditNoteNumber` | Direct | Credit note number. |
| `creditNoteDate` | `SellAccount.creditNoteDate` | Direct | Credit note date. |
| `releasedListingId` | `SellAccount.releasedListingId` | Direct | Historical listing released after cancellation. |
| `createdById` | `SellAccount.createdById` | Direct / Restricted | Audit actor ID. |
| `updatedById` | `SellAccount.updatedById` | Direct / Restricted | Audit actor ID. |
| `createdAt` | `SellAccount.createdAt` | Direct | Creation timestamp. |
| `updatedAt` | `SellAccount.updatedAt` | Direct | Last update timestamp. |
| `deletedAt` | `SellAccount.deletedAt` | Direct | Soft-delete marker; normal AI reads exclude non-null rows. |

## Connected field sources

| Data group | Database table and fields | Join to deal | Authority |
|---|---|---|---|
| Listing/inventory | `Listing.id`, `title`, `partnerId`, `categoryId`, `brandId`, `modelId`, `price`, `manufacturingYear`, `locationState`, `locationCity`, `status`, `soldAt`, `registrationNumberKey`, `chassisNumberKey`, `media` | `SellAccount.listingId = Listing.id` | Listing is authoritative for current marketplace state; SellAccount snapshots are authoritative for deal-time values. |
| Sale record | `SaleRecord.listingId`, `buyerName`, `buyerPhone`, `soldPrice`, `soldAt`, `invoiceNo` | `SaleRecord.listingId = Listing.id` | Legacy/listing sale view; reconcile with SellAccount invoice/sale fields. |
| Website payment | `ListingPaymentSubmission.id`, `listingId`, `buyerId`, `partnerId`, `status`, `amount`, `transactionRef`, `receiptUrl` | `SellAccountPayment.listingPaymentId = ListingPaymentSubmission.id` when attached | Avoid double-counting a website advance and its converted receipt. |
| Customer/CRM | `Lead.id`, `customerId`, `listingId`, `wonSellAccountId`, status, activities, follow-ups | Prefer `Lead.wonSellAccountId = SellAccount.id`; listing link is secondary | Customer ID is verified only through this explicit link. |
| Partner | `Listing.partnerId = User.id`; `PartnerProfile.userId = User.id`; partner code/business name in `PartnerProfile` | Through `SellAccount.listingId` | Partner identity comes from the listing owner, not seller name text. |
| Purchaser profile | `User.id`, `name`, `mobile`, `whatsappNumber`, `email`, `city`, `state`; `CrmContactProfile.userId` | Only through verified Lead/payment/user link | Current SellAccount purchaser fields remain snapshots. |
| Customer payments | `SellAccountPayment` all fields, including `side`, `amount`, `paymentDate`, `method`, `reference`, `drawnOn`, `receiptStatus`, `receiptNumber`, `receiptDelivery` | `sellAccountId` required FK | Payment status rules exclude drafts/cancelled receipts from received totals. |
| Refunds | `SellAccountRefund` all fields, including maker/checker actor IDs and paid/rejected timestamps | `sellAccountId` required FK | Paid refunds affect current balance; requested/rejected rows remain history. |
| RTO | `VehicleRtoRecord` compliance/status fields; `VehicleRtoStatusLog`; `RtoTransferTask.documents` | `VehicleRtoRecord.sellAccountId = SellAccount.id` | SellAccount-linked RTO is authoritative; listing-only RTO is context only. |
| Deeds/KYC | `SellAccountDeedWorkflow` side/status/signing metadata; `SellAccount.documents` JSON | `sellAccountId` required FK or direct JSON | Return metadata and secure file action, never raw link tokens/provider secrets. |
| Finance vouchers | `FinVoucher.sellAccountId`, `sourceType`, `sourceId`, totals/status; `FinVoucherLine.sellAccountId`, debit/credit/account | Identifier-based string link | Validate target deal; report orphaned rows and reconcile debit/credit. |
| Finance documents | `FinDocument.sellAccountId`, `number`, `docType`, `status`, taxes, total; `FinDocumentLine.sellAccountId` | Identifier-based string link | Reconcile invoice/credit note and avoid duplicate document counts. |
| Finance deal extension | `FinVehicleDealExt.sellAccountId`, deal mode, consignor/broker/partner party IDs and amounts | Unique identifier-based link | Financial terms source; party IDs require FinParty resolution. |
| Receivables/write-offs | `FinPaymentSchedule.sellAccountId`; `FinWriteOff.sellAccountId`, amount, reason, voucherId | Identifier-based string link | Include only after validating the deal link and status. |
| Communications | `SellAccount.invoiceDelivery`, `SellAccountPayment.receiptDelivery`, WhatsApp/SMS message logs/outbox | Related entity type/id | Delivery audit must be per deal/document/channel and state whether queued, sent, failed or duplicate. |

## Phase 2 gap summary

The repository has complete database sources and join candidates. Aggregate tools remain intentionally bounded, while the canonical `sold.vehicle.search` resolver now resolves safe candidates and `sold.vehicle.detail` returns the permissioned exact-deal contract for a verified deal key. A field remains **mapped** rather than **verified** until representative live/staging values are compared.
