# Phase 5 — Sold Vehicle Financial Reconciliation

**Status:** Implemented in the exact `sold.vehicle.detail` read model
**Date:** 2026-11-18

## Canonical source and formula

`backend/src/services/ai/soldVehicleFinancialReconciliation.service.ts` is a read-only reconciliation layer. It delegates GST and payment semantics to `backend/src/services/sellAccountFinance.ts`, the same shared implementation used by Finance Hub and Sold Vehicles. AI does not calculate a second, guessed version of the books.

The response includes:

- purchase amount, sale amount, expense total and expense breakdown;
- trade margin (`sale - purchase`);
- profit before GST according to the stored margin basis;
- taxable margin, GST rate, GST amount, CGST, SGST/IGST and tax type;
- profit after GST, profit/loss result and before/after-GST margin percentages;
- exchange values and cash purchase/sale amounts;
- customer real receipts, draft receipts, cancelled receipts, paid refunds, forfeits, net received and balance;
- seller real payments, draft payments, cancelled payments and balance;
- requested, approved, paid and rejected refund totals;
- stored-vs-calculated differences and a `RECONCILED`, `MISMATCH` or `INCOMPLETE` status.

## Counting rules

1. Only `ISSUED` receipts count as real money. A missing historical receipt status is treated as `ISSUED` because the schema documents that legacy rows predate draft receipts.
2. `DRAFT` rows remain visible as pending evidence but never increase received/paid totals.
3. `CANCELLED` rows and rows with `cancelledAt` never increase received/paid totals.
4. Paid refund amount and paid forfeiture are removed from the customer's net received amount; forfeiture remains separately visible.
5. On exchange deals, exchange values reduce the expected cash amount without reducing the deal's purchase/sale values used for GST/profit.
6. Payment IDs are the primary duplicate key. Legacy rows without IDs use a stable receipt/listing/reference fingerprint only when available; rows without a stable key are not silently dropped.
7. Listing payment submissions are not independently added to exact-deal receipt totals when the canonical `SellAccountPayment` row already represents them. `listingPaymentId` remains evidence for tracing.

## Exact-deal response contract

`buildSoldVehicleDetail` now exposes `financialReconciliation` at the top level and includes the same reconciled object under `deal.financials.reconciled`. The existing `payments` and `refunds` sections retain item-level rows and add the reconciled totals and duplicate evidence.

The AI may explain a stored/calculated mismatch, but must not silently replace the stored source values. It should identify the field, both values, formula result and evidence row counts.

## Verification

- `soldVehicleFinancialReconciliation.service.test.ts`: real/draft/cancelled rows, paid/pending/rejected refunds, exchange cash balances and duplicate payment rows.
- `soldVehicleDetailAi.service.test.ts`: exact database read-model wiring and calculated values.
- `npm run typecheck`: passed after integration.

## Security boundary

Authorized financial/business fields are available through the exact permissioned deal tool. Credentials, tokens, hashes, ciphertext and private file locators remain excluded; this is required to prevent account takeover and unsafe document access.
