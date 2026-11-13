# JCB Exchange AI — Phase 0 Module Inventory and Safety Audit

Audit date: 2026-11-13 (Asia/Calcutta)  
Audit mode: read-only repository inspection  
Status: **COMPLETE as an inventory/audit**

This document is the Phase 0 baseline for the AI question-and-answer system. It maps the current application surface before new AI tools are added. It does not delete data, update live records, run a migration, change permissions, or change existing business workflows.

## 1. Evidence snapshot

| Area | Current repository evidence |
|---|---|
| Backend | Express/TypeScript application under `backend/src` |
| Database | PostgreSQL through Prisma; schema is `backend/prisma/schema.prisma` |
| Prisma schema | 192 models, 151 enums, 5,629 schema lines |
| Backend routes | 31 route files; 428 handlers in route files; 259 handlers in CRM/Finance Hub module routers; 687 handler declarations total |
| Backend controllers | 43 controller files |
| Backend services | 115 non-test TypeScript implementation files; 74 `*.service.ts` implementation files; 20 non-test AI service files |
| Admin portal | 181 Next.js pages: 77 employee, 83 admin, 13 partner, 2 auth, 6 public/other |
| Public frontend | 29 Next.js pages under `frontend/src/app` |
| Mobile app | 8 TypeScript/JavaScript source files under `JCB-Exchange/src`; no AI database tool access is exposed there |
| Admin permissions | 175 permission literals in `backend/src/utils/adminPermissions.ts`, plus role and `ALL_ACCESS` handling |
| AI registry | 28 allow-listed read-only tools in `aiReadOnlyTools.service.ts` |

Counts are repository counts captured on the audit date. The route handler count is a source scan count, not a claim that every endpoint is healthy in production.

## 2. Runtime and data boundaries

| Boundary | Source of truth | AI Phase 0 decision |
|---|---|---|
| Internal API | `backend/src/app.ts`, `backend/src/routes/index.ts` | Keep existing routes as source of truth; AI does not bypass auth |
| Database | Prisma client in `backend/src/lib/prisma.ts` and PostgreSQL | AI may read only through registered, bounded tools |
| Provider configuration | AI settings service and encrypted runtime settings | Never expose provider keys to the model, UI response, or audit payload |
| Verification provider | `surepassClient` plus verification services/history | Existing stored results are readable only through a dedicated permissioned tool; live lookup must be an explicit future tool |
| Messaging providers | WhatsApp/SMS integration and outbox services | AI can summarize status/activity; it cannot send or mutate through read-only tools |
| File/document storage | document services, upload storage, Google Drive services | Document contents/URLs/tokens are not provider-safe by default |
| Frontends | employee/admin/partner portals, public frontend, mobile app | Frontend context is a hint only; backend re-checks identity and permission |

## 3. Backend route inventory

The API is mounted under `/api` in `backend/src/app.ts`. The following route files are currently present; the number is the source-scan count of HTTP handler declarations in each file.

| Route file | Base area | Handlers |
|---|---|---:|
| `auth.routes.ts` | `/auth` | 44 |
| `superadmin.routes.ts` | `/superadmin` | 82 |
| `master.routes.ts` | `/master` | 29 |
| `listing.routes.ts` | `/listings` | 20 |
| `recruitment.routes.ts` | `/recruitment` | 89 |
| `document.routes.ts` | `/documents` | 18 |
| `whatsapp.routes.ts` | `/whatsapp` | 19 |
| `sms.routes.ts` | `/sms` | 13 |
| `notification.routes.ts` | `/notifications` | 9 |
| `panVerification.routes.ts` | `/pan-verification` | 9 |
| `aadhaarVerification.routes.ts` | `/aadhaar-verification` | 8 |
| `analytics.routes.ts` | `/analytics` | 7 |
| `lead.routes.ts` | `/leads` | 7 |
| `finance.routes.ts` | `/finance` | 7 |
| `drivingLicenseVerification.routes.ts` | `/driving-license-verification` | 5 |
| `gstVerification.routes.ts` | `/gst-verification` | 5 |
| `rcOwnerHistory.routes.ts` | `/rc-owner-history` | 5 |
| `vehicleDocs.routes.ts` | `/vehicle-docs` | 5 |
| `blog.routes.ts` | `/blogs` | 4 |
| `location.routes.ts` | `/locations` | 3 |
| `chassisToRcVerification.routes.ts` | `/chassis-to-rc` | 3 |
| `mobileToPanLookup.routes.ts` | verification lookup | 3 |
| `rcChallanVerification.routes.ts` | `/rc-challan-verification` | 3 |
| `rcMobileNumberCheck.routes.ts` | RC/mobile lookup | 3 |
| `rcToMobileVerification.routes.ts` | `/rc-to-mobile` | 3 |
| `publicInvoice.routes.ts` | `/public` | 3 |
| `apiWalletBilling.routes.ts` | `/api-billing` | 1 |
| `verificationHistory.routes.ts` | `/verification-history` | 1 |
| `apiWalletBillingWebhook.routes.ts` | `/api/api-billing/webhook` | 1 |
| `whatsappWebhook.routes.ts` | `/api/whatsapp/webhook` | 2 |
| `ai.routes.ts` | `/ai` | 17 |

