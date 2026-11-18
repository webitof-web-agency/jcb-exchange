# Phase 2 — Sold Vehicles Question-to-Tool Mapping

**Audit date:** 2026-11-17  
**Scope:** English, Hindi and Hinglish read-only questions for Sold Vehicles and connected modules

## Tool selection policy

1. Resolve an explicit deal identifier first: `SellAccount.id`, `recordNumber`, invoice number, registration number or chassis number.
2. Once a deal is selected, keep that deal context for follow-up questions such as “iska payment batao” or “iska PDF bhejo”.
3. Use the exact-deal tool for deal questions. Do not answer an exact deal question from a period aggregate.
4. Use canonical finance/payment/refund calculations rather than recomputing totals in the language model.
5. If multiple deals match a name, phone, registration or listing, ask a disambiguating question and show safe candidate keys.
6. If a source is unavailable or the relationship is orphaned, report the unavailable source and never fill it with a guess.

## Canonical target tools for Phase 2

| Target tool | Purpose | Minimum arguments |
|---|---|---|
| `sold.vehicle.search` | Resolve a user phrase to one or more SellAccount deals | `query`, optional `recordNumber`, `listingId`, `invoiceNumber`, `vehicleNumber`, `chassisNumber`, `limit` |
| `sold.vehicle.detail` | Complete permissioned deal read model | one verified `dealId` or `recordNumber`; optional `include` groups |
| `sold.vehicle.analytics` | Deal-scoped or period-scoped financial, operational and forecast analytics | optional `dealId`/`recordNumber`, `from`/`to` or `days`, `metric`, optional `horizon`, `limit` |
| `sold.vehicle.detail` (`auditOperationalData`) | Deal, payment, refund, RTO, CRM and finance chronology | verified `dealId` or `recordNumber`, optional include groups |
| `sold.vehicle.detail` (`uiActions.documents`) | Exact deal documents and secure preview/download actions | verified `dealId` or `recordNumber`; document action is generated from source-backed rows |
| `sold.vehicle.detail` (`auditOperationalData`) | Invoice/receipt WhatsApp and SMS delivery history | verified deal/payment relation and optional document/channel context |

These Phase 2/3 contracts are implemented through the read-only `sold.vehicle.search`, `sold.vehicle.detail` and `sold.vehicle.analytics` tools. Documents are returned as exact `uiActions`; delivery and chronology are returned through `auditOperationalData`. Production browser/provider evidence remains a separate verification gate.

## Question mapping

