# Business Flow Map

## Public marketplace

`frontend/src/app/machines` loads `/master/public-listings`; filters and pagination are applied in the browser. A machine detail page loads `/master/public-listings/:id`, then posts `/master/public-listings/:id/view`. Contact actions create a lead through the existing lead flow. Listing detail data contains brand, model, manufacturing year, price, location, seller, and current aggregate views.

## Lead lifecycle

Lead creation persists a customer, listing snapshots, recipient/dealer routing, and a lead record. The authoritative states are `NEW`, `CONTACTED`, `INTERESTED`, `INSPECTION_SCHEDULED`, `WON`, and `LOST`. Status changes create `LeadActivity` rows where possible. Partner access is constrained to leads received by the partner or attached to the partner's listing; admin access is permission-gated.

## Inventory and sale

Partners create/update listings. Admins review listing status. A completed/approved listing payment finalizes the listing as `SOLD` and upserts a `SaleRecord`. The sale record's `soldPrice` and `soldAt` are the authoritative sale movement inputs.

## Partner operations

Partner profile approval, KYC, deposit, and agreement state live on `PartnerProfile` and related records. The partner analytics page is currently not present in the partner navigation even though the route exists; the implementation will add it without changing existing workflow controls.

## Analytics flow

Admin/employee analytics requests use the existing JWT and permission middleware, build a server-side scope from the authenticated role, aggregate from source records, and return KPI metadata plus grouped tables. Public tracking is fire-and-forget and validation-limited so a tracking failure cannot interrupt browsing, search, contact, payment, or lead actions.

