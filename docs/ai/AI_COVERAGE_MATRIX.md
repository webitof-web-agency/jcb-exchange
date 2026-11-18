# AI Coverage Matrix — Sold Vehicles

**Phase:** 10 full regression, relationship mapping, grounded response validation, financial reconciliation, operational audit, connected-module data, document delivery and intelligence  
**Audit date:** 2026-11-18  
**Statuses:** `present` = source/UI exists; `mapped` = database source and relationship are documented; `partial` = AI can answer only a bounded/aggregate form; `pending` = required exact integration is not complete; `verified_sample` = configured database comparison and local regression passed; `verified` = production database, browser-file and provider delivery evidence passed.

## Page and workflow coverage

| Area | UI/source present | Existing AI source | Current state | Required completion |
|---|---|---|---|---|
| Sold Vehicles list | yes | `sell.accounts.summary`, `sold.vehicles`, `sold.vehicle.search` | implemented, configured sample verified | exact filters, pagination and production comparison |
| New Sold Vehicle | yes | page-aware `sell.accounts.summary`; saved records use `sold.vehicle.detail` | implemented | unsaved form values are not database facts; saved-record retrieval requires an exact identifier |
| Sold Vehicle edit | yes | page-aware `sold.vehicle.detail` | implemented | selected record context and field-level readback are wired; production browser smoke remains |
| Sold Vehicle detail | yes | `sold.vehicle.detail` | implemented, configured sample verified | production database comparison and browser smoke |
| KPI cards | yes | aggregate tools | partial | reconcile UI KPI formulas with AI formulas |
| status chips/pipeline | yes | `sell.accounts.summary` | partial | status totals plus exact record membership |
| payment tracking | yes | `sold.vehicle.detail` + `payment.summary` | implemented, configured sample verified | reconcile against broader representative deals |
| customer money receipt | yes | `sold.vehicle.detail` | implemented, end-to-end verification pending | verify generated receipt preview/download |
| seller payments | yes | `payment.summary` | partial | exact seller ledger and payable balance |
| invoice | yes | `sold.vehicle.detail` + `invoice.summary` | implemented, configured sample verified | reconcile invoice and delivery data in production smoke |
| cancellation/credit note | yes | `refund.summary`, invoice summary | partial | exact cancellation reason, credit note and financial effect |
| refunds | yes | `sold.vehicle.detail` + `refund.summary` | implemented, configured sample verified | reconcile maker/checker and paid totals in broader samples |
| deeds/KYC | yes | document search/vehicle document tools | partial | exact side/document key and preview/download |
| RTO handoff | yes | `sold.vehicle.detail` + RTO tools | implemented, configured keys verified | reconcile exact tasks/status/files in broader samples |
| transfer details/remarks | yes | `sold.vehicle.detail` | implemented, configured sample verified | compare additional production samples |
| lock/status history | yes in data model | `sold.vehicle.detail` | implemented, configured sample verified | compare additional production timelines |
| CRM linkage | yes in service/data | `sold.vehicle.detail` + CRM tools | implemented, configured sample verified | broader cross-deal reporting is optional later scope |
| finance linkage | yes in schema/services | `sold.vehicle.detail` + finance tools | implemented, configured sample verified | broader orphan/duplicate comparison |
| WhatsApp/SMS delivery | yes in delivery plumbing | `sold.vehicle.detail.auditOperationalData` | WhatsApp ready; Sold Vehicle SMS DLT invoice/receipt rules not configured in current DB | save both DLT IDs/mappings, then provider callback verification |
| status/lock operational audit | yes | `sold.vehicle.detail.auditOperationalData` | implemented, configured sample verified | compare additional production timelines |
| refund maker-checker audit | yes | `sold.vehicle.detail.auditOperationalData` | implemented, configured sample verified | compare additional production samples |
| bank/drawn-on details | yes | `sold.vehicle.detail.auditOperationalData` | implemented, configured sample verified | compare additional payment/refund samples |
| internal/transfer notes | yes | `sold.vehicle.detail.auditOperationalData` | implemented, configured sample verified | compare additional source-note samples |
| online advance/listing mapping | yes | `sold.vehicle.detail.auditOperationalData` | implemented, configured keys verified | compare additional listing-payment bridges |
| connected module graph | yes | `sold.vehicle.detail.connectedModules` | implemented, configured keys verified | compare all direct keys against representative live deals |

## Phase 8 document and delivery coverage

