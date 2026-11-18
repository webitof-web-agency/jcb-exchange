# AI Issues and Root Causes - Sold Vehicles

**Audit scope:** Phases 1-10  
**Audit date:** 2026-11-18

## Resolved by the Phase 2/3 implementation

| ID | Original issue | Current disposition |
|---|---|---|
| SV-AI-001 | No unified exact Sold Vehicle detail tool | Resolved by `sold.vehicle.detail`; exact deal ID/record number only. |
| SV-AI-002 | Aggregate response masked identity/party fields | Resolved for the authorized exact-detail boundary; secrets and private file locators remain excluded. |
| SV-AI-003 | Payments and seller payout were aggregate-only | Resolved in the exact detail read model with payment rows, side totals and balances. |
| SV-AI-004 | Refunds were aggregate-only | Resolved in the exact detail read model with status, maker-checker timestamps and paid/pending totals. |
| SV-AI-005 | RTO was not guaranteed to join the selected deal | Resolved with exact `sellAccountId` RTO join and relationship warnings. |
| SV-AI-006 | Finance links were not validated by a shared adapter | Resolved with deal-scoped Finance reads and mismatched-link warnings. |
| SV-AI-010 | Identifier follow-ups could lose deal context | Resolved for exact detail follow-ups; the selected exact arguments are preserved by the router. |
| SV-AI-017 | AI projections were aggregate and bounded | Resolved for exact Sold Vehicle detail; aggregate tools remain intentionally bounded. |
| SV-AI-018 | Cross-module follow-up context was not canonical | Resolved for the Sold Vehicle exact-detail flow by preserving `dealId`/`recordNumber`. |
| AI-ROUTER-001 | Page-selected deal/vehicle arguments were not persisted between chat turns | Resolved with owned-conversation `toolArguments` context; public history excludes the internal selector. |
| AI-ROUTER-002 | Empty tool results could still be sent to the provider for narrative generation | Resolved with deterministic local empty-result handling and explicit `UNAVAILABLE` contract. |
| AI-ROUTER-003 | Provider/tool response envelope had no final controller validation | Resolved with Zod contract and response-envelope validation; invalid states fail closed. |
| AI-ROUTER-004 | Unmatched operational questions could fall through to a generic provider answer | Resolved with grounded-data guard for module/entity questions. |
| SV-FIN-001 | Exact Sold Vehicle detail had no single reconciliation for stored values, GST/profit, balances, refunds and draft receipts | Resolved with `reconcileSoldVehicleFinancials`; stored-vs-calculated mismatches remain visible. |
| SV-FIN-002 | Payment rows could be double-counted when the same canonical payment appeared more than once | Resolved with payment-ID-first deduplication and ignored-row evidence. |
| SV-OPS-001 | Status/lock/refund/notes/communication operational data was not one exact-deal projection | Resolved with `auditOperationalData` in `sold.vehicle.detail`; unresolved actors and bridges are warnings, not guesses. |
| SV-OPS-002 | Lock state had no durable event history | Resolved for new lock events with `SellAccountLockHistory`; legacy current locks are exposed as labelled snapshots because historical events do not exist. |
| SV-OPS-003 | Listing advances could be counted again after sale conversion | Resolved by mapping through `SellAccountPayment.listingPaymentId` and reporting unmatched rows. |
| SV-CONNECT-001 | Connected modules could be mixed by listing, name or stale snapshot instead of the exact deal key | Resolved with `connectedModules`; every row is accepted only after a verified deal/listing/RTO/payment/lead key check. |
| SV-CONNECT-002 | Duplicate or mismatched Finance/CRM/RTO/communication rows could appear as connected data | Resolved with source-key filtering, deduplication and visible `integrity` counters/warnings. |

## Resolved by Phase 8 document delivery

| ID | Issue | Current disposition |
|---|---|---|
| SV-DOC-001 | Exact Sold Vehicle detail had no complete generated/stored document action set | Resolved with `buildSoldVehicleDocumentActions` for invoice, issued receipt, credit note, paid refund advice, delivery challan, deeds/KYC, RTO files, media and advance proofs. |
| SV-DOC-002 | File actions could be created from draft, cancelled, unpaid or missing source rows | Resolved with eligibility checks before action creation. |
| SV-DOC-003 | Document links were not centrally constrained | Resolved with internal route allowlists and rejection of external/javascript/unscoped URLs. |
| SV-DOC-004 | Delivery challan had no exact-deal generated PDF path | Resolved with completed-deal source-backed delivery-challan generator and route. |
| SV-DOC-005 | WhatsApp/SMS attachment semantics could be confused | Resolved: WhatsApp uses generated PDF `DOCUMENT`; SMS uses a link because binary attachments are not supported by SMS. |

## Resolved by Phase 9 intelligence

