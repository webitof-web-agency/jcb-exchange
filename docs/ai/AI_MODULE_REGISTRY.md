# AI Module Registry - Sold Vehicles Discovery

**Status:** Phases 1-10 local runtime and configured-database validation integrated; production browser/provider verification pending  
**Updated:** 2026-11-18  
**Machine-readable companion:** `docs/ai/MODULE_REGISTRY.json`

## Registry rule

`discovered` means the source surface exists in the repository. `partial` means an AI tool exists but does not cover the complete module contract. `pending` means implementation is required before the AI can promise that capability. `verified` is reserved for live/staging database comparison and regression evidence.

## Module registry

| Module key | Portal surface | Canonical source | Existing AI | Coverage now | Target |
|---|---|---|---|---|---|
| `sold-vehicles` | admin/employee Accounts -> Sold Vehicles | SellAccount family plus Listing/SaleRecord | `sold.vehicles`, `sold.vehicle.search`, `sold.vehicle.detail`, `sold.vehicle.analytics`, related aggregate tools | implemented, configured sample verified | production browser/provider evidence |
| `listings-inventory` | Listings and listing detail | Listing, Media, ListingPaymentSubmission | listing tools, inventory trend | partial | verified listing/sale linkage |
| `crm` | CRM leads, contacts, activities, follow-ups | Lead and CRM module | CRM tools | partial | verified Sold Vehicle lead/customer linkage |
| `partners` | partner/dealer records | PartnerProfile and partner services | partner tools | partial | verified seller/partner linkage |
| `rto-work` | RTO Work list/detail | VehicleRtoRecord and transfer-task family | RTO tools | partial | verified deal/RTO/task/document linkage |
| `finance-hub` | finance workspace and modules | Fin* entities and finance-hub services | finance page/trend/tools | partial | verified voucher/document/settlement linkage |
| `documents` | vehicle documents, deeds, KYC, PDFs | document services and JSON document slots | document search and selected file actions | partial | verified file lookup/preview/download |
| `communications` | WhatsApp/SMS delivery | delivery JSON and messaging services/logs | selected invoice/receipt actions | partial: WhatsApp ready; Sold Vehicle SMS DLT rules missing in configured DB | verified per-file delivery audit |

## Phase 1/2/3 artifacts

- Field-level database sources: `docs/ai/PHASE_2_FIELD_SOURCE_MAP.md`
- Question-to-tool contract: `docs/ai/AI_QUESTION_TOOL_MAP.md`
- Relationship graph and identity rules: `docs/ai/MODULE_RELATIONSHIPS.md`
- Exact detail implementation contract: `docs/ai/PHASE_3_SOLD_VEHICLE_DETAIL.md`

The Phase 1 inventory and Phase 2 mapping are complete for the repository scope. `sold.vehicle.search` resolves identifiers safely, `sold.vehicle.detail` provides the exact joined read model, and `sold.vehicle.analytics` provides grounded Phase 9 metrics and forecasts. The configured database sample and local regression are verified; production browser/provider evidence remains external before the status can become `verified`.

## Sold Vehicles sub-surfaces

| Sub-surface | Database/source | AI state |
|---|---|---|
| identity and parties | SellAccount identity fields | exact search/detail tools |
| purchase/sale terms | SellAccount amounts, types and exchange fields | exact detail tool |
| expense and GST | SellAccount finance fields plus canonical finance helpers | exact detail plus aggregate tools |
| customer receipts | SellAccountPayment | exact detail tool with receipt file action |
| seller payments | SellAccountPayment | exact detail tool |
| refunds | SellAccountRefund | exact detail tool |
| status/audit | SellAccountStatusHistory and lock fields | exact detail tool |
| invoice/credit note | SellAccount and PDF service | selected finance/file actions |
| deeds/KYC | SellAccount.documents and deed workflow | exact detail metadata and file actions; end-to-end browser verification pending |
| RTO | VehicleRtoRecord and task/status logs | exact detail join plus separate summary |
| CRM | Lead.wonSellAccountId and listing linkage | exact detail won-lead/customer join; broader activity timeline is an optional later reporting scope |
| finance hub | sellAccountId on voucher/document/line/schedule/write-off and FinVehicleDealExt | exact detail join plus separate finance tools |
| WhatsApp/SMS | invoiceDelivery, receiptDelivery and messaging logs | exact-deal audit projection implemented; WhatsApp rules ready, Sold Vehicle SMS DLT IDs/rules still require configuration, provider callback verification pending |