| User question examples | Target tool | Current fallback | Required result |
|---|---|---|---|
| “Deal SA-2026-001 ka pura data batao” / “show complete details for this sold vehicle” | `sold.vehicle.detail` | none for exact requests | Source-backed joined record, all authorized fields, source labels and missing-field markers. |
| “CG04AB1234 wali sold vehicle ka record” | `sold.vehicle.search` → `sold.vehicle.detail` | `listing.detail`/`sell.accounts.summary` | Resolve registration to a deal; ask if ambiguous. |
| “invoice INV-2026-001 kis deal ka hai?” | `sold.vehicle.search` → `sold.vehicle.detail` | `listing.detail` | Return deal number, invoice source and reconciliation state. |
| “is deal ka customer, seller aur partner kaun hai?” | `sold.vehicle.detail` | none for exact requests | Show snapshot fields plus verified User/Partner/Lead links separately. |
| “is vehicle ka listing aur sale history batao” | `sold.vehicle.detail` | `listing.detail` + `sold.vehicles` | Verified listing, sale record and deal sequence. |
| “purchase, sale, exchange aur expenses ka breakup” | `sold.vehicle.analytics` | `margin.summary` | Raw authorized inputs, expense breakdown, calculation basis and totals. |
| “profit/loss aur GST exact batao” | `sold.vehicle.analytics` | `margin.summary` | Canonical finance result, tax mode, margin basis, GST and loss flag. |
| “customer se kitna paisa aaya, seller ko kitna diya?” | `sold.vehicle.detail` | `payment.summary` for aggregate | Exact payment rows, receipt status, refunds, balances and seller payable. |
| “is receipt ka PDF bhejo/download karo” | `sold.vehicle.detail` → `uiActions.documents` | `ai.documents.search` | Secure authenticated file action with exact receipt ID; draft status shown. |
| “invoice ka PDF WhatsApp par gaya ya nahi?” | `sold.vehicle.detail` → `auditOperationalData` | `invoice.summary` / page adapter | Per-channel attempt, queued/sent/failed/duplicate and failure reason. |
| “RTO me kya pending hai?” | `sold.vehicle.detail` | `rto.pending.tasks` for aggregate | Exact linked RTO record, task status, remarks, compliance and file metadata. |
| “RTO ka kaunsa document missing hai?” | `sold.vehicle.detail` → `uiActions.documents` | `rto.documents.summary` | Task-level missing/uploaded documents and secure file actions. |
| “CRM me is customer ki lead/follow-up history” | `sold.vehicle.detail` → `auditOperationalData` | CRM tools separately | Verified Lead, activities, contact profile and follow-ups linked to the deal. |
| “Finance me is deal ke vouchers/invoice/dues kya hain?” | `sold.vehicle.detail` → `connectedModules`/`auditOperationalData` | `finance.hub.page`, `invoice.summary` | Validated finance identifiers, vouchers, documents, schedules, write-offs and orphan warnings. |
| “last 30 days sold vehicles/profit/payment” | `sold.vehicle.analytics` | `sold.vehicles`, `margin.summary`, `payment.summary` | Consistent date scope and non-duplicated aggregates. |
| “future me sales/profit ka forecast do” | `sold.vehicle.analytics` / `forecast` | `forecast.operations` | Revenue/cash-flow forecast with historical and future ranges, assumptions, confidence and no guaranteed claim. |
| “low margin ya loss wale sold deals batao” | `sold.vehicle.analytics` / `low_margin` or `profit_loss` | `margin.summary` | Threshold, deal keys, margin, profit/loss and source range. |
| “model wise performance aur monthly comparison” | `sold.vehicle.analytics` / `model_performance` or `monthly_comparison` | `analytics.summary` | Brand/model aggregates and equal-length previous-period changes. |
| “customer collection risk, RTO delay, documents pending” | `sold.vehicle.analytics` / `collection_risk`, `rto_delay`, `documents` | CRM/RTO/document summaries | Evidence, score/status/counts and explicit missing-data limitations. |
| “future suggestion kya hai?” | `sold.vehicle.analytics` / `suggestions` | none | Only evidence-based operational suggestions from the selected source range. |

## Field-group include contract for `sold.vehicle.detail`

| Include key | Database groups |
|---|---|
| `identity` | SellAccount IDs, record number, listing bridge, vehicle identity, status and timestamps |
| `parties` | seller, purchaser, owner, broker snapshots plus verified User/Lead/Partner links |
| `commercials` | purchase/sale/exchange values, expenses, tax mode, margin basis and profit fields |
| `payments` | purchaser receipts, seller payments, receipt state, balances and listing-payment bridge |
| `refunds` | refund rows, maker/checker state, paid/rejected information |
| `invoice` | invoice number, generation, finance document reconciliation and delivery audit |
| `rto` | RTO record, compliance snapshot, transfer tasks, status logs and task documents |
| `crm` | won lead, customer profile, activities and follow-ups |
| `finance` | vouchers, lines, finance documents, deal extension, schedules and write-offs |
| `documents` | metadata plus authorized secure file actions only |
| `audit` | status history, lock/cancel/completion actors and timestamps |

## Current router gaps

- Exact `recordNumber` and UUID requests route to `sold.vehicle.detail`; registration/chassis/invoice resolution routes to `sold.vehicle.search`.
- The current `sell.accounts.summary` response intentionally masks vehicle, party, remarks and document fields and returns only a limited row set.
- Payment, refund, RTO, CRM and Finance are joined by the detail read model; operational chronology and communication delivery are exposed through `auditOperationalData`.
- Stored file requests resolve through exact deal-scoped `uiActions.documents`; generic document search remains available for non-deal requests.

## Answer contract

Every target tool response should include `source`, `fetchedAt`, `dealId`, `recordNumber`, `dataAvailability`, `missingFields`, `relationshipWarnings` and `permissionsApplied`. Numeric answers must include the date scope and calculation basis. File answers must include an authenticated action, filename and MIME type, never a raw private token.
