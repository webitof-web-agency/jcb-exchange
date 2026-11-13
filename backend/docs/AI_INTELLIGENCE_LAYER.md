# AI Intelligence Layer

This layer extends the Phase 0–9 assistant without giving a model direct database access.

## Runtime boundary

1. The authenticated operator message is normalized and checked for mutation or prompt-injection intent.
2. The allow-listed read-only tool reads the source tables with the operator's existing RBAC scope.
3. The result is converted to the existing safe data contract and provider-safe field policy.
4. The model receives only the redacted tool contract, bounded conversation context, and actor-scoped approved memory.
5. The response is sanitized, audited by metadata/hash, and returned with source/freshness metadata.

The provider never receives raw rows, passwords, API keys, tokens, document URLs, full mobile numbers, or verification secrets.

## Forecasting

`forecast.operations` supports these bounded metrics:

- `sales`
- `inventory`
- `finance`
- `collections`
- `leads`
- `kyc`
- `partners`

The deterministic baseline uses recent activity, linear trend, residual uncertainty, a bounded horizon, a confidence score, and an explicit insufficient-data status. Forecasts are directional and are not treated as guaranteed outcomes.

## Memory and learning boundary

Ordinary prompts remain short-lived conversation context. Only explicit requests such as “remember that…” are eligible for actor-scoped memory. Values are redacted and hashed before persistence, and memory is bounded to ten items when sent to a provider.

The feedback endpoint stores a 1–5 rating and redacted comment against the operator's own AI run. This is an offline evaluation signal; it does not silently retrain or modify the production model. A future model-training pipeline must use reviewed, redacted feedback and a release/evaluation gate.

Endpoints:

- `POST /api/ai/feedback`
- `GET /api/ai/memory`
- `DELETE /api/ai/memory/:id`

## Auto-sync and freshness

The exact assistant tools query live source tables. The scheduled `aiDataSync` worker probes operations, partners/KYC, finance, recruitment, communication, content, access, and subscriptions every five minutes and records safe freshness checkpoints in `AiSyncCheckpoint`.

Administrators can inspect the checkpoints through `GET /api/ai/sync`. A failed probe is isolated and does not block other modules. The worker never sends source rows to a model provider.

## Rollout

Apply the additive migration before starting the new backend build:

```text
prisma migrate deploy
```

The worker can be disabled during a canary with `AI_INTELLIGENCE_SYNC_WORKER=off`. The AI provider remains controlled by the existing AI settings and rollout flags.
