# Project Audit

## Architecture discovered

JCB Exchange is a multi-application repository:

- `backend`: Express 5 + TypeScript + Prisma 7 + PostgreSQL/Neon adapter.
- `frontend`: Next.js 16 customer marketplace.
- `admin-portal`: Next.js 16 admin, employee, and partner portal with Recharts and Zustand.
- `JCB-Exchange`: React Native mobile shell using a hybrid WebView.

## Authentication and authorization

The backend authenticates Bearer JWTs in `src/middlewares/auth.middleware.ts`, reloads the user from the database, and resolves the effective role. Super admins bypass employee permission checks; employees use custom-role or direct `AdminPermission` records. Partner data is scoped by `partnerId`/`dealerId` in existing controllers.

The frontend persists the authenticated session in the existing auth store and attaches the JWT through `admin-portal/src/lib/api.ts` or the corresponding customer API helpers.

## Core source records

- `Listing`: inventory, price, `manufacturingYear`, location, status, aggregate `views`, brand, model, category, partner.
- `Lead`: customer-to-listing/dealer enquiry with real workflow status and snapshots.
- `LeadActivity`: status changes, notes, calls, WhatsApp, follow-ups, and routing history.
- `SaleRecord`: sold price, sold timestamp, buyer geography, optional invoice number.
- `ListingPaymentSubmission`: payment proof/gateway payment status and amount.
- `CustomerPrimeSubscription`: customer subscription payment lifecycle.
- `PartnerDeposit`: partner deposit amount, method, status, and refund fields.
- `KycDocument`, `KycReviewLog`, `PartnerProfile`: operational/KYC health.
- `PlatformRuntimeSettings`: company invoice settings exist as configuration, not invoice transactions.

## Existing analytics

There is a partner-only `/analytics/partner-overview` endpoint and a partner analytics page. It reads all partner listings/leads into application memory, computes status counts and a six-month lead trend, and exposes top listings. Admin dashboards contain operational counters but not an advanced analytics environment.

## Existing gaps relevant to this task

- No event table for historical views, searches, filters, shares, sessions, or source attribution.
- Listing views are an aggregate integer incremented by a public endpoint with a process-local 24-hour IP cache and bot check.
- Public listing search/filtering is largely client-side after loading the public listing feed.
- No invoice, invoice line, tax, GST component, refund transaction, or collection ledger model exists.
- There is no separate analytics permission or admin analytics route.

