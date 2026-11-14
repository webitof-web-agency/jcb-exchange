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

Runtime quality hints are bounded and actor-scoped: low ratings can enable fixed guidance such as preferring current
sources, being concise, or avoiding sensitive detail. Raw comments and arbitrary instructions are never sent to the
provider, and this does not silently retrain the production model. Any future training pipeline requires reviewed,
redacted feedback and a release/evaluation gate.

The older offline-evaluation wording above remains valid for model-training purposes; the runtime hint is only a
bounded response-quality preference and is never a model update.

## Knowledge grounding

`knowledge.search` uses only approved, server-side sources from `AI_KNOWLEDGE_SOURCES_JSON`. Public support uses the
separate `AI_PUBLIC_KNOWLEDGE_SOURCES_JSON` allowlist and returns source-attributed answers or a human-support
handoff when no approved answer is found. Arbitrary user prompts are not converted into training data.

Endpoints:

- `POST /api/ai/feedback`
- `GET /api/ai/memory`
- `DELETE /api/ai/memory/:id`

## Phase 1 document vision

`POST /api/ai/document-assist` is an authenticated internal-operator endpoint. It accepts one
JPEG, PNG, or WEBP image in the `file` multipart field and a `documentType` form field with one
of `RC`, `PAN`, `GST`, or `FINANCE`. The image is sent to the configured OpenAI Vision model
through the existing provider boundary; it is not stored and no database migration is required.

The response is intentionally allowlisted: RC analysis may return only masked registration,
make, and model; PAN/GST analysis may return only masked identifiers; finance analysis may
return document kind, bounded amounts, currency, and a masked invoice number. Raw OCR text,
names, addresses, phone/email, bank details, unmasked identifiers, document URLs, and approval
decisions are never returned. Low-quality, undetected, or incomplete images set `reviewRequired`
to `true`.

## Phase 2

Phase 2 is implemented at the application's current data and service boundaries:

- fraud signals use source-backed identity conflicts, rejected payments, real price medians,
  reused media groups, and repeated-account thresholds; the result is an explainable review
  signal, never an automatic fraud or enforcement decision;
- `crm.call.intelligence` uses scoped `LeadActivity` call logs for outcome/topic/follow-up
  intelligence and never returns call notes or contact data;
- market intelligence and WhatsApp campaign summaries remain read-only, while campaign sends
  require approved templates, opt-in consent, and an explicit controlled-action approval;
- support answers are grounded only in approved public/internal knowledge sources and hand off
  when no approved answer exists;
- recruitment copilot provides pipeline workload guidance without candidate selection or PII;
- controlled actions use proposal -> independent human review -> execution, with audit events,
  expiry, idempotency, permission checks, and fail-closed execution errors. Domain-backed adapters
  are registered for partner KYC decisions, account status changes, payment review/refund approval,
  WhatsApp sends, lead assignment, and listing status changes.

Password resets and arbitrary financial operations remain intentionally proposal-only because they
need a dedicated reset-token or finance-service contract; they cannot be safely enabled by a
generic AI payload. Call recordings/transcripts are not stored by the application, so audio
transcription and sentiment are not claimed.

## CRM copilot coverage and file retrieval

The internal chat can answer read-only questions from the CRM pages using the operator's existing
scope:

- Dashboard: KPIs, pipeline, lead sources, follow-up agenda, team workload, and recent activity.
- Leads and Pipeline: totals, lists, scoped lead detail, lead history, follow-ups, and next-step guidance.
- Follow-ups: pending work, due status, activity, and operational trends.
- Contacts: contact list and contact 360 detail, including linked leads, pipeline, activities, deals,
  RTO, interest, and finance summaries where the operator is permitted to see them.
- Reports: lead funnel, source/type breakdown, aging, follow-up compliance, and trend/forecast questions.
- Campaigns and Segments: segment counts and campaign status/recipient counts without recipient numbers,
  message bodies, or audience identifiers.
- Import History: batch totals, created rows, duplicates, failures, and timestamps without row-level PII.

Stored-document requests are handled by `ai.documents.search`. The chat can locate permitted KYC
documents, resumes, and generated invoice PDFs. File buttons are returned only in the authenticated
portal response; the provider receives neither a file URL nor raw document contents. View/download
uses an authenticated blob request and only allow-listed internal secure-document or invoice routes.
No document is exposed merely because it exists: the operator must have the corresponding CRM, KYC,
recruitment, or accounts permission.

## Auto-sync and freshness

The exact assistant tools query live source tables. The scheduled `aiDataSync` worker probes operations, partners/KYC, finance, recruitment, communication, content, access, and subscriptions every five minutes and records safe freshness checkpoints in `AiSyncCheckpoint`.

Administrators can inspect the checkpoints through `GET /api/ai/sync`. A failed probe is isolated and does not block other modules. The worker never sends source rows to a model provider.

## Rollout

Apply the additive migration before starting the new backend build:

```text
prisma migrate deploy
```

The worker can be disabled during a canary with `AI_INTELLIGENCE_SYNC_WORKER=off`. The AI provider remains controlled by the existing AI settings and rollout flags.