Additional module routers are mounted by `routes/index.ts`:

- `/crm` → `backend/src/modules/crm/routes.ts` — 57 handler declarations.
- `/finance-hub` → `backend/src/modules/finance-hub/routes.ts` — 202 handler declarations.
- `/users/fcm-token` → authenticated notification endpoint.

## 4. Frontend page inventory

### Employee/admin portal groups

The employee portal has 77 pages. The admin portal mirrors most of the same domains and has 83 pages. The employee group counts are:

`accounts: 10`, `ai: 1`, `analytics: 2`, `blogs: 1`, `brands: 1`, `categories: 1`, `crm: 10`, `customers: 2`, `dashboard: 1`, `driving-license-verification: 1`, `enquiries: 2`, `finance: 4`, `footer: 1`, `gst-verification: 1`, `identity-hub: 2`, `invoices: 1`, `listings: 3`, `notifications: 1`, `pan-verification: 1`, `partner-agreements: 1`, `partners: 4`, `profile: 1`, `recruitment: 11`, `recurrence: 1`, `settings: 1`, `sms: 1`, `tasks: 1`, `translations: 1`, `users: 2`, `vehicle-transport: 2`, `verifications: 2`, `visitors: 2`, `whatsapp: 1`.

The complete page paths are present under:

- `admin-portal/src/app/(admin)/employee`
- `admin-portal/src/app/(admin)/admin`
- `admin-portal/src/app/(partner)/partner`

Dynamic detail pages were included in the counts, including listing, lead, customer, partner, visitor, finance, RTO, sell-account, recruitment application/job, payment and verification details.

### Public frontend and mobile

The public frontend has pages for machines, sold machines/vehicles, dealers, jobs/applications, blog, partner signup, customer profile/listings/applications, payments, RC verification, notifications, support and policies. It is mapped separately from the internal AI surface.

The React Native project under `JCB-Exchange` has `assets`, `config`, `lib`, `screens` and `types`. It is not allowed to call internal AI tools directly; any future mobile assistant must use the authenticated backend AI route.

## 5. Domain/data-source matrix

