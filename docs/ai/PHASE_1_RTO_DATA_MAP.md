# JCB Exchange AI - Phase 1 RTO Work Data Map

**Status:** completed as a source-code/schema map on 2026-11-19
**Scope:** RTO Work, ownership-transfer tasks, Vehicle Docs, Sold Vehicles,
Listings, RC/compliance, CRM, Finance and document delivery relationships.
**Database safety:** read-only audit; no migration, seed, update, delete or live
database write was run.

## 1. Canonical RTO identity

`VehicleRtoRecord.id` is the internal RTO identity. It must be used for joins,
but never shown as the normal user-facing identifier. The operator-facing lookup
keys are:

- registration/vehicle number;
- chassis number through the linked Sold Vehicle, Listing or RC verification;
- Sold Vehicle record number;
- customer, seller, purchaser or agent name;
- RTO office;
- linked listing title; and
- invoice number when the RTO record is connected to a Sold Vehicle.

Search text is not proof of identity. The AI must resolve one exact record before
answering detailed questions. Multiple matches must produce a disambiguation
answer instead of merging records.

## 2. Direct VehicleRtoRecord fields

| Business field | Prisma source | Type/meaning | Authority or presentation rule |
|---|---|---|---|
| RTO record | `VehicleRtoRecord.id` | Internal UUID | Join-only; do not present as a normal business ID. |
| Listing link | `VehicleRtoRecord.listingId` | Nullable Listing bridge | Verified context; not proof of a Sold Vehicle handoff. |
| Sold Vehicle link | `VehicleRtoRecord.sellAccountId` | Nullable unique bridge | Authoritative RTO handoff for a Sold Vehicle. |
| Customer name/number | `customerName`, `customerNumber` | RTO snapshot | Show to authorized operators as operational data. |
| Registration number | `vehicleNumber` | RTO vehicle identity | Show to authorized operators; normalize formatting for search/display. |
| Brand | `brandName` | Vehicle snapshot | Prefer saved RTO value, then linked sale/listing fallback. |
| Vehicle type | `vehicleType` | Category/type snapshot | Prefer saved RTO value, then linked sale/listing fallback. |
| Vehicle model | `vehicleModel` | Model snapshot | Prefer saved RTO value, then linked sale/listing fallback. |
| Hire purchase | `hirePurchaseStatus` | Loan/hypothecation enum | Explain status in plain language. |
| Financer | `financerName` | Financer snapshot | Show when present and permitted. |
| Road tax | `taxStatus`, `taxValidUntil` | Validity and date | Date is meaningful when status is `VALID`; explain other statuses. |
| Fitness | `fitnessStatus`, `fitnessValidUntil` | Validity and date | Optional for some vehicles but still report its state. |
| Insurance | `insuranceStatus`, `insuranceValidUntil` | Validity and date | Transfer blocker when expired according to compliance rules. |
| PUC | `pucStatus`, `pucValidUntil` | Validity and date | Transfer blocker when expired according to compliance rules. |
| HSRP | `hsrpStatus`, `hsrpNumber` | Plate state and number | Report fitted/not fitted/not required/pending. |
| Seller | `sellerName`, `sellerNumber` | Seller snapshot | Show to authorized operators. |
| Purchaser | `purchaserName`, `purchaserNumber` | Buyer snapshot | Show to authorized operators. |
| RTO office | `rtoOffice` | Registering office | Core workflow field. |
| RTO agent | `rtoAgentName`, `rtoAgentState`, `rtoAgentCity`, `rtoAgentNumber` | Agent assignment/contact | Show operational contact details to authorized operators. |
| RTO expense | `rtoExpenses` | Total RTO fee/expense | Format in INR. |
| Advance | `rtoExpensesAdvance` | Amount already paid | Format in INR. |
| Balance | Derived from total minus advance | Current RTO amount due | Never use a stale UI value when a fresh calculation is possible. |
| Documents sent | `documentSendDate` | Handover/send date | Report as recorded; do not infer from task upload date. |
| Workflow status | `rtoStatus` | RTO pipeline state | Normalize legacy statuses through `rtoStatus` service. |
| Lock state | `isLocked`, `lockedAt`, `lockedById` | Edit/finalization state | Show state; resolve actor name only with audit permission. |
| Notes | `noteSheet` | Internal RTO note | Permissioned operational note; source-label it. |
| Maintenance | `vehicleMaintenanceCost` | Vehicle maintenance expense | Include in RTO/deal financial context. |
| Hour running | `hourRunning` | Optional machine usage | Report only when stored; do not invent for vehicles. |
| Compliance snapshot | `complianceSnapshot` | Stored readiness result | Snapshot, not a fresh RC lookup. Include checked time/source. |
| Compliance checked at | `complianceCheckedAt` | Last readiness check time | Show freshness in human-readable date/time. |
| Created/updated | `createdAt`, `updatedAt` | Record timestamps | Use for timeline/freshness, not as transfer dates. |

