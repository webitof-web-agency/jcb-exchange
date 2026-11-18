# Phase 10 — Full Regression and Production Validation Report

**Run date:** 2026-11-18  
**Validator:** `backend/scripts/validate-sold-vehicle-phase10.ts`  
**Database:** configured `jcbexchange_prod` at `127.0.0.1:15432`  
**Current status:** `INCOMPLETE` — local code and database gates pass; live provider/browser gates remain external.

## Actual database comparison

The read-only validator selected the latest eligible non-draft, non-cancelled Sold Vehicle record (`SA-2026-001`) and compared the source row with `sold.vehicle.detail` and `sold.vehicle.analytics`.

| Check | Result | Evidence |
|---|---|---|
| Source field and relationship comparison | PASS | 14 source fields/relationship values compared; 0 mismatches |
| Purchase/sale/expense/profit reconciliation | PASS | Analytics and exact-detail canonical reconciliation matched; 0 mismatches |
| Customer outstanding | PASS | Analytics and exact-detail customer balance matched |
| Connected listing/RTO keys | PASS | Exact `listingId` and `rtoRecordId` matched |
| Wrong exact ID | PASS | Unknown UUID returned explicit `UNAVAILABLE` |

## Regression coverage

| Required validation | Result | Evidence |
|---|---|---|
| Every Sold Vehicle question family | PASS | 6 representative detail/search/analytics questions routed correctly |
| Full backend regression after Phase 10 fixes | PASS | `npm test` - 1094/1094 tests passed |
| Sold Vehicle page-context wiring | PASS | List/detail/edit route tests pass; selected record ID resolves generic follow-ups to exact detail |
| Hindi/English/Hinglish | PASS | Existing Phase 7 language matrix and router regression suite |
| Wrong ID/missing data | PASS | Exact-detail unavailable contract and validation tests |
| Permissions | PASS | Allow/deny matrix for every read-only tool |
| Follow-up context | PASS | Selected deal/tool arguments persist across turns |
| Failure/timeout/unavailable | PASS | Empty, database failure, provider failure and fail-closed tests |
| Connected-module consistency | PASS | Exact listing, CRM/RTO/Finance relationship tests plus live listing/RTO key comparison |
| PDF generation/action contract | PASS | Receipt, invoice, Bill of Supply, delivery challan, refund advice, credit note, route allowlist and document-action tests |
| WhatsApp/SMS wiring | FAIL-closed configuration gate | WhatsApp Sold Vehicle rules are READY in the configured database; both Sold Vehicle SMS DLT rules are disabled and have no approved message ID, so the system will not queue SMS silently |
| Live WhatsApp/SMS delivery callback | NOT RUN | Requires an approved real provider send and callback/log confirmation |
| Authenticated browser preview/download | NOT RUN | Requires a running authenticated portal browser session |

## Bugs found and fixed during production validation

1. `SmsMessageLog` does not contain `deliveredAt` or `readAt`; exact Sold Vehicle detail was selecting nonexistent Prisma fields. The query now selects only schema-backed SMS fields and has a regression test.
2. “sold vehicle documents pending” was falling through to `rto.documents.summary`; explicit Sold Vehicle document-status questions now route to `sold.vehicle.analytics`.
3. The validator initially used wrong reconciliation key names (`purchaseAmount`/`saleAmount` instead of canonical `purchase`/`sale`); the validator was corrected and the live comparison now passes.
4. The configured database had `VEHICLE_SALE_INVOICE` and `VEHICLE_SALE_PAYMENT_RECEIPT` SMS rules disabled and unlinked. The validator now reads the real rules and reports the exact missing DLT configuration; the admin screen also shows an activation warning instead of implying that SMS is live.
5. Seller-name questions were falling through to the intentionally limited aggregate summary. Selected-record party questions now route to `sold.vehicle.detail`, and the authenticated portal receives the raw operational party projection for the selected deal; provider-safe data remains masked.

## Completion decision

Phase 10 cannot be labelled fully production-verified until these checks are completed:

- authenticated portal preview/download smoke test for a real receipt/invoice/file;
- approved DLT message IDs and exact variable mappings are saved for both Sold Vehicle SMS rules;
- approved WhatsApp and SMS test delivery with provider callback/log confirmation.

No database migration is required for Phase 10. Prisma schema validation and migration status are already green; the SMS fix is a query projection correction against the existing schema.

The validator exits non-zero while `communication_delivery` is `FAIL` because the configured SMS rules are incomplete. Once both DLT rules are configured, the gate will remain `EXTERNAL` until a permitted live provider send and callback are verified.