| Domain/page family | Backend source | Prisma data source | Current AI coverage | Phase 0 finding |
|---|---|---|---|---|
| Dashboard and analytics | `analytics.routes.ts`, `analytics.controller.ts`, admin dashboard queries | `AnalyticsEvent`, `ListingPaymentSubmission`, `SaleRecord`, `FinanceTransaction`, `Lead`, `Listing` | `dashboard.summary`, `inventory.trend`, `revenue.summary`, `finance.trend`, `partner.performance` | Summary exists; analytics drill-down and report-specific tools are missing |
| Listings, inventory and sold vehicles | `listing`, `listingBill`, `sellAccount`, analytics and vehicle-sale services | `Listing`, `ListingVehicleVerification`, `Media`, `ListingBill`, `ListingPaymentSubmission`, `SaleRecord`, `SellAccount` and related payment/refund/status models | `listing.summary`, `listing.statistics`, `listing.search`, `listing.detail`, `sold.vehicles`, `inventory.trend` | Core coverage exists; more filters, complete list pagination, payment/invoice and history tools are required |
| Vehicle identity and documents | vehicle identity/verification services, `vehicleDocs.routes.ts`, document routes | `ListingVehicleVerification`, `Media`, `VehicleRtoRecord`, document-related records | `vehicle.identity`, `rto.documents.summary` | Sensitive identity values are correctly restricted; document detail/history tool is missing |
| RTO and transport | `rto.controller.ts`, `rtoTransfer`, `listingRto`, vehicle transport routes | `VehicleRtoRecord`, `VehicleRtoStatusLog`, `RtoTransferTask`, `RtoTransferTaskLog`, linked `Listing`/`SellAccount` | `rto.pending.tasks`, `rto.documents.summary` | Pending summary exists; per-vehicle timeline, ownership/transfer detail and exceptions are missing |
| Partners, agreements and deposits | partner/admin/auth/partner-agreement controllers and services | `PartnerProfile`, `PartnerTeamMember`, `PartnerAgreement`, `PartnerAgreementDefinition`, `PartnerDeposit`, `PartnerSignupGstVerification` | `partner.statistics`, `partner.performance` | Aggregate coverage exists; partner detail, agreement, deposit, KYC and inventory tools are missing |
| CRM, leads, contacts and enquiries | CRM module routes/services plus legacy lead routes | `Lead`, `LeadActivity`, `CrmContactProfile`, `CrmContactActivity`, `CrmFollowUp`, `CrmPipelineStage`, `CrmSegment`, `CrmAssignmentRule`, `CrmImportBatch`, `CrmSettings` | `crm.leads.summary`, `crm.lead.detail`, `lead.statistics`, `crm.followups`, `hot.leads` | Lead summary/detail exists; contact, campaign, import, pipeline and activity search require dedicated tools |
| Customers and visitors | admin/customer/visitor controllers and pages | `User` and linked `Lead`, `CustomerPrimeSubscription`, activity/notification records | No dedicated customer/visitor tools | Missing; must be permission- and PII-aware |
| KYC and verification | PAN/GST/Aadhaar/DL/RC routes/services and verification history | `PanVerificationRecord`, `GstVerificationRecord`, `AadhaarVerificationRecord`, `DrivingLicenseVerificationRecord`, RC/chassis/mobile records, `KycDocument`, `KycReviewLog` | `pending.kyc`, `verification.summary`, `surepass.status` | Status summaries exist; per-record safe detail and explicit Surepass lookup policy are missing |
| WhatsApp, SMS and notifications | integration, campaign, audience, outbox and webhook services/controllers | WhatsApp settings/templates/rules/log/outbox/consent/campaign models; SMS settings/rules/log/outbox; `Notification`, `NotificationPreference` | `whatsapp.activity.summary`, `whatsapp.status`, `sms.activity.summary`, `notifications.summary` | Status summaries exist; template, campaign, recipient, delivery and failure-detail tools are missing |
| Recruitment/HR | `recruitment.controller.ts` and recruitment routes/services | Job, department, candidate, application, answers, documents, stages/history, notes, ratings, interviews/feedback, offers, templates/logs | `recruitment.summary` | Only summary exists; job/application/candidate/interview/offer detail tools are missing |
| Finance, invoices and payments | finance routes/controller, listing bills, vehicle-sale invoice/payment services | `FinanceTransaction`, `FinanceImportBatch`, `ListingBill`, `SaleRecord`, `SellAccountPayment`, invoice/receipt models and finance-hub models | `revenue.summary`, `finance.trend` | Trend/summary exists; invoice/payment/refund/reconciliation/detail tools are missing |
| Finance Hub accounting | `modules/finance-hub` routes/services | all `Fin*` models: accounts, vouchers, documents, parties, banking, payroll, tax, close, reports and audit | No dedicated accounting tools | Large uncovered read-only domain; must be permission-scoped and period-aware |
| Journal/trading | finance-hub/trading services and routes | `Jt*` models for company, accounts, bills, stock, vehicles, settlements, vouchers and audit | No dedicated tools | Uncovered domain; keep separate from finance summary until canonical source is selected |
| Master data and geography | `master`, `location`, translation controllers | `Category`, `CategoryIcon`, `Brand`, `Model`, `Country`, `State`, `City`, translation registry/overrides | No dedicated tools | Missing; safe read-only lookup can support future question routing |
| Content and CMS | blog, blog-question, footer and translation controllers | `BlogPost`, `BlogQuestion`, `TranslationKeyRegistry`, `TranslationOverride`, runtime settings | No dedicated tools | Missing; content mutation must never be exposed as read-only AI access |
| Users, roles, settings and security | admin/role/auth/settings controllers | `User`, `AdminProfile`, `CustomRole`, `AdminPermission`, `PlatformRuntimeSettings`, OTP/reset models | No dedicated tools | Missing and highly sensitive; only aggregate operational status may be considered later |
| AI control plane | `ai.controller.ts`, `aiAutomation.controller.ts`, AI settings and jobs | `AiRun`, `AiConversation`, `AiConversationMessage`, `AiToolCall`, `AiFeedback`, `AiActionProposal`, `AiApproval`, `AiDailyBriefing`, `AiReliabilityEvent`, budget/rate-limit/audit models | 28 read-only tools plus status/models/history/observability/action routes | Tool telemetry exists; complete AI-health, cost and audit answers need explicit admin-only tools |

