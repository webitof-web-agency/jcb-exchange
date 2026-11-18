# AI Progress - Sold Vehicles

**Audit status:** Phases 1-10 local runtime/documentation gates completed for the repository scope; Phase 10 production verification remains incomplete only for authenticated browser and live provider gates.
**Updated:** 2026-11-18

## Phase 1 - Project discovery

- Admin and employee Sold Vehicles routes, pages, APIs, Prisma entities, connected CRM/RTO/Finance/Listing/Document/Communication surfaces and existing AI tools are inventoried.
- Persistent discovery files are present: inventory, registry, coverage matrix, relationships, issues, progress and test results.
- The registry is machine-readable and now includes the canonical sold-vehicle search and detail tools.

## Phase 2 - Coverage and relationship mapping

- Direct SellAccount field-to-source mapping, deal/listing/vehicle/customer/partner identity rules, relationship graph and question-to-tool mapping are documented.
- `sold.vehicle.search` is implemented as a read-only canonical resolver for query, record, listing, invoice, registration and chassis identifiers.
- Search normalizes formatted vehicle/chassis identifiers and returns safe candidates with `exact`/`ambiguous` state. It never selects a full record when multiple candidates match.
- `sold.vehicle.detail` is the exact-record handoff after a verified `dealId` or `recordNumber`.

## Phase 3 - Exact Sold Vehicle data layer

- `sold.vehicle.detail` joins deal fields, buyer/seller/owner/broker snapshots, vehicle/listing/sale record, payments, refunds, status history, deed metadata, RTO/tasks/status logs, CRM won-lead links and Finance voucher/document/deal-extension/schedule/write-off rows.
- Missing relations produce `null`, `missingFields` and `relationshipWarnings`; no guessed values are returned.
- Authenticated portal file actions cover invoice PDF, vehicle-details PDF, vehicle-document ZIP and issued customer money-receipt PDFs. Raw private URLs, provider secrets, hashes and ciphertext are excluded from the AI contract.
- Exact record routing and short selected-deal follow-ups preserve the selected identifier.
- Sold Vehicle list, detail and edit routes now send the selected record ID to AI page context; generic questions on an open deal resolve to `sold.vehicle.detail`.

## Phase 4 - AI router, context and response validation

- English, Hindi/Devanagari and Hinglish requests continue through the existing allow-listed router; contextual pronouns and `aur/also` follow-ups now prefer the previously selected read-only entity when appropriate.
- Assistant tool selector arguments are persisted in `AiConversationMessage.toolArguments` for owned conversations. The public conversation-history response omits this internal context; the router receives it only for the next turn.
- Empty tool results remain explicit (`status: empty`, `dataAvailability: UNAVAILABLE`) and now use a deterministic database-only answer path; the external provider is not called for an empty result.
- Data-source failures remain explicit (`data_unavailable`) and do not become zero values, completed actions or invented facts.
- Tool contracts and final answer envelopes are validated at the controller boundary. Inconsistent calculations/data availability states fail closed with `AI_RESPONSE_INVALID`.
- Unmatched operational/data questions that need a module record are blocked from provider answering without a verified read-only source and receive a localized clarification instead.

## Phase 4 validation completed

- Router/context/response validation targeted suite - 122/122 tests passed.
- `npm run test:ai:phase7` - 13/13 subtests passed.
- `npm run typecheck` - passed.
- `npx prisma validate` - passed; migration `20261118_0001_ai_conversation_tool_context` is ready for deployment.

## Phase 5 - Financial reconciliation

- Added the canonical `reconcileSoldVehicleFinancials` read-only service and wired it into `sold.vehicle.detail`.
- Purchase, sale, expenses, GST, margin, profit/loss and cash-vs-exchange values use the shared Finance Hub/Sold Vehicles calculation rules.
- Customer and seller balances distinguish real, draft and cancelled payment rows; paid refunds and forfeits are explicit.
- Payment IDs and stable legacy fingerprints prevent duplicate counting while retaining ignored-row evidence.
- Stored source fields are compared with calculated values and reported as `RECONCILED`, `MISMATCH` or `INCOMPLETE`; no mismatch is silently hidden.
- Exact-detail tool description now advertises the reconciliation contract so the router/provider does not treat drafts as settled money.

