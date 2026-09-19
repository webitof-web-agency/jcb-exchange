# Existing Analytics and Tracking

## Reused capabilities

- `Listing.views` is reused as the legacy cumulative view counter.
- Existing listing statuses and lead statuses are reused as-is.
- Existing partner overview endpoint and page are extended rather than replaced.
- Existing Recharts dependency, portal cards, auth store, API client, number/currency formatters, and admin route permission pattern are reused.

## Existing tracking limitations

The public detail page calls the view endpoint once per component mount. The backend excludes common bots and suppresses repeated IP/listing increments for 24 hours using an in-memory map. It does not provide durable event history, unique-user counts across instances, search history, filter usage, source attribution, or historical time-series views.

## Safe extension

The new event store is additive. Legacy `views` remains available for backward compatibility; durable events begin at deployment/migration time. Event writes are isolated and non-blocking. Analytics APIs never use fabricated historical events.