| Document/delivery area | Source-backed implementation | Current state | Required completion |
|---|---|---|---|
| Money receipt PDF | Issued `SellAccountPayment` + existing receipt generator | implemented | authenticated portal and live attachment smoke test |
| Sale invoice / Bill of Supply | Exact `SellAccount.invoiceNumber` + existing generator | implemented | authenticated portal and live attachment smoke test |
| Purchase/sale deed and KYC | Known `SellAccount.documents` slots | implemented | representative file preview/download comparison |
| Credit note | Exact deal credit-note generator | implemented | representative source comparison |
| Refund advice | Paid exact `SellAccountRefund` generator | implemented | representative source comparison |
| Delivery challan | Completed deal + new source-backed PDF generator | implemented | representative portal download comparison |
| RTO forms/task documents | Exact RTO deal/task/document keys | implemented | representative file preview/download comparison |
| Vehicle images/videos | Exact listing media keys | implemented | authenticated media action smoke test |
| Website advance proof | Exact `listingPaymentId` bridge | implemented | representative proof comparison |
| Preview/download links | Internal route allowlist + portal UI actions | implemented | browser/API authentication smoke test |
| WhatsApp generated PDF attachment | Generated PDF uploaded as Meta `DOCUMENT` | implemented in service contract | live Meta callback/provider verification |
| SMS document delivery | Secure/configured link, not binary attachment | implemented in service contract | live SMS provider delivery verification |

### Phase 8 acceptance gate

- [x] Generated and stored document families have exact source keys.
- [x] Draft, cancelled, unpaid, missing and malformed rows cannot create misleading file actions.
- [x] Preview/download actions are restricted to allow-listed internal routes.
- [x] Money receipt and invoice WhatsApp paths use the generated PDF as a document attachment.
- [x] SMS behavior is accurately represented as link delivery.
- [x] SMS Sold Vehicle rules fail closed when DLT message IDs or exact variable mappings are missing.
- [x] Local Phase 8 tests and TypeScript validation pass.
- [ ] Representative live/staging records compared with generated files.
- [ ] Authenticated portal preview/download and live Meta/SMS callbacks verified.

## Phase 9 intelligence coverage

| Question family | Tool/metric | Source-backed output | Current state |
|---|---|---|---|
| complete deal analytics | `sold.vehicle.analytics` / `overview` | exact period or exact deal financial and operational summary | implemented; live comparison pending |
| profit/loss, GST and margin | `profit_loss` | canonical reconciliation, loss count, post-GST margin and evidence | implemented; live comparison pending |
| customer payment/outstanding and seller payout | `payments` | expected, received/paid, refunded and outstanding totals | implemented; live comparison pending |
| refunds | `refunds` | requested, approved, paid, pending, rejected and count | implemented; live comparison pending |
| RTO delay | `rto_delay` | status, delay days and pending/completed task evidence | implemented; live comparison pending |
| documents | `documents` | known available/missing slots and RTO task file counts | implemented; live comparison pending |
| collection risk | `collection_risk` | evidence-based score, level, outstanding and age | implemented; live comparison pending |
| low-margin deals | `low_margin` | threshold, deal list, margin and profit | implemented; live comparison pending |
| model-wise performance | `model_performance` | brand/model revenue, cost, expense, profit, margin and outstanding | implemented; live comparison pending |
| monthly comparison | `monthly_comparison` | selected vs equal-length previous period and change percentages | implemented; live comparison pending |
| revenue/cash-flow prediction | `forecast` | daily bands, totals, range, assumptions, confidence and limitations | implemented; live comparison pending |
| future suggestions | `suggestions` | evidence-based collection, margin, RTO and document actions | implemented; live comparison pending |

### Phase 9 acceptance gate

- [x] Dedicated source-backed analytics tool is registered, permissioned and schema-validated.
- [x] Generic Sold Vehicle search/detail/list routes are not overridden by analytics routing.
- [x] Exact older deal lookup is not lost due to the default date window.
- [x] Previous-period comparison data is loaded separately from selected-period totals.
- [x] Forecast assumptions, date range, confidence and limitations are returned; insufficient history is explicit.
- [x] Invalid/reversed date ranges fail closed and mutation requests remain blocked.
- [ ] Representative live/staging database comparison remains an external gate.

## Phase 10 full regression gate

