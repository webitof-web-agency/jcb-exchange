# Phase 9 — Sold Vehicle Intelligence

**Date:** 2026-11-18  
**Scope:** Source-backed Sold Vehicle analytics, forecasting and suggestions

## Runtime contract

The `sold.vehicle.analytics` read-only tool is the single Phase 9 entry point. It reads `SellAccount` and its verified payment, refund, RTO and Listing/model relations, then applies the same canonical financial reconciliation used by exact Sold Vehicle detail.

Supported metrics include complete overview and profit/loss, payments/outstanding, seller payout, refunds, RTO delay, document status, collection risk, low-margin deals, model/brand performance, previous-period comparison, revenue/cash-flow forecast and evidence-based suggestions.

## Grounding and calculation rules

- Only non-draft and non-cancelled records are eligible for settled analytics.
- Exact `dealId`/`recordNumber` requests remain addressable even when older than the default date window.
- Period queries use the effective sale date: `sellDate`, then `completedAt`, then `createdAt`.
- Customer/seller totals and refunds use the canonical reconciliation, receipt status and duplicate prevention rules.
- Revenue is recognized on the effective sale date. Cash flow includes issued customer receipts, subtracts issued seller payments and paid refunds.
- Previous-period rows are loaded for comparisons without entering selected-period totals.
- Invalid dates and reversed ranges fail closed; empty data returns `NO_DATA`, never zero-as-fact.

## Forecast contract

Forecast responses contain historical and forecast date ranges, horizon, daily revenue/cash-flow bands, totals, assumptions, method, confidence score/label and limitations. The model is a directional baseline/trend projection. Insufficient historical observations produce `INSUFFICIENT_DATA`; no future value is invented.

## Router coverage

Hindi, English and Hinglish questions with explicit Sold Vehicle analytics signals route to `sold.vehicle.analytics`. Generic list/search/detail questions retain their existing `sold.vehicles`, `sold.vehicle.search` and `sold.vehicle.detail` routes. Mutation language is never routed to this read-only tool. Selected deal arguments and range follow-ups remain in the existing conversation context contract.

## Verification

- `soldVehicleAnalytics.service.test.ts`: exact analytics, forecast, insufficient history, exact older deal and previous-period comparison.
- `aiIntentRouter.service.test.ts`: Phase 9 metric routing plus regression coverage for search/detail/summary and generic forecast.
- `aiReadOnlyTools.service.test.ts`: registry, permission, validation and fail-closed contracts.
- Prisma schema is unchanged; this phase requires no migration.

Live database comparison, authenticated portal checks and provider delivery checks remain deployment/environment gates rather than guessed local results.
