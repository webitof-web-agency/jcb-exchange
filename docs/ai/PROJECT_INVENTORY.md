# JCB Exchange AI Project Inventory

**Phase:** 1 — Complete Project Discovery  
**Scope:** Sold Vehicles first, with verified connected modules  
**Audit date:** 2026-11-17  
**Audit mode:** Read-only static repository discovery; no database writes, migrations, seeds, deletes, or external provider calls were performed.

## Purpose

This file is the persistent discovery baseline for the Sold Vehicles AI integration. It records the pages, API surface, canonical domain services, Prisma entities, existing AI tools, connected modules, and known gaps discovered in the repository.

This is an implementation inventory, not a claim that every listed field is already available to AI. The coverage state is recorded separately in `AI_COVERAGE_MATRIX.md`.

## Repository baseline

| Area | Discovered baseline |
|---|---:|
| Backend route files | 38 files in current tree |
| Backend controller files | 51 files in current tree |
| Backend AI service files | 90 files in current tree |
| Prisma models | 191 in the existing Phase 0 inventory |
| Prisma enums | 151 in the existing Phase 0 inventory |
| Admin/employee page files | 160 in the existing Phase 0 inventory |
| Dedicated Sold Vehicles route pages | 8 (admin and employee list/new/detail/edit) |
| Dedicated Sold Vehicles UI components | 16 discovered under `components/accounts/sold-vehicle` |

The earlier repository-wide baseline is retained in `docs/AI_PHASE_0_MODULE_INVENTORY.md`. Counts can change as unrelated work lands; the module paths and data relationships below are the authoritative Phase 1 scope.

## Sold Vehicles portal pages

The same business surface is exposed for admin and employee portals:

| Portal | Page | Route |
|---|---|---|
| Employee | list | `/employee/accounts/sell-accounts` |
| Employee | new | `/employee/accounts/sell-accounts/new` |
| Employee | detail | `/employee/accounts/sell-accounts/[id]` |
| Employee | edit | `/employee/accounts/sell-accounts/[id]/edit` |
| Admin | list | `/admin/accounts/sell-accounts` |
| Admin | new | `/admin/accounts/sell-accounts/new` |
| Admin | detail | `/admin/accounts/sell-accounts/[id]` |
| Admin | edit | `/admin/accounts/sell-accounts/[id]/edit` |

### Verified list-page capabilities

- KPI cards: total deals, turnover, purchase cost, net profit, settled deals.
- Status filters: all, open, partial payment, full payment, RTO in progress/completed, deal done, cancelled.
- Vehicle-type filtering, search, table/grid views, pagination, export, copy plate number.
- Links to the connected RTO Work record.
- Invoice and credit-note presence indicators.
- Draft and locked deal indicators.
- Delete/cancel flow with connected-record impact handling.

### Verified detail/edit-page sections

- Vehicle and owner: registration, chassis, model, brand, category, RC owner, owner number, sale date.
- Purchase → broker → sale party chain: source type, seller, broker, purchaser, locations and contact fields.
- Financial breakdown: purchase, sale, exchange values, expense breakdown, margin basis, GST lines and final profit.
- Payment tracking: purchaser receipts, seller payments, draft/issued/cancelled receipt state, balances, method, date, reference and drawn-on entry.
- Customer invoice: invoice number, generated/sent state, delivery channels, invoice download and resend.
- Refunds/cancellation: request, approve, reject, pay, refund advice and cancellation credit note.
- Deeds and documents: purchase/sale deed, Aadhaar, PAN and GST certificate slots for both sides.
- RTO work: linked RTO record, task progress and navigation to RTO detail.
- Transfer details and remarks/note sheet.
- Lock/finalization state and edit restrictions.

## Backend API surface

The route is mounted at `/api/recruitment` and the sell-account router applies authentication plus admin/employee permission middleware.

### Sell Account endpoints