## 6. Current AI read-only registry

The current registry contains exactly these 28 tools:

`dashboard.summary`, `pending.kyc`, `hot.leads`, `crm.leads.summary`, `crm.lead.detail`, `lead.statistics`, `listing.summary`, `listing.statistics`, `listing.detail`, `vehicle.identity`, `sold.vehicles`, `inventory.trend`, `revenue.summary`, `partner.statistics`, `partner.performance`, `finance.trend`, `forecast.operations`, `rto.pending.tasks`, `rto.documents.summary`, `crm.followups`, `recruitment.summary`, `listing.search`, `whatsapp.activity.summary`, `verification.summary`, `surepass.status`, `whatsapp.status`, `sms.activity.summary`, `notifications.summary`.

The registry uses Zod argument schemas, permission checks, bounded execution, the common AI data contract, field sanitization, tool audit metadata and reliability telemetry. This is the current AI surface, not full application coverage.

### Explicit AI coverage gaps found in Phase 0

The following are not yet registered as dedicated read-only tools:

- Customer, visitor, contact, campaign, import and CRM pipeline details.
- Partner detail, partner agreement, deposit, KYC and inventory drill-down.
- Listing payment, invoice, sell-account, refund, RTO timeline and document detail.
- Individual verification record history and safe result detail.
- WhatsApp/SMS template, campaign, recipient, outbox and delivery-failure details.
- Recruitment job, candidate, application, interview, offer and stage-history details.
- Finance invoice/payment/reconciliation detail and Finance Hub accounting reports.
- Journal/trading stock, vehicle, settlement and voucher details.
- Master data, content, translations, user/role/settings and AI cost/health views.

## 7. Permission inventory

The permission source of truth is `backend/src/utils/adminPermissions.ts` and the role scope is loaded by `auth.middleware.ts` and `aiAccess.middleware.ts`.

| Permission family | Count/coverage |
|---|---:|
| Legacy/root capabilities | 14 literals including `ALL_ACCESS` and legacy management flags |
| Users and roles | 8 |
| Listings, partners, visitors, categories, brands | 24 |
| KYC/settings/messaging/content/dashboard/AI/analytics/finance | 24 |
| CRM | 10 |
| Finance Hub (`fh.*`) | 33 |
| Verification services | 8 |
| RTO/tasks/sell accounts | 20 |
| Recruitment | 39 |
| Other named families | 15 |
| **Total permission literals** | **175** |

AI access is restricted to internal `SUPER_ADMIN`, `ADMIN`, or permitted `EMPLOYEE` users. `ai.use` controls assistant access; `ai.manage` controls shared provider settings; `ai.sensitive.read` and `identity.sensitive.read` are explicit sensitive-field capabilities. Provider-safe serialization still masks sensitive values even when an internal UI may later be allowed to reveal them.

