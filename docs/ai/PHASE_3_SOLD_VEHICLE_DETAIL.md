# Phase 3 — Exact Sold Vehicle AI data layer

**Tool:** `sold.vehicle.detail`  
**Canonical source:** `SellAccount`  
**Status:** Runtime implemented; live/database comparison pending.

## Exact lookup contract

The tool accepts either:

- `dealId`: exact `SellAccount.id` UUID
- `recordNumber`: exact unique `SellAccount.recordNumber`

At least one identifier is required. The query always applies `deletedAt: null`. It never searches by a name, vehicle text, or partial identifier and never chooses the first of multiple possible records.

## Returned source-backed groups

- Deal identity, status, lock/cancel/completion state, timestamps and raw authorized commercial fields.
- Buyer/purchaser, seller, owner and broker snapshots.
- Vehicle and Listing/SaleRecord data, partner profile, media metadata and won CRM lead/customer links.
- Purchase/sale/exchange values, expenses, GST/tax mode, margin basis and stored profit figures.
- Full payment rows with receipt state, purchaser/seller totals and balances.
- Refund rows with status, paid/pending totals and maker-checker timestamps.
- Invoice/credit-note fields and finance document/voucher reconciliation.
- Deed workflow metadata, SellAccount document metadata, RTO record, compliance, transfer tasks and status logs.
- Finance vouchers/lines, finance documents/lines, deal extension, payment schedules and write-offs.
- `missingFields` and `relationshipWarnings` for absent or orphaned connections.

## File actions

The authenticated portal response can contain actions for:

- generated invoice PDF;
- vehicle details PDF;
- vehicle documents ZIP;
- issued customer money-receipt PDFs.

Raw private URLs, document tokens, credential hashes, signing ciphertext and provider secrets are excluded from the AI/provider data contract.

## Non-guessing behavior

- Missing identifier: validation error.
- Exact identifier not found: `found: false`, `dataAvailability: UNAVAILABLE`.
- Missing relation: `null` plus `relationshipWarnings`.
- Unavailable database: standard `AI_TOOL_DATA_UNAVAILABLE` contract.
- Generic Sold Vehicles page questions continue to use aggregate tools; they do not silently turn into an exact-deal lookup.

## Phase 2 search handoff

The canonical `sold.vehicle.search` tool now resolves registration, chassis, invoice, listing, record and text queries to safe candidates. Formatted identity values are normalized. Multiple matches return `ambiguous: true`; the caller must choose an exact `dealId` or `recordNumber` before requesting full detail.

## Remaining verification

- Compare representative live/staging records against the read model.
- Verify invoice, vehicle-doc and money-receipt preview/download end-to-end.
- Add per-deal WhatsApp/SMS delivery audit and extended CRM activity timeline.