| Method | Endpoint | Capability | State |
|---|---|---|---|
| GET | `/recruitment/admin/sell-accounts` | list records | discovered |
| POST | `/recruitment/admin/sell-accounts` | create record | discovered |
| POST | `/recruitment/admin/sell-accounts/save-and-start-rto` | create and hand off to RTO | discovered |
| GET | `/recruitment/admin/sell-accounts/:id` | detail record | discovered |
| PUT | `/recruitment/admin/sell-accounts/:id` | update record | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/lock` | lock record | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/save-and-start-rto` | update and hand off | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/start-rto` | start RTO | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/complete` | complete sale | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/invoice/resend` | resend invoice | discovered |
| GET | `/recruitment/admin/sell-accounts/:id/invoice` | download invoice PDF | discovered |
| GET | `/recruitment/admin/sell-accounts/:id/delete-impact` | deletion impact | discovered |
| DELETE | `/recruitment/admin/sell-accounts/:id` | delete record | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/payments` | add payment | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/payments/:paymentId/receipt/resend` | resend receipt | discovered |
| DELETE | `/recruitment/admin/sell-accounts/:id/payments/:paymentId` | delete payment | discovered |
| GET | `/recruitment/admin/sell-accounts/:id/payments/:paymentId/receipt` | download money receipt PDF | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/payments/:paymentId/issue` | issue draft receipt | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/payments/:paymentId/cancel` | cancel receipt | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/cancel-sale` | cancel sale | discovered |
| GET | `/recruitment/admin/sell-accounts/:id/credit-note` | download credit note | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/refunds` | request refund | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/refunds/:refundId/approve` | approve refund | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/refunds/:refundId/reject` | reject refund | discovered |
| POST | `/recruitment/admin/sell-accounts/:id/refunds/:refundId/pay` | pay refund | discovered |
| GET | `/recruitment/admin/sell-accounts/:id/refunds/:refundId/advice` | download refund advice | discovered |

These endpoints are operational capabilities. Phase 1 AI integration remains read-only; mutation endpoints are not automatically exposed as AI tools.

## Canonical backend implementation surface

| Area | Source files |
|---|---|
| Controllers | `backend/src/controllers/sellAccount.controller.ts`, `backend/src/controllers/rto.controller.ts`, `backend/src/controllers/document.controller.ts` |
| Sell-account domain | `backend/src/services/sellAccount.service.ts`, `sellAccountLookup.ts`, `sellAccountFinance.ts`, `sellAccountRefund.service.ts` |
| RTO domain | `backend/src/services/rtoStatus.ts`, `rtoRecordSerializer.ts`, `rtoCompliance.ts`, `rtoTransfer.service.ts`, `rtoTransferTasks.ts`, `listingRto.service.ts` |
| Documents/PDFs | `backend/src/utils/vehicleSaleDocumentsPdf.ts`, `sellAccountVoucherPdf.ts`, `secureDocumentUrl.ts`, `backend/src/routes/document.routes.ts` |
| CRM connection | `backend/src/modules/crm/services/soldVehicleLink.ts` |
| Finance connection | `backend/src/modules/finance-hub`, `backend/src/services/ai/financeAiData.service.ts` |
| Messaging | `backend/src/services/vehicleSalePaymentReceiptWhatsAppTemplate.ts`, `smsIntegration.service.ts`, `whatsappIntegration.service.ts` |
| Frontend model/presentation | `admin-portal/src/components/accounts/sold-vehicle/soldVehicleModel.ts`, `SoldVehicleForm.tsx`, `SellAccountDocumentWidgets.tsx`, `SellAccountRefundsCard.tsx` |

## Primary Prisma entities

### Direct Sold Vehicle entities

- `SellAccount`
- `SellAccountPayment`
- `SellAccountRefund`
- `SellAccountStatusHistory`
- `SellAccountDeedWorkflow`
- `VehicleRtoRecord`
- `VehicleRtoStatusLog`
- `RtoTransferTask`

### Marketplace and sale entities

- `Listing`
- `SaleRecord`
- `ListingPaymentSubmission`
- `ListingBill`
- `Media`
- `ListingVehicleVerification`

### CRM and party entities

- `Lead`, `LeadActivity`
- `CrmContactProfile`, `CrmContactActivity`, `CrmFollowUp`, `CrmPipelineStage`
- `User`, `PartnerProfile`

### Finance entities linked by identifier or business flow

- `FinVoucher`, `FinVoucherLine`
- `FinDocument`, `FinDocumentLine`
- `FinVehicleDealExt`
- `FinPartnerSettlement`
- `FinPaymentSchedule`, `FinFollowUp`, `FinWriteOff`
- finance accounts, parties, bank accounts and transactions

## Existing AI surface

### Sold/finance tools discovered

- `sold.vehicles` — bounded sold Listing/SaleRecord summary.
- `sell.accounts.summary` — SellAccount counts, statuses, lock/draft state and aggregate amounts.
- `margin.summary` — aggregate purchase, sale, expense, profit and margin.
- `payment.summary` — aggregate sale receipts and listing payment submissions.
- `refund.summary` — aggregate refund states, reasons and amounts.
- `invoice.summary` — finance documents, listing bills and SellAccount invoice count.
- `finance.hub.page` — page-level finance adapter.
- `vehicle-sale-invoices` finance page adapter — invoice records and existing PDF actions.
- `rto.pending.tasks`, `rto.documents.summary`, `rto.copilot` — RTO summaries and readiness.
- `listing.detail`, `listing.search`, `vehicle.identity`, `vehicle.documents.detail` — related listing/vehicle tools.
- `crm.lead.detail`, `crm.won.customers.summary`, `crm.followups` — related CRM tools.
- `partner.performance`, `partner.copilot` — partner/dealer context.
- `forecast.operations` — general operational forecast entry point.
- `sold.vehicle.analytics` — Sold Vehicle-specific financial, operational, comparison, forecast and suggestion read model (`backend/src/services/ai/soldVehicleAnalytics.service.ts`).
- `ai.documents.search` — document search entry point.
- `sold.vehicle.search`, `sold.vehicle.detail` — Phase 2/3 canonical Sold Vehicle resolver and exact joined read model.

### Current routing behavior

- A generic Sold Vehicles page read question routes to `sell.accounts.summary` with `allRecords: true`; identifier-bearing questions route to the canonical Sold Vehicle search/detail flow. Detail/edit page context now carries the selected record ID so generic questions resolve to `sold.vehicle.detail`.
- Generic “sold vehicles” questions route to `sold.vehicles`.
- Generic invoice, payment, margin and refund questions route to aggregate tools.
- `listing.detail` remains the related listing tool; exact Sold Vehicle questions use `sold.vehicle.search` then `sold.vehicle.detail`.

## Phase 1 boundary

Phase 1 records what exists and what is connected. The Phase 2/3 artifacts now implement the canonical exact Sold Vehicle read path; analytics, delivery-audit and extended timeline contracts remain separate later scope.

## Safety and data exposure boundary

The requirement “nothing masked” is implemented for the selected Sold Vehicle operator view: authorized seller/buyer/owner operational fields are returned from the exact detail projection and narrow party questions answer from that portal-only data. Aggregate summaries remain bounded. Credentials, passwords, API keys, OTPs, auth tokens, private document-link tokens, encryption material and provider secrets must never be exposed to AI or chat; provider-safe model snapshots remain redacted while authorized raw operational details stay portal-only.
