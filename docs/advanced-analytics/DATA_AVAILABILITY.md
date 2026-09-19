# Data Availability

| Capability | Classification | Evidence / treatment |
| --- | --- | --- |
| Current inventory, price, model, year, category, location, dealer | ALREADY_AVAILABLE | `Listing` and relations |
| Historical listing creation/status snapshots | ACCURATELY_DERIVABLE | `Listing.createdAt`, `updatedAt`, status, `soldAt` |
| Historical aggregate listing views | ALREADY_AVAILABLE (aggregate only) | `Listing.views`; no reliable historical dates |
| Historical unique views/sessions/impressions | NOT CURRENTLY POSSIBLE | No durable visitor/event table existed |
| New listing view/search/filter event history | TRACKING REQUIRED | Additive `AnalyticsEvent`, earliest reliable date is migration/deployment date |
| Leads, lead stages, lead conversion | ACCURATELY_DERIVABLE | `Lead` and `LeadActivity` with real statuses |
| Lead stage transition timing | ACCURATELY_DERIVABLE where activity metadata exists | Missing transitions are explicitly reported as unavailable |
| Sale movement and sold price | ACCURATELY_DERIVABLE | `SaleRecord` |
| Listing payment submissions/status/amount | ACCURATELY_DERIVABLE | `ListingPaymentSubmission` |
| Prime subscription payments | ACCURATELY_DERIVABLE | `CustomerPrimeSubscription` |
| Partner deposits and refund state | ACCURATELY_DERIVABLE | `PartnerDeposit` |
| Platform revenue vs cash collected | NOT CURRENTLY POSSIBLE as accounting-grade ledger | Existing payment records do not define platform revenue/settlement semantics |
| Invoice register and invoice number presence | ACCURATELY_DERIVABLE (limited) | Optional `SaleRecord.invoiceNo`; no invoice transaction model |
| CGST/SGST/IGST, GST rate-wise, HSN/SAC, B2B/B2C | NOT CURRENTLY POSSIBLE | Company default GST settings are configuration, not tax transaction data |
| Search zero-result history before tracking | NOT CURRENTLY POSSIBLE | Search/filter was client-side and not persisted |
| Partner-scoped analytics | ALREADY AVAILABLE / derivable | Existing role and ownership fields; enforced server-side |