- [x] Representative configured database source values compared with exact detail and analytics; 14 values/keys matched with zero mismatch.
- [x] Purchase, sale, expenses, profit and outstanding calculations compared between analytics and exact detail.
- [x] Representative Sold Vehicle question families route to the intended tools without overriding search/detail behavior.
- [x] Hindi/English/Hinglish, wrong ID, missing data, permission, follow-up, connected-module and failure contracts remain covered.
- [x] PDF renderers, document eligibility and internal preview/download route allowlists pass locally.
- [x] SMS detail projection uses only fields present in the current Prisma schema.
- [x] Configured communication readiness is checked against actual WhatsApp/SMS rule rows; missing Sold Vehicle SMS DLT configuration is reported explicitly.
- [ ] Authenticated browser preview/download smoke test.
- [ ] Approved live WhatsApp/SMS send and provider callback verification.

## Data field coverage

| Data group | Canonical fields/entities | Current AI exposure | Phase 1 finding |
|---|---|---|---|
| record identity | `SellAccount.id`, `recordNumber`, timestamps | record number in summary | exact identifier resolver required |
| vehicle | title, number, chassis, type, brand/model, owner | aggregate summary remains limited; selected exact detail exposes authorized operational view | live comparison pending |
| seller/source | source type, seller name/number/state/city, broker | exact detail plus direct selected-record party answers | live comparison pending |
| purchaser | purchaser name/number/state/city/date | exact detail | live comparison pending |
| purchase terms | purchase type/value/vehicle/amount/date | exact detail | live comparison pending |
| sale terms | sale type/value/vehicle/amount/date | exact detail | live comparison pending |
| expenses | `expenses`, `expenseBreakdown` | exact detail + `financialReconciliation` | source-vs-calculation comparison pending |
| GST/margin | tax mode, rate, margin basis, net profit fields | exact detail + canonical GST/profit reconciliation | live comparison pending |
| payment ledger | `SellAccountPayment` | exact detail + real/draft/cancelled totals + duplicate evidence | live comparison pending |
| refunds | `SellAccountRefund` | exact detail + requested/approved/paid/rejected/forfeit reconciliation | live comparison pending |
| status/audit | status, lock fields, history | exact detail | live comparison pending |
| invoice | number, generated/sent timestamps, delivery JSON | exact detail + file action | end-to-end verification pending |
| documents | document JSON, deed workflow | exact detail + file actions | end-to-end verification pending |
| RTO | record, status, compliance, tasks, status logs | exact detail + RTO summary | live comparison pending |
| CRM | `Lead.wonSellAccountId`, listing linkage | exact detail + CRM tools | exact deal activity/follow-up is source-backed; cross-deal timeline export is optional later scope |
| finance | vouchers, documents, schedules, write-offs, deal extension | exact detail + finance tools | orphan/duplicate comparison pending |
| communications | `WhatsAppMessageLog`, `SmsMessageLog`, outbox and invoice/receipt delivery JSON | exact per-deal logs + delivery summary | live/provider callback comparison pending |
| operational audit | status history, lock history, refund actors, notes and payment bank fields | exact source-backed audit projection | live comparison pending |
| connected modules | Listing, Lead, User/PartnerProfile, RTO tasks, Finance rows, FinPartyLink, advances, documents and communication logs | verified-key graph with excluded-row integrity counts | live comparison pending |

## Existing AI routing matrix

| User request pattern | Current selected tool | Result |
|---|---|---|
| “last 30 days sold vehicles” | `sold.vehicles` | bounded Listing/SaleRecord summary |
| Sold Vehicles page “complete/status/data” request | `sell.accounts.summary` with `allRecords: true` | SellAccount aggregate plus limited rows |
| sell accounts list/status/count | `sell.accounts.summary` | aggregate and limited rows |
| profit/margin report | `margin.summary` | aggregate SellAccount finance |
| payment/receipt summary | `payment.summary` | grouped sale/listing payment summary |
| refund summary/history | `refund.summary` | grouped refunds |
| invoice/bill summary | `invoice.summary` | finance/listing/SellAccount invoice summary |
| exact vehicle/listing detail | `listing.detail` or `vehicle.identity` | listing/identity source, not full deal |
| RTO pending/documents | RTO tools | RTO aggregate/readiness |
| future/forecast question | `forecast.operations` | existing forecast entry point |

## Must-not-claim yet

Until later phases pass database comparison tests, AI must not claim that it can reliably provide:

- every raw Sold Vehicle field in one answer;
- exact payment/refund history for a selected deal;
- exact buyer/seller/partner identity from the aggregate tools;
- complete RTO, CRM and Finance timeline for a deal;
- every deed/KYC/RTO file as a downloadable chat attachment;
- delivery success/failure for every WhatsApp/SMS receipt;
- future predictions as guaranteed facts.

