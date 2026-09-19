# Financial Metrics and Boundaries

The current repository has four different monetary concepts:

- `SaleRecord.soldPrice`: machine sale value.
- `ListingPaymentSubmission.amount`: buyer payment/remittance amount.
- `CustomerPrimeSubscription.paidAmount`: Prime subscription payment amount.
- `PartnerDeposit.amount`: partner security deposit amount.

Analytics keeps these separate. It does not label any of them as platform revenue without an accounting source record. Company invoice settings and `defaultGstRate` are configuration only; they are never used to invent historical GST.

The GST section therefore reports source availability and reconciliation status rather than fake CGST/SGST/IGST numbers. Exact invoice/tax analytics requires invoice and tax-line records to be added by a separate accounting-domain change.

