# AI Test Results - Sold Vehicles

**Audit scope:** Phases 1-10  
**Audit date:** 2026-11-18

## Persistent discovery and mapping checks

| Check | Result | Evidence |
|---|---|---|
| Admin/employee Sold Vehicles routes and page files | PASS | `PROJECT_INVENTORY.md` and source scan |
| Sell-account APIs and direct Prisma models | PASS | `PROJECT_INVENTORY.md` and `PHASE_2_FIELD_SOURCE_MAP.md` |
| Listing, SaleRecord, payment-submission and partner bridges | PASS | `MODULE_RELATIONSHIPS.md` |
| CRM, RTO, Documents, Finance and Communication edges | PASS | `MODULE_RELATIONSHIPS.md` |
| Existing AI tools and router behavior | PASS | `AI_MODULE_REGISTRY.md` and `AI_QUESTION_TOOL_MAP.md` |
| Machine-readable registry parse | PASS | `MODULE_REGISTRY.json` parsed successfully; 8 module entries |
| Field-to-source map and question-to-tool map | PASS | Phase 2 artifacts present |

## Runtime tests

| Check | Result | Evidence |
|---|---|---|
| Exact record-number read model | PASS | `soldVehicleDetailAi.service.test.ts` |
| Exact UUID/record router | PASS | `aiIntentRouter.service.test.ts` |
| Registration/chassis/invoice search | PASS | `soldVehicleSearchAi.service.test.ts` |
| Formatted identity normalization | PASS | Search test for `CG-04-AB-1234` -> `CG04AB1234` |
| Ambiguous matches do not select a detail record | PASS | Search ambiguity test |
| Missing identifier/query fails closed | PASS | Detail/search validation tests |
| Complete joined projection | PASS | Payments, refunds, RTO, documents, CRM/listing and Finance fixture assertions |
| Sold Vehicle financial reconciliation | PASS | Purchase/sale/expenses, GST, margin, profit/loss, customer/seller balances, refunds, draft-vs-real receipts and duplicate prevention |
| Exact-detail financial wiring | PASS | `soldVehicleDetailAi.service.test.ts` exposes the canonical reconciliation in the database-backed read model |
| Phase 6 operational projection | PASS | `soldVehicleOperationalAudit.service.test.ts` - 3/3 tests |
| Status and lock history projection | PASS | Exact status actor/timestamp mapping plus persisted `SellAccountLockHistory`; legacy lock snapshot is explicitly labelled |
| Refund maker-checker audit | PASS | Requested/approved/rejected/paid actors and timestamps are projected from source rows |
| Bank/drawn-on and internal notes | PASS | Payment/refund bank fields and source-labelled deal/RTO/Finance/sale/refund notes |
| WhatsApp/SMS delivery audit | PASS | Per-deal and payment receipt logs include provider status, outbox attempts, delivery/read times and errors |
| Online advance/listing mapping | PASS | `ListingPaymentSubmission` is mapped through `SellAccountPayment.listingPaymentId`; unmatched bridges are reported |
| Phase 7 connected-module projection | PASS | `soldVehicleConnectedModules.service.test.ts` - 2/2 tests |
| Wrong-key and duplicate exclusion | PASS | Listing/CRM/RTO/Finance/communication keys are checked; rejected rows and duplicate counts are returned |
| Exact-detail connected-module wiring | PASS | `soldVehicleDetailAi.service.test.ts` - connected listing, CRM, RTO and Finance assertions pass |
| Phase 6 migration deployment | PASS | Prisma reported both pending migrations applied and database schema up to date |
| Financial reconciliation unit suite | PASS | `soldVehicleFinancialReconciliation.service.test.ts` - 2/2 tests |
| Secret/hash/signing/file URL exclusion | PASS | Detail projection and Phase 7 sensitive-field matrix |
| Tool registry and permission boundary | PASS | `aiReadOnlyTools.service.test.ts` and Phase 7 matrix |
| Exact-deal follow-up context | PASS | Router context tests |
| Full Phase 7 matrix | PASS | `npm run test:ai:phase7` - 13/13 subtests |
| Backend TypeScript validation | PASS | `npm run typecheck` |
| Phase 4 router/context/validation suite | PASS | 122/122 targeted AI tests |
| Empty-result provider bypass | PASS | `aiResponseValidation.service.test.ts` and read-only tool tests |
| Persisted selected-tool context | PASS | `aiConversation.service.test.ts` and router follow-up test |
| Prisma schema validation | PASS | `npx prisma validate` |
| Phase 6 exact-detail wiring | PASS | `soldVehicleDetailAi.service.test.ts` - 6/6 targeted detail/operational tests |
| Full backend suite at historical Phase 5 checkpoint | 1070 passed, 4 date-fixture failures | The Finance Hub day-range fixtures were hard-coded to 2026-11-17 and were subsequently made date-relative. |

## Phase 8 document delivery validation

