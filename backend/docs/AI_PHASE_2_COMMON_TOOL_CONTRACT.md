# AI Phase 2 — Common read-only tool contract

Phase 2 standardises the response envelope returned by every allow-listed AI read-only tool. The contract is created centrally in `src/services/ai/aiDataContract.service.ts` and applied by `AiReadOnlyToolsService`, so domain tools do not need to duplicate envelope logic.

## Statuses

Every tool result uses one of these statuses:

- `success` — the requested data was fetched.
- `empty` — the query was valid, but no matching data was found.
- `permission_denied` — the signed-in operator is not allowed to access the tool or data.
- `data_unavailable` — the selected data source could not provide the requested result.
- `ambiguous` — the request needs clarification before a safe tool call can be made.
- `validation_error` — the request or tool arguments are invalid.
- `provider_unavailable` — retained for compatibility with the existing provider/error boundary.

## Envelope

```json
{
  "status": "success",
  "source": "database",
  "fetchedAt": "2026-11-13T12:00:00.000Z",
  "freshness": "current",
  "data": {},
  "maskedFields": [],
  "permission": "allowed",
  "pagination": {
    "limit": 20,
    "offset": 0,
    "returned": 0,
    "total": null,
    "hasMore": false,
    "nextCursor": null
  },
  "safeLimits": {
    "maxLimit": 20,
    "maxDays": 90,
    "requestedLimit": null,
    "appliedLimit": 20
  }
}
```

## Safety rules

- The maximum result limit is 20 and is clamped centrally.
- Range-based tools remain capped at 90 days through their existing Zod schemas.
- `returned` is derived only from safe collection data; aggregate summaries use `null`.
- Error and permission contracts contain `data: null` and the same safe metadata fields.
- `maskedFields` records field names that were redacted; values, tokens, URLs, and credentials are never placed in the envelope metadata.
- Existing `provider_unavailable` behaviour is preserved so provider failures remain distinguishable from database unavailability.
- No database migration or destructive data operation is required for this phase.
