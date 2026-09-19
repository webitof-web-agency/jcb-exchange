# Requirement Coverage Matrix

| Requirement | Status | Evidence | Limitation / verification |
| --- | --- | --- | --- |
| Executive overview | IMPLEMENTED | Overview API and admin/employee/partner UI | Build and TypeScript checks pass |
| Period and previous-period comparison | IMPLEMENTED | Bounded date filters and metric helpers | 4 metric tests pass |
| Listing analytics and drill-down | IMPLEMENTED | Paginated listing API, detail API, top-listing links, CSV | Server scope reused for detail/export |
| Model analytics | IMPLEMENTED | Brand/model grouped listing aggregates | Source-backed grouping |
| Manufacturing/model-year analytics | IMPLEMENTED | `Listing.manufacturingYear` grouping | Missing year remains source value, not fabricated |
| Cross-dimensional filters | IMPLEMENTED | Live searchable dropdowns for brand/model/category/partner/listing/year/listing status/lead status and cascading country/state/city | Options are read from DB; no ID text entry |
| Demand vs supply | IMPLEMENTED | Documented `views + leads*5 + won*10` demand score and `score ÷ live supply` demand-per-stock ratio | Cumulative listing views are explicitly distinguished from period lead data |
| Search/filter intelligence | IMPLEMENTED (forward-only) | `AnalyticsEvent` SEARCH/FILTER_APPLIED tracking | No pre-deployment history |
| Zero-result searches | IMPLEMENTED (forward-only) | Sanitized result count and zero-result aggregate | No historical backfill |
| Enquiry/lead funnel | IMPLEMENTED | Existing Lead/LeadActivity statuses | Uses real records only |
| Dealer/partner performance | IMPLEMENTED | Server-scoped partner filters and labels | Partner view is isolated |
| Partner isolation | IMPLEMENTED | Authenticated partner ID overrides query scope | Unauthenticated smoke returned 401 |
| Sale activity | IMPLEMENTED | `SaleRecord` aggregation | No accounting interpretation added |
| Listing payments | IMPLEMENTED | Approved/paid `ListingPaymentSubmission` aggregation | Source status semantics preserved |
| Prime subscriptions | IMPLEMENTED | Active `CustomerPrimeSubscription` aggregation | Hidden from partner scope where appropriate |
| Deposits | IMPLEMENTED | `PartnerDeposit` aggregation | Existing statuses/amounts preserved |
| Platform revenue ledger | UNAVAILABLE_FROM_DATA | Availability metadata | No revenue/settlement ledger exists |
| Invoice register | PARTIAL | Sale records and invoice-number presence check | No invoice line/transaction model |
| GST CGST/SGST/IGST/HSN/SAC | UNAVAILABLE_FROM_DATA | Explicit UI/API warning | Configuration is not tax transaction evidence |
| Reconciliation exceptions | PARTIAL / EXPLICIT | Missing invoice number check plus unavailable-check list | Settlement/tax reconciliation cannot be safely derived |
| Reports and CSV export | IMPLEMENTED | Permission/filter-aware bounded CSV | Max 5,000 rows |
| Historical unique views/sessions | UNAVAILABLE_FROM_DATA | Tracking availability metadata | Durable events begin at implementation deployment |
| Existing core flows remain unchanged | IMPLEMENTED | Additive migration/routes and fail-safe tracking | Baseline regression documented |

Every unavailable or partial capability is visible in documentation/API/UI; none is silently skipped or filled with fake values.
