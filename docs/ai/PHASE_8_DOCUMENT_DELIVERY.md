# Phase 8 — Sold Vehicle documents and file delivery

**Audit date:** 2026-11-18  
**Scope:** exact Sold Vehicle/deal document discovery, generated PDFs, stored files, preview/download actions and communication attachment contracts.

## Source-backed document contract

All actions are built from the resolved `SellAccount.id` / `SellAccount.recordNumber`. The AI does not construct a file URL from a name, vehicle text or an unverified external URL. Missing, draft, cancelled, unpaid or unknown source rows do not produce a download action.

| Document | Source and eligibility | Portal action |
|---|---|---|
| Money receipt | `SellAccountPayment`; only issued/real receipts | Existing receipt PDF route with exact `paymentId` |
| Sale invoice / Bill of Supply | `SellAccount.invoiceNumber`; generated from the exact deal | Existing invoice PDF route with exact deal ID |
| Purchase deed / sale deed | Known `SellAccount.documents` slots | Authenticated vehicle-doc file route |
| KYC files | Known purchase/sale Aadhaar, PAN and GST slots | Authenticated vehicle-doc file route |
| Credit note | Existing `creditNoteNumber` and exact deal | Credit-note PDF route |
| Refund advice | Existing paid refund with `refundNumber` | Refund-advice PDF route with exact `refundId` |
| Delivery challan | Completed, non-draft, non-cancelled deal | Source-backed one-page delivery-challan PDF route |
| RTO transfer summary | Exact `VehicleRtoRecord.sellAccountId` | RTO transfer-certificate route |
| RTO task files | Exact `RtoTransferTask.rtoRecordId` and stored document ID | Authenticated vehicle-doc file route |
| Vehicle images/videos | Exact `Listing.id` media rows | Authenticated vehicle-doc media route |
| Website advance proof | Exact `SellAccountPayment.listingPaymentId` and receipt URL | Authenticated vehicle-doc payment-proof route |
| Complete vehicle packet | Exact normalized vehicle number | Existing vehicle-doc ZIP route |

## AI response behavior

`buildSoldVehicleDocumentActions` returns portal `preview` and `download` actions only. The provider-facing payload remains free of raw file URLs; the authenticated portal executes the action with the current user permission. Duplicate URLs are removed and source identifiers remain in the action metadata.

The exact-detail response contains document availability, source status and warnings. It does not turn a missing file into a fabricated PDF. A draft payment is evidence of a draft only; it is not exposed as a real money receipt action.

## Communication attachment contract

- WhatsApp `VEHICLE_SALE_PAYMENT_RECEIPT` generates the same Money Receipt PDF used by the portal, uploads that PDF to Meta as a `DOCUMENT`, and sends the returned media ID with the configured approved template. The filename is the generated receipt filename.
- WhatsApp invoice delivery follows the same pattern with the generated Bill of Supply PDF and the approved invoice template.
- SMS cannot carry a binary WhatsApp document attachment. SMS sends the authenticated/public receipt or invoice link stored in the existing delivery contract. The link is not presented as a PDF attachment.
- Template registration still requires lowercase letters, numbers and underscores in the Meta template name, a matching approved Meta template ID, and the required `DOCUMENT` header where the event sends a PDF.

## Implemented code surface

- `backend/src/services/ai/soldVehicleDocumentActions.service.ts`
- `backend/src/services/ai/aiReadOnlyTools.service.ts`
- `backend/src/services/ai/aiUiActions.service.ts`
- `backend/src/services/vehicleSaleInvoice.service.ts`
- `backend/src/utils/vehicleSaleDocumentsPdf.ts`
- `backend/src/services/vehicleDocs.service.ts`
- `backend/src/controllers/sellAccount.controller.ts`
- `backend/src/routes/recruitment.routes.ts`

## Validation boundary

Local source-backed tests and TypeScript validation pass. Final production verification still requires an authenticated portal preview/download smoke test using a representative completed deal, plus a live Meta/SMS provider callback check. Provider approval and credentials are deployment configuration; they cannot be proven from repository tests alone.
