# AI Phase 5 — Finance and commercial data

Phase 5 exposes bounded, read-only finance and commercial summaries for invoices, bills, payments, revenue, margins, wallets, API billing, sell accounts, refunds, the Finance Hub workspace, accounting, and journals.

## Tools

- `finance.workspace.summary` — Finance Hub settings, financial years, periods, accounts, banks, parties, cost centres, and voucher counts.
- `invoice.summary` — Finance Hub documents, listing bills, sell-account invoices, statuses, and safe document totals.
- `payment.summary` — sale receipts and listing payment submissions grouped by safe status and method aggregates.
- `margin.summary` — purchase, sales, expenses, profit, post-GST profit, and margin percentages.
- `wallet.summary` — platform API wallet balance, usage, and safe ledger aggregates in INR.
- `api.billing.summary` — API usage, configured prices, and webhook status/event aggregates.
- `sell.accounts.summary` — sell-account status, draft/lock state, invoice state, and commercial totals without vehicle or party identity.
- `refund.summary` — refund status, reason, method, refund amount, and forfeiture aggregates.
- `accounting.summary` — chart-of-accounts, bank, category-map, and voucher status aggregates.
- `journal.summary` — journal voucher type/status, debit, credit, and bounded recent voucher rows.

`revenue.summary` and `finance.trend` remain available for the existing revenue and cash-movement views.

## Safety boundary

All Phase 5 tools:

- require finance or Finance Hub read permissions;
- accept a maximum 90-day range and maximum 20 returned rows;
- use read-only Prisma queries and never invoke payment, refund, invoice, posting, approval, wallet, or provider mutations;
- omit customer/party contacts, bank references, account numbers, vehicle identity, notes, documents, provider IDs, tokens, webhook payloads, and user IDs;
- return the common AI data contract with permission, freshness, masking, and empty-data status.

No migration, external billing call, payment action, journal posting, refund action, or accounting write is performed by these tools.
