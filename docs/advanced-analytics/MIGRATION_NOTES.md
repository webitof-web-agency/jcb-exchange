# Migration Notes

## Analytics migration

`20260910_add_analytics_events` is additive. It creates only `AnalyticsEvent` and its targeted indexes. No existing table, column, relation, or business record is deleted or renamed. Analytics dimensions are nullable and do not create restrictive foreign keys, so historical analytics rows do not unexpectedly disappear when a business record is removed.

## Existing migration-history repair

The configured database was non-empty and already had the physical schemas for the repository's earlier migrations, but its migration-history table did not record them. Normal `prisma migrate deploy` correctly stopped with Prisma `P3005` rather than guessing a baseline. Read-only schema/count inspection and SQL review were performed first. The known missing repository migration SQL was then applied directly, including the analytics migration, and all ten known migration names were resolved as applied. No destructive reset, drop, or data rewrite was used.

Final verification: `npx prisma migrate status` reports `Database schema is up to date!`, and `npx prisma validate` passes.

## Rollback posture

Analytics writes are fail-safe. If analytics must be disabled, stop the event producers and retain the business flows. Removing the analytics table would require a separately approved rollback migration; it is not part of normal deployment and was not performed.
