# AI Phase 7 — Testing and rollout

Phase 7 adds intelligent, deterministic routing on top of the read-only AI
assistant. It detects bounded business identifiers before generic module
routing, preserves the selected entity for safe follow-ups, and asks for a
clarification when a detail request is underspecified. It does not delete data,
mutate business records, or apply a database migration by itself.

The router currently detects:

- registration/RC numbers → `vehicle.identity`
- listing UUIDs → `listing.detail`
- invoice or bill numbers → `listing.detail`
- partner/dealer codes or IDs → `partner.performance`
- lead/enquiry UUIDs → `crm.lead.detail` or `enquiry.detail`

Detail follow-ups retain the bounded ID/query from the previous request for
listings, vehicles, leads, enquiries, and customers. Missing detail targets
return a clarification instead of an unscoped database lookup.

## Automated matrix

The matrix is defined in
`backend/src/services/ai/aiPhase7TestMatrix.ts` and enforced by
`backend/src/services/ai/aiPhase7.matrix.test.ts`.

It currently covers all allow-listed tools and these cases for every tool:

- English, Hindi, Hinglish, spelling mistakes, and mixed-language messages
- valid and invalid identifiers
- duplicate records and empty results
- permission denied and database unavailable
- Surepass unavailable and provider unavailable
- mutation requests such as delete, update, approve, and send
- sensitive-field requests and provider-safe redaction

Run the focused release gate from `backend`:

```powershell
npm run test:ai:phase7
npx tsc --noEmit
```

The test fixture uses dependency injection only. It does not connect to or write
to the live database.

## Safe rollout sequence

1. **Prepare:** run the Phase 7 gate, backend type-check, the existing backend
   regression suite, and the admin portal type-check/build.
2. **Backup:** verify the scheduled database backup is healthy before release.
3. **Staging:** apply the additive Phase 6 telemetry migration only in the
   controlled deployment environment, then verify AI status and telemetry.
4. **Canary:** keep `AI_ENABLED=false` for the general audience. Enable AI only
   for the approved internal operator group and use a model that passes the
   provider connection test.
5. **Observe:** review provider failures, query/database/Surepass latency,
   permission denials, clarification rate, empty-data rate, forecast confidence,
   and audit-log redaction during the verification window.
6. **Promote or rollback:** if a critical error, data leak, provider instability,
   or material latency regression appears, set `AI_ENABLED=false` and restart
   the backend. This blocks new AI provider calls without changing business data.

## Go/no-go checks

Go only when:

- Phase 7 and existing regression tests pass.
- The selected provider/model passes its real connection test.
- No raw message, API key, token, phone number, owner field, or document URL
  appears in AI audit/reliability records.
- Permission-denied, empty, unavailable, ambiguous, and provider failures remain
  explicit and safe.
- The database backup and rollback path are confirmed.

Do not treat a successful model-list fetch as proof that every model can answer
chat requests. The selected model must pass the actual provider connection test.