## 8. Sensitive-field classification

### Always provider-blocked or redacted

- Provider/API credentials: `apiKey`, `accessToken`, `refreshToken`, `providerToken`, `secret`, `password`, `passwordHash`, `authorization`, `cookie`, `signature`, private keys and encrypted credential payloads.
- Direct PII: user/partner/customer/lead/candidate email, mobile/phone, personal address, date of birth, document holder/owner/buyer/seller names where not required for the answer.
- Identity values: PAN, Aadhaar, GSTIN, driving licence, RC/registration, chassis, engine and owner-history values unless an explicit future field policy permits a masked form.
- Financial secrets: bank account, IFSC, UPI, card/CVV, salary/payroll values, payment tokens, UTR/transaction secrets and provider billing credentials.
- File/document access: signed URLs, download tokens, document URLs, cookies, webhook signatures and authorization headers.

### Potentially safe only after per-tool allowlisting

Listing title, brand/model/category, status, city/state, public-facing price, non-sensitive operating facts, partner business name/code, aggregate counts, invoice/business identifiers, job title, application stage and delivery status.

The existing controls are `sanitizeAiToolData`, `redactSensitiveData`, encrypted settings storage and metadata-only AI audit persistence. New fields must be reviewed by allowlist; adding a field to Prisma does not automatically make it AI-safe.

## 9. Duplicate and source-of-truth review

No service or data was deleted during this audit. The following overlaps are documented for later consolidation:

| Overlap | Evidence | Decision |
|---|---|---|
| Listings | listing service/controller, admin/analytics queries, vehicle-sale/RTO services and AI scoped reads | Keep existing workflows; later introduce a canonical read repository for AI |
| Leads/CRM | legacy lead controller/service plus `modules/crm` services/routes and analytics queries | Do not merge blindly; define one canonical read model in a later phase |
| Partners | auth/admin/partner agreement/KYC/signup services and direct admin queries | Preserve existing mutation paths; create permissioned read adapters |
| Finance | legacy finance controller, listing/sale-account finance, and Finance Hub | Keep domains separate until reconciliation rules are documented |
| Verification | individual verification services, cache/history, Surepass client and API billing | AI must distinguish stored history from a new provider lookup |
| Messaging | WhatsApp/SMS integration, audience, campaign, outbox and webhook paths | AI summary must read logs/status, never infer delivery from configuration |

Architecture finding: several legacy/domain controllers directly import Prisma instead of consistently going through a repository/service boundary. This is a refactoring backlog item, not a Phase 0 deletion or rewrite. AI tools must not copy those mutation paths; future tools should use bounded read adapters.

## 10. Index and query review

The schema contains indexes for major listing, identity, lead, RTO, AI conversation/tool and telemetry paths, and the local migration tree contains the performance-index and AI observability migrations. Phase 0 does not claim that every production query plan is optimal: production-sized `EXPLAIN` checks require a controlled read-only database review. No index was added or removed in this audit.

## 11. Phase 0 completion checklist

- [x] Actual backend route files and mounted route groups mapped.
- [x] Backend controllers and service implementation surface counted.
- [x] Employee/admin/partner/public/mobile page surfaces mapped.
- [x] Prisma model and enum inventory counted and domain-grouped.
- [x] Permission source and AI-specific permission boundary recorded.
- [x] Sensitive-field categories and existing redaction controls recorded.
- [x] Data sources and external provider boundaries recorded.
- [x] Existing AI registry compared against actual modules.
- [x] Duplicate/overlapping source paths documented without deleting anything.
- [x] Index/query review limits and migration safety recorded.
- [x] No live database write, deletion, reset, `db push`, or migration execution performed.

## 12. Phase 0 result and next gate

**Phase 0 is complete as an inventory audit.** It is not a claim that every module already has an AI tool. The gaps above are the implementation backlog for Phase 1 onward.

Next gate: build the canonical question catalog and tool matrix from this document. Each new tool must have a dedicated read-only backend adapter, Zod input, permission check, allowlisted projection, empty/unavailable fallback, audit/latency telemetry and English/Hindi/Hinglish test cases before being marked complete.