## Phase 1 acceptance gate

- [x] Admin and employee Sold Vehicles routes inventoried.
- [x] Sell-account API endpoints inventoried.
- [x] Primary Prisma entities inventoried.
- [x] Connected module join candidates inventoried.
- [x] Existing AI tools and router behavior recorded.
- [x] Current masking/permission boundary recorded.
- [x] Exact-deal read tool implemented with unit/tool/router tests.
- [ ] Live/staging database values compared.
- [ ] File action and delivery audit verified.

## Phase 2 mapping gate

- [x] Every direct `SellAccount` field has a database source and exposure classification.
- [x] Deal, vehicle/listing, customer and partner identity rules are documented.
- [x] Connected RTO, CRM, payment, refund, documents and Finance relationships are mapped.
- [x] Existing AI tools are mapped to question families and current limitations.
- [x] Missing exact-detail, analytics, timeline, document and delivery-audit tools are listed.
- [x] Canonical `sold.vehicle.search` tool implemented with normalized identity matching and ambiguity reporting.
- [x] Canonical `sold.vehicle.detail` tool implemented.
- [ ] Live/staging database comparison run for representative deals.

## Phase 4 router and grounding gate

- [x] English, Hindi/Devanagari and Hinglish routing remains allow-listed and read-only.
- [x] Follow-up context preserves the selected deal/vehicle tool arguments across conversation turns.
- [x] Empty results and data-source failures are explicit and cannot be converted into guessed facts.
- [x] Tool contracts and final answer envelopes are schema-validated before persistence/response.
- [x] Operational questions without a verified database source receive a clarification instead of a provider-generated fact.
- [x] Phase 7 language, permission, empty-result, failure and sensitive-field matrix remains green.

## Phase 5 financial reconciliation gate

- [x] Purchase, sale, expenses, GST, margin and profit/loss are returned from the canonical shared finance formula.
- [x] Customer received/balance and seller paid/balance distinguish real, draft and cancelled receipts.
- [x] Paid refunds and forfeits are reflected separately in net customer money.
- [x] Duplicate payment rows are excluded from totals with evidence retained.
- [x] Stored-vs-calculated differences are explicit and never silently overwritten.
- [x] Unit, exact-detail, router/tool and full-suite regressions were run.
- [ ] Representative live/staging deals compared with the read model.

## Phase 6 audit and operational data gate

- [x] Status history returns old/new status, reason, actor references and timestamps.
- [x] Lock history is persisted for new lock events and legacy current locks are explicitly labelled as snapshots.
- [x] Refund maker/checker/requested/rejected/paid audit fields are returned without inferred actors.
- [x] Payment/refund bank and drawn-on fields are returned with receipt/refund status.
- [x] Deal, transfer, RTO, Finance, sale and refund notes are source-labelled.
- [x] WhatsApp/SMS delivery and outbox logs are joined by verified deal/payment entity keys.
- [x] Online advances are mapped through `listingPaymentId`; unresolved bridges are reported and not double-counted.
- [x] Operational projection tests, exact-detail tests, typecheck and schema validation passed.
- [ ] Live/staging comparison and provider delivery callback verification remain external gates.

## Phase 7 connected-module gate

- [x] Listings/Inventory is keyed by `SellAccount.listingId = Listing.id`.
- [x] CRM/Customer is keyed by `Lead.wonSellAccountId = SellAccount.id`; customer/dealer/owner keys are checked.
- [x] Partners/Dealers is keyed by `Listing.partnerId` and exact CRM `Lead.dealerId`.
- [x] RTO Work and its tasks/documents are keyed by `VehicleRtoRecord.sellAccountId` and `RtoTransferTask.rtoRecordId`.
- [x] Finance Hub and Accounting rows are filtered by exact `sellAccountId`; `FinPartyLink` keys are included.
- [x] Tally source is explicit as `sourceType=SELL_ACCOUNT, sourceId=dealId`; no separate Tally relation is fabricated.
- [x] CRM follow-ups and RTO transfer tasks are the only exact task relationships returned.
- [x] Vehicle documents, website advances and WhatsApp/SMS logs are key-validated.
- [x] Wrong keys and duplicate rows are excluded with warnings and integrity counts.
- [x] Phase 7 projection and exact-detail tests passed.
- [ ] Representative live/staging comparison remains external.
