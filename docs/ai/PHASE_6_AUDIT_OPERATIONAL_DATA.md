# Phase 6 — Sold Vehicle Audit and Operational Data

**Date:** 2026-11-18  
**Canonical tool:** `sold.vehicle.detail`  
**Projection:** `auditOperationalData`

## Contract

The exact Sold Vehicle read model now contains a dedicated operational projection. It is selected by the verified `SellAccount.id` or `recordNumber`; it is never built from a listing-only guess.

| Area | Source | Returned data |
|---|---|---|
| Deal status | `SellAccountStatusHistory` | old/new status, reason, actor reference and timestamp |
| Lock state | `SellAccount` + `SellAccountLockHistory` | current lock, lock/unlock action, actor, reason and timestamp |
| Refund approval | `SellAccountRefund` + `User` | requested, approved, rejected and paid actors/times, status, amount and reason |
| Bank details | `SellAccountPayment`, `SellAccountRefund` | method, reference, drawn-on bank, amount, receipt/refund state and relevant actors |
| Internal notes | `SellAccount`, RTO, Finance extension, sale record, status/refund rows | source-labelled notes and transfer details |
| Communication | `WhatsAppMessageLog`, `SmsMessageLog`, outbox | event, entity link, recipient, provider status, error, attempts and delivery/read times |
| Online advance | `ListingPaymentSubmission` + `SellAccountPayment.listingPaymentId` | submitted advance, linked receipt, link status and unmatched IDs |

## Counting and integrity rules

1. The canonical deal is `SellAccount.id`; `recordNumber` is its human identifier.
2. A listing advance is not counted as a second receipt after a `SellAccountPayment.listingPaymentId` bridge exists.
3. Communication rows are included only when their stored polymorphic entity key points to the deal or one of its payment IDs.
4. Missing actor rows, unresolved listing bridges, missing history and absent communication rows are reported as warnings.
5. Legacy rows with `isLocked=true` but no lock-history record are exposed as `CURRENT_RECORD_SNAPSHOT`, not as a fabricated historical lock event.
6. The current code has no approved unlock mutation; therefore no unlock history is invented.

## Persistence change

`SellAccountLockHistory` and `SellAccountLockAction` were added in migration `20261118_0002_sold_account_lock_history`. New Sold Vehicle completion locks and linked RTO locks write a `LOCK` row transactionally with the deal update. The `UNLOCK` enum value supports a future approved workflow but no unlock endpoint was added by this phase.

## Security and response boundary

Authorized exact-detail users may receive raw business values needed for operations, including phone numbers and bank/drawn-on fields. Credentials, access tokens, OTPs, hashes, ciphertext, private signing material and secret provider payloads are never part of this projection. Provider delivery data is limited to fields stored in the communication log/outbox contract.

## Verification status

- Operational projection: 3/3 unit tests passed.
- Exact detail plus operational wiring: 6/6 targeted tests passed.
- TypeScript and Prisma validation passed.
- Live/staging row comparison and provider callback verification remain environment-dependent gates.
