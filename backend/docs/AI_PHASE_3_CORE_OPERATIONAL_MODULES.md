# AI Phase 3 — Core operational modules

Phase 3 exposes the core operational modules through the existing read-only AI tool boundary. Existing routes and services remain the source of truth; no database migration or write workflow is introduced.

## Supported module coverage

| Module | Read-only tools | Data source / scope |
| --- | --- | --- |
| Dashboard | `dashboard.summary` | Aggregated Prisma counts and operational KPIs |
| Listings | `listing.summary`, `listing.statistics`, `listing.detail`, `listing.search` | Existing listing and CRM inventory services; bounded rows |
| Inventory | `inventory.trend` | Listing creation and status aggregates |
| Sold vehicles | `sold.vehicles` | Existing sold listing/finance projections |
| Vehicle identity | `vehicle.identity` | Existing identity matching service; raw RC/engine/chassis/owner values masked |
| Documents / RTO | `rto.documents.summary`, `rto.pending.tasks` | RTO records and transfer tasks; document URLs are never returned |
| Partners | `partner.statistics`, `partner.performance` | Partner profile and listing aggregates |
| CRM / Leads | `crm.leads.summary`, `crm.lead.detail`, `lead.statistics`, `crm.followups`, `hot.leads` | Existing CRM access scope; partner/employee ownership rules preserved |
| Customers / Visitors | `customer.summary`, `customer.detail` | `User` records with `role=CUSTOMER`; contact PII is masked |
| Enquiries | `enquiry.summary`, `enquiry.detail` | Existing scoped CRM `Lead` records; safe listing context only |
| Tasks | `tasks.summary` | Scoped CRM follow-ups plus RTO transfer tasks |

## Safety guarantees

- Every tool is allow-listed and read-only.
- Every request is validated with Zod before the service is called.
- Existing permission and CRM row-scope checks are reused.
- Customer summaries/details use visitor-wide access only for `visitors.read` or admin access; CRM-only users remain restricted to their existing contact, lead, and follow-up scopes.
- Results are normalized through the common AI data contract, including bounded pagination and safe limits.
- Customer names, mobile numbers, email addresses, notes, document URLs, credentials, and raw identity fields remain provider-masked.
- A name/city customer search that matches multiple records returns `AI_TOOL_AMBIGUOUS`; the system does not guess.
- Empty results, unavailable data, provider failures, invalid arguments, and permission denials remain distinct contract statuses.
- Task summaries expose safe task metadata only; CRM notes and RTO proof/document payloads are excluded.
- Tool execution audit and latency telemetry continue to record the tool/module outcome without storing raw user messages or secrets.

## Natural-language routing

The router and question catalog now recognize English, Hindi/Hinglish aliases, spelling mistakes, and WhatsApp-style wording for customer, enquiry, and task questions. Examples:

- `show all customers and visitors` → `customer.summary`
- `customer Ramesh ka detail batao` → `customer.detail`
- `crm ki enquiries dikhao` → `enquiry.summary`
- `enquiry details for JCB 3DX` → `enquiry.detail`
- `pending tasks ka summary batao` → `tasks.summary`

Mutation language continues to fail closed and is not routed to these read-only tools.

## Database safety

Phase 3 uses existing Prisma models and services only. It does not run `prisma migrate`, `db push`, deletes, updates, or backfills. Production data remains unchanged.