| ID | Issue | Current disposition |
|---|---|---|
| SV-AI-011 | Sold Vehicle-specific forecast feature set | Resolved with `sold.vehicle.analytics` forecast metric for source-backed revenue and cash flow, explicit assumptions/date ranges/confidence/limitations and an insufficient-data state. |
| SV-AI-013 | Sold Vehicle questions had no dedicated analytics contract | Resolved with metrics for financials, payments, refunds, RTO delay, documents, collection risk, low margin, model performance, period comparison and suggestions. |
| SV-AI-014 | Analytics routing could override generic search/detail/list requests | Resolved with explicit-signal routing and regression tests for existing routes. |
| SV-AI-015 | Exact older deals could disappear under the default period filter | Resolved: exact identifiers bypass the period filter while aggregate totals remain date-bounded. |
| SV-AI-016 | Previous-period comparison could be empty because only current rows were loaded | Resolved: the read model loads an equal-length comparison period separately. |

## Resolved during Phase 10 validation

| ID | Issue | Current disposition |
|---|---|---|
| SV-VAL-001 | Exact Sold Vehicle detail selected SMS delivery fields absent from `SmsMessageLog` schema | Resolved by schema-backed SMS projection and regression test. |
| SV-VAL-002 | Explicit Sold Vehicle document-pending questions could fall through to aggregate RTO documents | Resolved by explicit analytics routing and regression test. |
| SV-VAL-003 | Production validator compared analytics against non-canonical reconciliation field names | Resolved; live source/projection comparison now reports zero financial mismatches. |
| SV-VAL-004 | Sold Vehicle list/detail/edit page context did not carry the selected record into generic AI follow-ups; question catalog pointed Sold Vehicle detail questions to `listing.detail` | Resolved with route-aware `recordId` context, exact `sold.vehicle.detail` follow-up routing and catalog regression tests. |
| SV-VAL-005 | Configured database had Sold Vehicle SMS invoice and payment-receipt rules disabled with no DLT message IDs | Validator now fails closed with the exact missing event codes; admin UI warns until approved DLT IDs and exact variable order are saved. No ID was guessed or copied from another event. |
| SV-VAL-006 | Selected Sold Vehicle seller-name follow-up used the aggregate summary and reported masked/unavailable identity | Party-field follow-ups now resolve the selected exact deal, direct seller/buyer/owner answers use the authorized portal-only detail projection, and the raw operational detail panel is visible by default. Provider-safe snapshots still protect credentials and secrets. |

## Implemented search safety

`sold.vehicle.search` now resolves record, listing, invoice, registration, chassis and bounded text queries. It normalizes formatted identity values, returns safe candidate keys, reports `ambiguous: true` for multiple matches and never silently chooses a candidate for full detail.

## Deliberately open cross-module scope

| ID | Remaining issue | Status |
|---|---|---|
| SV-AI-007 | Full CRM activity/follow-up timeline across every linkage route | Next cross-module timeline scope; current exact won-lead/customer linkage is present. |
| SV-AI-008 | Every document kind as an exact-deal file action | Repository contract resolved in Phase 8; representative portal file E2E verification remains. |
| SV-AI-009 | Cross-deal/per-file WhatsApp/SMS delivery export beyond one verified deal | Exact-deal delivery audit is resolved in `auditOperationalData`; cross-deal reporting/export remains later scope. |
| SV-AI-012 | Unbounded complete export/pagination contract | Current AI tools intentionally use safe limits; export contract remains later scope. |

## Phase 4 boundary

The grounding guard applies to operational/entity questions. General explanatory questions may still use the configured provider; they are not presented as current database facts. Forecast answers remain estimates and are clearly labelled by the forecast tool.

## Phase 5 financial boundary

Financial totals are source-backed and formula-backed. Draft and cancelled receipts are returned as evidence but are never reported as settled money. If a stored `balanceAmount`, `netProfit` or `netProfitAfterGst` differs from the canonical calculation, AI must report the mismatch rather than silently choosing one value.

## Phase 6 operational boundary

`auditOperationalData` is source-backed. Missing actor records, missing historical lock events, missing communication rows and unresolved listing bridges are returned as explicit warnings. A current locked row is not evidence of the exact historical lock time unless the new lock-history row exists. No unlock event is fabricated because the current application has no approved unlock workflow.

Communication logs are joined only through verified `relatedEntityType`/`relatedEntityId` values for the deal or its payment rows. Provider payloads are available only to the extent they are stored in the operational log contract; secrets and credentials remain excluded.

## Phase 7 connected-module boundary

`connectedModules` does not infer a relationship from matching names, phone numbers, vehicle text or a listing alone. Tally is represented by its verified Finance source rows because no separate Tally transaction relation exists. The global Tasks page has no Sold Vehicle foreign key in the current schema, so only exact CRM follow-ups and RTO transfer tasks are returned.

## External verification gate

The implementation cannot be marked `verified` until representative live/staging database records are compared with the read model and authenticated portal file actions are exercised end-to-end. This is a test-environment dependency, not a missing runtime contract.

Phase 10 has now completed the representative configured-database comparison. Authenticated browser file smoke testing and approved live WhatsApp/SMS callback verification remain open.

## Security boundary

Raw authorized business fields may be returned only through the permissioned exact-detail tool. Passwords, API keys, provider tokens, OTPs, authentication material, encryption secrets, hashes, ciphertext and private document-link tokens must never be returned.
