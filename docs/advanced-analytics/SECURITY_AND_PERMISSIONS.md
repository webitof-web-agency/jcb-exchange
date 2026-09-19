# Security and Permissions

- Existing JWT authentication is mandatory for admin/employee/partner analytics.
- `analytics.read` is the new least-privilege employee permission; `ALL_ACCESS` and super admin retain existing bypass behavior.
- Partner requests derive scope from `req.user.id`; client-supplied partner IDs cannot widen it.
- Listing detail, drill-down, and export apply the same scope check as summary endpoints.
- Event ingestion accepts only an allow-listed event type, bounded strings, bounded JSON, and no raw IP storage. Bot/system requests are excluded where applicable.
- Anonymous identifiers are opaque client identifiers; no customer PII is accepted in event payloads.
- Financial source rows are never returned to unauthorized partners.

