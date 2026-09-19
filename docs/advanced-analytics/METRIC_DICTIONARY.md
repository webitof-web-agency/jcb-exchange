# Metric Dictionary

| Metric | Definition | Source and timestamp | Notes |
| --- | --- | --- | --- |
| Live inventory | Listings in `PUBLISHED`, `PAUSED`, or `RESERVED` within the authorized scope | `Listing.status`; snapshot at query time | Sold/draft excluded |
| Inventory value | Sum of asking `Listing.price` for live inventory | `Listing.price` | Not revenue or cash collected |
| Listing views | Legacy cumulative count plus durable tracked view events where separately labelled | `Listing.views`, `AnalyticsEvent` | Historical event trend starts at tracking deployment |
| Leads | Number of `Lead` records created in selected period | `Lead.createdAt` | Duplicate inbox presentation does not change source count |
| Active leads | Leads in `NEW`, `CONTACTED`, `INTERESTED`, or `INSPECTION_SCHEDULED` | `Lead.status` | Uses only actual enum states |
| Won conversion | `WON` leads / all leads in the selected cohort | `Lead.status`, `Lead.createdAt` | Returns null/`N/A` when denominator is zero |
| Sold movement | Count and sum of `SaleRecord` records | `SaleRecord.soldAt`, `soldPrice` | Sale value, not platform revenue |
| Model/year inventory | Count of listings grouped by `Model` and `Listing.manufacturingYear` | Listing snapshot | `manufacturingYear` is the only year concept in schema |
| Demand score | Weighted transparent index: views=1, leads=5, won leads=10 | Listing aggregate views plus selected-period lead rows | The current schema has cumulative listing views, so the UI labels the source basis rather than pretending views are period snapshots |
| Demand per stock | Demand score divided by live inventory count | derived | `43 ÷ 2 = 21.5`; null when live inventory is zero |
| Payment received | Sum of listing payments in `PAID` or `APPROVED` states | `ListingPaymentSubmission.submittedAt` | Remittance/payment amount, not revenue |
| Prime subscription amount | Sum of `ACTIVE` subscription `paidAmount` | `CustomerPrimeSubscription.submittedAt` | Subscription receipts, not GST turnover |
| Deposit amount | Sum of partner deposit amounts by status | `PartnerDeposit.createdAt` | Deposit is not revenue |
| GST totals | Not exposed as populated KPI | No tax-line source exists | UI/API returns unavailable metadata |

Comparison uses equal-length preceding periods. Percentage change is null when the previous value is zero; no misleading infinity/100% is shown.