| Check | Result | Evidence |
|---|---|---|
| Exact generated/stored document actions | PASS | `soldVehicleDocumentActions.service.test.ts` |
| Internal file route allowlist | PASS | `aiUiActions.service.test.ts` |
| Draft/unpaid/missing document exclusion | PASS | Phase 8 action test |
| Vehicle document checklist and ZIP inputs | PASS | `vehicleDocs.service.test.ts` |
| Money receipt PDF rendering | PASS | `vehicleSaleDocumentsPdf.test.ts` |
| Bill of Supply PDF rendering | PASS | `vehicleSaleDocumentsPdf.test.ts` |
| Delivery challan PDF rendering | PASS | `vehicleSaleDocumentsPdf.test.ts` |
| Phase 8 targeted suite | PASS | 19/19 tests |
| Backend TypeScript validation | PASS | `npm run typecheck` |
| Current full backend suite | PASS | 1094/1094 tests passed after Phase 10 validation, communication configuration checks and selected Sold Vehicle page-context/raw operational detail fixes |
| Prisma schema validation | PASS | `npx prisma validate` |
| Prisma migration status | PASS | 117 migrations found; database schema is up to date |
| WhatsApp generated PDF contract | PASS (local) | Existing payment/invoice integration path uploads generated PDF as Meta `DOCUMENT`; live provider callback remains external |
| SMS document contract | PASS (local) | Existing SMS path sends configured receipt/invoice link; live provider delivery remains external |

## Phase 9 intelligence validation

| Check | Result | Evidence |
|---|---|---|
| Sold Vehicle financial/operational analytics | PASS | `soldVehicleAnalytics.service.test.ts` covers overview, profit/loss, payments, seller balance, refunds, RTO, documents, collection risk, low margin and model grouping |
| Revenue and cash-flow forecast | PASS | Forecast test covers daily bands, date ranges, assumptions, confidence and explicit insufficient-data state |
| Exact older deal lookup | PASS | Analytics service test confirms an exact deal is not removed by the default period window |
| Previous-period comparison | PASS | Analytics service test confirms selected and equal-length previous periods are separate and comparable |
| Phase 9 router metrics | PASS | `aiIntentRouter.service.test.ts` - 64/64 tests passed, including regression for generic search/detail/list and forecast routes |
| Phase 9 tool registry and validation | PASS | `aiReadOnlyTools.service.test.ts` plus analytics tests - 36/36 tests passed |
| Invalid/reversed date handling | PASS | Zod tool schema and service date validation fail closed |
| TypeScript validation | PASS | `npm run typecheck` |
| Prisma migration requirement | PASS | No schema change in Phase 9; migration status remains the Phase 8 up-to-date state |

## Phase 10 full regression and production validation

| Check | Result | Evidence |
|---|---|---|
| Executable Phase 10 validator | PASS locally / INCOMPLETE overall | `npm run validate:ai:phase10` reads the configured database and emits a fail-closed report; the current communication gate identifies two missing Sold Vehicle SMS DLT rules |
| Actual source/detail comparison | PASS | Selected `SA-2026-001`; 14 source fields/relationship values, 0 mismatches |
| Actual analytics/detail financial comparison | PASS | Purchase, sale, expenses, profit and customer outstanding, 0 mismatches |
| Representative question routing | PASS | 6 Sold Vehicle/search/analytics questions, 6/6 correct |
| Existing full regression after Phase 10 fixes | PASS | `npm test` - 1094/1094 tests passed after the SMS projection, communication configuration, document-routing, page-context and raw operational detail fixes |
| Sold Vehicle page-context wiring | PASS | List/detail/edit route tests - selected record ID is carried into generic exact-detail follow-ups |
| PDF renderer/document action contract | PASS | Money receipt, invoice/BOS, credit note, refund advice, delivery challan and route/action tests |
| SMS schema-backed detail query | PASS | Regression confirms no nonexistent `deliveredAt`/`readAt` selection |
| Authenticated browser preview/download | NOT RUN | Requires a running authenticated portal session |
| Live WhatsApp/SMS delivery callback | NOT RUN | Requires both Sold Vehicle SMS DLT rules to be configured, then an approved real provider send and callback/log evidence |

## External verification still not run

| Check | Result | Reason |
|---|---|---|
| Representative live/staging database comparison | NOT RUN | Requires a selected database environment and sample deal IDs |
| Authenticated portal file preview/download | NOT RUN | Requires running portal session/browser or API test environment |
| WhatsApp/SMS provider delivery audit comparison | BLOCKED BY CONFIG | WhatsApp is configured; Sold Vehicle SMS invoice/receipt DLT message IDs are absent and the rules are disabled in the configured database |
| Extended CRM activity/follow-up timeline | NOT RUN | Next cross-module timeline scope |

These external checks are the only remaining gates before the module can be labelled `verified`; the Phase 1-9 repository contracts and local runtime tests are complete.