## Phase 5 validation completed

- Sold Vehicle detail + reconciliation suite - 5/5 tests passed.
- Selected router, conversation, tool registry and response-validation suite - 107/107 tests passed.
- `npm run test:ai:phase7` - 13/13 tests passed.
- Full backend suite at the historical Phase 5 checkpoint - 1070 passed, 4 date-fixture failures; the fixtures were later made date-relative and the current full suite is green at 1094/1094.

## Phase 6 - Audit and operational data

- Added the exact `auditOperationalData` projection to `sold.vehicle.detail`.
- Status history includes old/new status, reason, actor ID/name/email/role when available, and timestamp.
- Added persisted `SellAccountLockHistory` with lock writes from Sold Vehicle completion and the linked RTO lock path. Legacy locked rows are labelled as a current-record snapshot; no historical event is invented.
- Refund audit includes maker/checker/requested, approved, rejected and paid actors/timestamps, plus amount, method, reference, drawn-on bank and notes.
- Bank/drawn-on data is exposed for payment and refund rows with payment status and receipt state.
- Internal deal, transfer, RTO, Finance and sale notes are grouped with their source; status/refund reasons remain traceable.
- WhatsApp and SMS logs are joined by the verified `SELL_ACCOUNT` and `SELL_ACCOUNT_PAYMENT` entity keys, including outbox attempts, provider status, delivery/read timestamps and errors.
- Website/listing advances are mapped to their canonical `SellAccountPayment.listingPaymentId` receipt and unmatched submissions/receipts are reported instead of double-counted.
- The operational projection returns warnings for missing actors and unresolved bridges; it never fills gaps with guesses.

## Phase 6 validation completed

- Operational projection unit suite - 3/3 tests passed.
- Sold Vehicle detail + operational audit suite - 6/6 tests passed.
- Prisma schema/client validation and TypeScript validation passed after the lock-history migration was added.

## Phase 7 - Connected modules wiring

- Added `connectedModules` to `sold.vehicle.detail` as the canonical cross-module read projection.
- Listings/Inventory uses `SellAccount.listingId = Listing.id`; category, brand, model, sale record, media and website advances remain listing-scoped.
- CRM/Customer uses `Lead.wonSellAccountId = SellAccount.id`; customer, dealer, owner and CRM follow-ups are included only from the exact won lead.
- Partners/Dealers uses `Listing.partnerId = User.id` and exact CRM `Lead.dealerId = User.id`; partner profile data remains attached to that user.
- RTO Work uses `VehicleRtoRecord.sellAccountId = SellAccount.id`; transfer tasks and task documents use `RtoTransferTask.rtoRecordId`.
- Finance Hub uses each finance row's `sellAccountId`; Finance Party links are read through the exact `linkType/linkId` keys.
- Accounting/Tally uses verified `FinVoucher`/`FinDocument` rows and their `SELL_ACCOUNT` source key. Tally is an export derived from these rows, not a fabricated separate database relation.
- Tasks are represented only through exact RTO transfer-task and CRM follow-up keys; no generic Sold Vehicle task relation is invented because no such Prisma entity exists.
- Vehicle documents, website advances and WhatsApp/SMS logs are carried through their verified deal/listing/RTO/payment keys.
- Duplicate IDs, wrong deal/listing/RTO/communication keys and mismatched nested party records are excluded and reported in `integrity`/`warnings`.

## Phase 7 validation completed

- Connected-module projection: 2/2 tests passed.
- Exact detail plus connected-module wiring: 5/5 targeted tests passed.
- Phase 6 migration status: database is up to date; migrations `20261118_0001_ai_conversation_tool_context` and `20261118_0002_sold_account_lock_history` applied.
- TypeScript validation passed after the Phase 7 integration.

## Phase 8 - Documents and file delivery

- Added exact Sold Vehicle document actions for generated invoice/Bill of Supply, issued money receipts, paid refund advice, credit note and completed-deal delivery challan.
- Added source-backed delivery-challan PDF generation; it is explicitly a handover document and is not labelled as a tax invoice.
- Added exact stored-file actions for purchase/sale deeds, Aadhaar/PAN/GST KYC files, RTO task documents, vehicle media and website advance receipt proofs.
- Existing vehicle-doc preview/download/ZIP routes are now reachable from the exact Sold Vehicle document projection through allow-listed authenticated portal actions.
- Draft, cancelled, unpaid, missing and malformed document sources do not create AI download actions; duplicate actions are removed.
- Confirmed the communication contract: WhatsApp uploads the same generated receipt/invoice PDF as a `DOCUMENT` attachment; SMS sends the configured link because SMS does not carry a binary document attachment.

