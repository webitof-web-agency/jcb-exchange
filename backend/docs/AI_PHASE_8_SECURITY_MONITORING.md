# AI Phase 8 — Security and monitoring

Phase 8 closes the security and operational monitoring boundary around the
read-only AI assistant and its verification providers. It does not introduce a
database migration or change business records.

## Security controls

- **RBAC:** protected routes use `requireAuth` plus role/permission middleware;
  employee permissions are checked before the handler runs.
- **Field-level permissions:** sensitive AI fields require an explicit
  `ai.sensitive.read` or `identity.sensitive.read` permission for internal
  presentation decisions. Provider-bound data is still masked even for admins.
- **Mobile and PII masking:** mobile numbers, email, PAN, Aadhaar, UPI and
  identity fields are reduced to safe placeholders before provider calls,
  tool contracts and AI audit payloads.
- **Document URL hiding:** private uploads are represented by the backend secure
  document proxy. Direct Drive URLs, signed URLs, credentials and tokens are
  never included in provider-safe AI data or telemetry.
- **Surepass rate limit:** paid verification routes share a database-backed
  `surepass-verification` limiter of 30 requests per authenticated operation per
  day. Partner KYC routes also retain their account-level onboarding limit.
  The shared counter works across API instances and server restarts.
- **Audit logs:** security events store allow-listed metadata only (actor,
  action, role, route, reason and masked field names). Raw prompts, provider
  payloads, PII, URLs, tokens and API keys are excluded.

## Monitoring controls

The reliability snapshot records safe metrics only:

- query latency: average, p50, p95 and max;
- database/tool latency: average, p50, p95 and max;
- provider latency: AI provider boundary average, p50, p95 and max;
- Surepass latency: average, p50, p95 and max;
- total failure rate and external provider failure rate;
- permission denials, clarification rate, empty-data rate and provider failure
  count;
- module/tool dimensions and safe error codes.

Telemetry writes are best-effort and never replace the business response. If
the telemetry table is unavailable during deployment, the admin snapshot
returns `telemetryStatus: data_unavailable` instead of exposing an internal
error or breaking the operator UI.

## Release checks

Before enabling AI for operators, verify:

1. backend typecheck and the AI/security tests pass;
2. no raw mobile, email, identity value, document URL, token or provider key is
   present in audit/reliability rows;
3. Surepass 429 responses include `Retry-After` and the limiter counter is
   shared by all API instances;
4. provider/query/database/Surepass latency and failure rates are visible in
   the admin reliability snapshot;
5. `AI_ENABLED=false` remains the immediate rollback switch.
