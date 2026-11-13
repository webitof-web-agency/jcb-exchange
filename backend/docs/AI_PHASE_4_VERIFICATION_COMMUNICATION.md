# AI Phase 4 — Verification and communication

Phase 4 exposes verification and communication operations through bounded, read-only AI tools. Existing verification, Surepass, WhatsApp, SMS, notification, template, campaign, and delivery services remain the source of truth.

## Supported coverage

| Area | Read-only tools | Safe output |
| --- | --- | --- |
| PAN, GST, Aadhaar, DL, RC | `verification.summary` | Permission-filtered counts by source and status; raw identifiers/results excluded |
| Surepass | `surepass.status` | Local configuration readiness and stored verification aggregates; no external lookup |
| WhatsApp integration/templates | `whatsapp.status` | Integration readiness, template status counts, automation readiness, message/outbox status |
| WhatsApp campaigns | `whatsapp.campaigns.summary` | Campaign status, template metadata, recipient counts, delivery status aggregates |
| WhatsApp/SMS delivery logs | `communication.delivery.summary` | Combined period/status/event aggregates across permitted channels |
| WhatsApp activity | `whatsapp.activity.summary` | Bounded delivery activity counts and event aggregates |
| SMS activity | `sms.activity.summary` | Integration readiness and bounded delivery/event aggregates |
| Notifications | `notifications.summary` | Signed-in operator's read/unread and type counts only |

## Safety guarantees

- Every tool is allow-listed, read-only, Zod-validated, permission-scoped, and normalized through the common AI data contract.
- Verification sources are queried only when the operator has the matching verification permission.
- Surepass status never triggers an external verification request and never returns encrypted tokens, data secrets, or provider URLs.
- WhatsApp/SMS recipient phones, message bodies, payload snapshots, provider IDs, error details, audience filters, and credentials are never returned to the AI provider.
- Campaign summaries expose counts and safe template metadata only; recipient rows are not returned.
- Notification summaries are scoped to the signed-in operator's own notifications.
- Mutation language such as send, create campaign, edit template, or retry delivery does not route to these read-only tools.
- Date windows are bounded to 90 days and returned aggregates remain within the common safe contract.

## Routing examples

- `PAN GST Aadhaar verification status batao` → `verification.summary`
- `Surepass configured hai kya` → `surepass.status`
- `WhatsApp templates ka status batao` → `whatsapp.status`
- `show WhatsApp campaigns status` → `whatsapp.campaigns.summary`
- `show WhatsApp and SMS delivery logs for last 7 days` → `communication.delivery.summary`
- `SMS delivery pichle 7 din ki batao` → `sms.activity.summary`
- `kitni notifications unread hain` → `notifications.summary`

No database migration, write, delete, campaign send, template mutation, or external provider lookup is performed by Phase 4 read-only tools.