## Phase 8 validation completed

- Phase 8 document action, route allowlist, vehicle-doc checklist and PDF renderer suite - 19/19 tests passed.
- `npm run typecheck` - passed.
- WhatsApp Sold Vehicle rules are configured and approved in the configured database. Sold Vehicle SMS invoice/receipt rules are still disabled and have no DLT message IDs; the validator and admin UI now expose this exact gap instead of treating it as ready.
- Selected Sold Vehicle party follow-ups now route to exact detail; authorized portal-only operational data shows seller/buyer/owner names and contact fields without the old aggregate masking, while credentials and provider secrets remain protected.
- External provider delivery and authenticated portal download smoke tests remain deployment gates after the DLT configuration is completed.

## Phase 9 - Questions, analytics and predictions

- Added the dedicated source-backed `sold.vehicle.analytics` read-only tool and `PHASE_9_INTELLIGENCE.md` contract.
- Added exact deal/record analytics for profit/loss, GST, margin, payments/outstanding, seller payout, refunds, RTO delay, document status, collection risk, low-margin deals, model performance, previous-period comparison and operational suggestions.
- Added revenue and cash-flow forecasting with historical/forecast date ranges, assumptions, method, confidence and limitations. Insufficient history is explicit; no future value is guessed.
- Added Hindi, English and Hinglish metric routing while preserving generic Sold Vehicle search, detail, summary and forecast routes.
- Exact older deals bypass the default period filter only when an exact deal identifier is supplied; period totals remain date-bounded.
- Invalid dates and reversed date ranges fail closed. No Prisma schema change or migration is required for Phase 9.

## Phase 9 validation completed

- Sold Vehicle analytics/forecast suite - 3/3 tests passed.
- Router regression suite - 64/64 tests passed.
- Read-only tool registry/permission/validation suite with Phase 9 coverage - 36/36 tests passed.
- `npm run typecheck` - passed.

## Validation completed

- `npm run typecheck` - passed.
- `npm run test:ai:phase7` - 13/13 subtests passed.
- Sold Vehicle detail, search and router tests - passed.
- `MODULE_REGISTRY.json` parses successfully and lists the search tool.

## External verification still required before status becomes `verified`

- Compare additional representative live/staging database values against the read model; the configured database sample comparison is complete.
- Verify portal preview/download actions with authenticated browser/API flows.
- Configure the two Sold Vehicle SMS DLT rules with approved message IDs and exact variable order, then verify provider callbacks/live delivery rows and authenticated portal file actions. A separate cross-deal delivery export remains a later reporting scope, not a gap in the exact detail contract.

## Persistent documents

- `docs/ai/PROJECT_INVENTORY.md`
- `docs/ai/MODULE_REGISTRY.json`
- `docs/ai/AI_MODULE_REGISTRY.md`
- `docs/ai/AI_COVERAGE_MATRIX.md`
- `docs/ai/MODULE_RELATIONSHIPS.md`
- `docs/ai/AI_ISSUES.md`
- `docs/ai/AI_PROGRESS.md`
- `docs/ai/AI_TEST_RESULTS.md`
- `docs/ai/PHASE_2_FIELD_SOURCE_MAP.md`
- `docs/ai/AI_QUESTION_TOOL_MAP.md`
- `docs/ai/PHASE_3_SOLD_VEHICLE_DETAIL.md`
- `docs/ai/PHASE_5_FINANCIAL_RECONCILIATION.md`
- `docs/ai/PHASE_6_AUDIT_OPERATIONAL_DATA.md`
- `docs/ai/PHASE_7_CONNECTED_MODULES.md`
- `docs/ai/PHASE_8_DOCUMENT_DELIVERY.md`
- `docs/ai/PHASE_9_INTELLIGENCE.md`
- `docs/ai/PHASE_10_VALIDATION_REPORT.md`