## 3. RTO workflow statuses

The AI must understand both current and legacy values:

- `RTO_WORK_STARTED`: work started, checklist may still be untouched;
- `RTO_WORK_IN_PROGRESS`: at least one task moved forward but transfer is not complete;
- `RTO_WORK_FAILED`: an issue was reported or a transfer blocker exists;
- `RTO_WORK_COMPLETED`: every configured transfer task is complete or not required;
- `DEAL_DONE`: sale completed, invoice flow completed and records locked.

Legacy values are normalized by the backend. The AI must not expose legacy enum
names when a clear human label is available.

## 4. Ownership-transfer task data

The configured tasks are:

1. RC Transfer - mandatory
2. Insurance Transfer - mandatory
3. NOC / Hypothecation Clearance - mandatory
4. PUC Certificate - mandatory
5. HSRP Plate - optional
6. Road Tax - mandatory
7. Fitness Certificate - optional

Every `RtoTransferTask` includes:

- task key and display label;
- mandatory/optional flag;
- current status;
- task remark;
- uploaded proof-document metadata;
- last update time and updating user;
- ordered status logs;
- previous status, next status and change remark.

Task statuses are `PENDING`, `DOCUMENT_EXPIRED`, `RENEWAL_IN_PROGRESS`,
`TRANSFER_INITIATED`, `ISSUE_REPORTED`, `TRANSFERRED` and `NOT_REQUIRED`.

Completion means `TRANSFERRED` or `NOT_REQUIRED`. The AI must report both the
numeric progress and the exact pending task labels. It must not treat an
uploaded file alone as task completion.

## 5. Compliance and RC data

Compliance can be sourced from:

- saved RTO record data (`RECORD`);
- RC verification already attached to the Listing (`LISTING_VERIFICATION`); or
- a fresh RC lookup (`RC_API`).

The compliance projection covers:

- road-tax validity;
- insurance validity;
- PUC validity;
- fitness validity;
- hypothecation/loan and financer;
- RC status, including non-active status;
- blacklist status;
- registration validity;
- non-use declaration;
- pending challan count;
- inter-state seller/purchaser movement;
- HSRP state;
- blocking issues, warnings and successful checks;
- suggested saved-field updates from authoritative RC dates; and
- expired task keys.

Every finding must contain a level (`OK`, `WARN` or `BLOCK`), a reason and the
recommended next action. A compliance snapshot must never be presented as a
new live RC lookup.

## 6. Sold Vehicle relationship

Authoritative join:

```text
VehicleRtoRecord.sellAccountId -> SellAccount.id
SellAccount.rtoRecord -> VehicleRtoRecord
```

From the linked Sold Vehicle, the RTO dossier can include:

- record number and deal status;
- listing title and vehicle/chassis snapshots;
- seller, purchaser, owner and broker details;
- purchase, sale and exchange terms;
- total expenses and expense breakdown;
- GST, margin and net-profit calculations;
- purchaser receipts and seller payments;
- customer balance and seller payable;
- refunds, forfeits and credit notes;
- invoice number, generation and delivery status;
- draft/cancelled/locked/completed state;
- deed workflow status;
- status and lock history;
- WhatsApp/SMS delivery audit; and
- finance/accounting reconciliation.

Payment totals must use receipt/refund status rules. Draft or cancelled payment
rows must never be reported as received money.

## 7. Listing and vehicle-identity relationship

`VehicleRtoRecord.listingId -> Listing.id` is a context bridge. Listing data can
provide:

- title, category, brand and model;
- registration, chassis and engine identity;
- manufacturing year and operating hours;
- owner and location;
- partner/source;
- listing and sale status;
- media/photos/videos;
- vehicle verification result; and
- approved website payment proofs.

The RTO table itself does not contain chassis or engine fields. The AI must state
the exact source of those values: Sold Vehicle snapshot, Listing or RC
verification. It must not silently combine values from unrelated vehicles.

## 8. Vehicle Docs and file sources

The vehicle document aggregator can collect files from:

