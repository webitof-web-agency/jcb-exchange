# Analytics Architecture

## Shape

1. Existing Express/Prisma backend remains the authority for scope, filters, aggregation, money interpretation, and unavailable-data metadata.
2. Add one normalized `AnalyticsEvent` table for forward-looking public events. It stores event type, anonymous/session identifiers, optional listing/partner/model/year dimensions, safe query/filter payload, source, and occurrence time.
3. Keep `Listing.views` for compatibility and expose it as an aggregate, not as a historical time series.
4. Add admin overview, paginated listing drill-down, listing detail, export, and public event ingestion endpoints under the existing `/analytics` router.
5. Add a native admin/employee analytics route and surface the already existing partner analytics route in partner navigation.

## Scope and security

- Super admin may see platform analytics.
- Employee access requires `analytics.read` (or `ALL_ACCESS`) server-side.
- Partner analytics is restricted to the authenticated partner's `partnerId`.
- Customer accounts cannot access admin or partner analytics.
- Export reuses exactly the same server-side scope and filter validation.

## Performance

Use bounded date windows, aggregate/group queries, selected fields, server pagination, and indexes matching event type/time and ownership dimensions. No full raw event table is sent to the browser. Durable event writes are isolated from core requests.

