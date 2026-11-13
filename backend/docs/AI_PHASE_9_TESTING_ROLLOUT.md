# AI Phase 9 — Testing and rollout

Phase 9 is the release gate for the read-only AI operational modules. The
matrix covers all currently allow-listed tools and all operational module
groups, without connecting to live providers or mutating business data.

## Required scenario coverage

Every tool entry is required to declare and execute these cases:

- English, Hindi, Hinglish, spelling mistakes and mixed-language requests;
- valid and invalid identifiers where the tool accepts an identifier;
- duplicate records and empty data;
- permission denied;
- database unavailable, Surepass unavailable and AI provider unavailable;
- sensitive-field requests with PII/document URL/credential redaction;
- mutation requests, which must never select a read-only tool.

The executable matrix is in:

- `backend/src/services/ai/aiPhase7TestMatrix.ts`
- `backend/src/services/ai/aiPhase7.matrix.test.ts`
- `backend/src/services/ai/aiPhase9.matrix.test.ts`

The Phase 9 suite additionally asserts that every operational module has
language examples and that every read-only tool fails closed for mutation
phrasing. A mutation guard in `routeAiMessage` prevents catalog fallback from
selecting a read-only tool after a request such as “delete this record”.

## Local release gate

Run from `backend`:

```powershell
npx tsx --test src/services/ai/aiPhase9.matrix.test.ts src/services/ai/aiPhase7.matrix.test.ts
npx tsc --noEmit
```

For the complete AI regression suite:

```powershell
& npx tsx --test (Get-ChildItem -Path src/services/ai -Filter '*.test.ts' | ForEach-Object { $_.FullName })
```

## Rollout sequence

1. Run the complete AI suite and backend typecheck.
2. Confirm the additive AI reliability migration is deployed before reading
   telemetry; the safe snapshot fallback must remain available during rollout.
3. Keep `AI_ENABLED=false` for general users and enable only for approved
   operators first.
4. Monitor permission denials, empty-data rate, clarification rate, query and
   provider p95 latency, provider failures and sensitive-field audit events.
5. Roll back by setting `AI_ENABLED=false` and restarting the backend if a
   routing, data-safety, provider or latency regression appears.

No live-provider, intrusive production, or business-data mutation test is part
of this phase.