- `SellAccount.documents` purchase/sale/KYC slots;
- generated Bill of Supply/invoice;
- issued customer money receipts;
- paid refund advice;
- credit note;
- completed delivery challan;
- RTO transfer-task documents;
- Listing media images and videos;
- approved website payment proof; and
- Finance Vault documents.

RTO task files are attached by task/document identity and include filename, MIME
type, size and upload date. The AI response should expose availability and an
authorized `Open`/`Preview`/`Download` action, not a raw storage URL.

Eligibility rules:

- missing files produce no download action;
- malformed file metadata produces a clear unavailable-file reason;
- draft/unpaid/cancelled financial records do not produce final-document actions;
- duplicate document actions are collapsed only when the source is identical;
- access is checked again when the action is executed.

## 9. CRM and Finance connections

CRM data is included only through a verified relationship, such as a won Lead
linked to the Sold Vehicle. Relevant data includes customer/dealer/owner link,
activities, follow-ups, overdue/missed state and responsible staff.

Finance data is linked through validated `sellAccountId` or the canonical source
key and can include:

- vouchers and voucher lines;
- finance documents and document lines;
- vehicle-deal extension;
- payment schedules;
- write-offs;
- party links; and
- Tally/export source references.

Orphaned finance rows must be reported as unmatched. They must not be attached to
an RTO record by name, vehicle number or amount alone.

## 10. Permissions and protected fields

Operational details may be shown when the authenticated operator has the
corresponding permission:

- vehicle number;
- names;
- mobile numbers;
- RTO office and agent;
- seller/purchaser details;
- expenses/payments;
- compliance findings; and
- document availability/actions.

The following remain protected even when the user asks for everything:

- Aadhaar, PAN, GSTIN and other government identity numbers;
- bank account, IFSC, UPI and transaction secrets;
- passwords, API keys, access/refresh tokens and credential material;
- invoice/receipt token hashes and ciphertext;
- raw private/signed storage URLs;
- internal UUID/database identifiers when a business identifier exists.

The provider must receive only a safe projection. The authenticated portal can
execute a separately authorized file action without sending the private URL to
the model.

## 11. Current AI coverage and Phase 1 findings

Existing tools cover bounded parts of this map:

- `rto.pending.tasks`: pending task counts and limited task rows;
- `rto.documents.summary`: period/status/document-readiness summary;
- `rto.copilot`: limited blocker and readiness review;
- `vehicle.documents.detail`: exact vehicle document view;
- `sold.vehicle.detail`: exact Sold Vehicle with connected RTO data;
- `sold.vehicle.analytics`: RTO delay and document-readiness analytics;
- `ai.documents.search`: bounded document discovery.

Current gaps for Phase 2 implementation:

- no single RTO-first complete dossier tool;
- aggregate RTO tools do not return every authorized party/task/document field;
- RTO-specific document actions need one exact verified RTO/deal handoff;
- due date, task assignee, RTO application/case number, acknowledgement number,
  appointment date and official fee-receipt number are not fields in the current
  RTO schema;
- challan data is currently represented by compliance findings/counts rather
  than a complete challan ledger;
- blank fields, missing records, permission denial and provider failure need
  distinct human-readable answer states.

## 12. Phase 1 acceptance checklist

- [x] Every direct `VehicleRtoRecord` field is mapped.
- [x] RTO statuses and legacy normalization are recorded.
- [x] All seven transfer tasks and completion rules are recorded.
- [x] Compliance sources and finding types are recorded.
- [x] Sold Vehicle, Listing and Vehicle Docs joins are recorded.
- [x] CRM, Finance, payment and communication edges are recorded.
- [x] Document source families and eligibility rules are recorded.
- [x] Business-operational exposure and protected-field rules are recorded.
- [x] Current AI tools and exact Phase 2 gaps are recorded.
- [ ] Representative live/staging values must be compared during Phase 2 before
  claiming production data completeness.

## Evidence files

- `backend/prisma/schema.prisma`
- `backend/src/controllers/rto.controller.ts`
- `backend/src/services/rtoTransfer.service.ts`
- `backend/src/services/rtoTransferTasks.ts`
- `backend/src/services/rtoCompliance.ts`
- `backend/src/services/rtoRecordSerializer.ts`
- `backend/src/services/vehicleDocs.service.ts`
- `backend/src/services/ai/aiReadOnlyTools.service.ts`
- `backend/src/services/ai/aiFieldSecurity.service.ts`
- `backend/src/services/ai/soldVehicleDetailAi.service.ts`
- `backend/src/routes/recruitment.routes.ts`
