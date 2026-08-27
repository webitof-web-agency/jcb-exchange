# Slug + Short Suffix Phase 1 Route Audit

Date: August 25, 2026

## Goal

Prepare a safe migration from raw/full ID URLs to `slug + short unique suffix` across:

- `frontend` public routes for SEO
- `frontend` private customer routes where raw IDs are visible
- `admin-portal` internal detail/edit routes where raw IDs are visible

The objective is:

- no visible full UUID/raw ID in browser routes where we can avoid it
- no breakage for existing links
- SEO-friendly preferred URLs on public pages
- internal pages still resolving to the correct database record

## Current State Summary

Raw IDs are currently visible in multiple places:

- public machine detail URLs already use `slug--full-id`
- public dealer detail URLs still use plain raw IDs
- frontend private profile listing detail URLs use raw IDs
- admin-portal internal listing, partner, visitor, and lead detail routes use raw IDs
- admin action links and table row navigation often push raw IDs directly into route paths

This means the migration is not just an SEO URL cleanup. It is a cross-app route identity migration.

## Current Public URL Patterns

### Frontend

- `/machines/[slug--full-id]`
- `/machines/[full-id]`
- `/dealers/[id]`
- `/profile/listings/[id]`

### Admin-portal public-preview related links

Admin and partner dashboards open internal detail pages using raw IDs, and some internal pages link onward to listing detail pages that also use raw IDs.

## Route Exposure Inventory

## Entity 1: Machine Listings

### Public frontend routes

- `/machines/[id]` route file:
  - `frontend/src/app/machines/[id]/page.tsx`
- Public URL generation helper:
  - `frontend/src/lib/seoUtils.ts`
- Public link consumers:
  - `frontend/src/app/page.tsx`
  - `frontend/src/app/machines/MachinesPageClient.tsx`
  - `frontend/src/app/sold-vehicles/SoldVehiclesPageClient.tsx`
  - `frontend/src/app/dealers/[id]/DealerDetailPageClient.tsx`
  - `frontend/src/components/profile/MyListingsTab.tsx`
  - `frontend/src/app/profile/listings/[id]/ProfileListingDetailClient.tsx`
  - `frontend/src/app/sitemap.ts`
  - metadata/schema in `frontend/src/app/machines/[id]/page.tsx`

### Internal admin/partner routes

- `/partner/listings/[id]`
- `/superadmin/listings/[id]`
- `/employee/listings/[id]`

Route files:

- `admin-portal/src/app/(partner)/partner/listings/[id]/page.tsx`
- `admin-portal/src/app/(admin)/superadmin/listings/[id]/page.tsx`
- `admin-portal/src/app/(admin)/employee/listings/[id]/page.tsx`

Known internal link generators:

- `admin-portal/src/app/(partner)/partner/listings/page.tsx`
- `admin-portal/src/app/(admin)/superadmin/listings/page.tsx`
- `admin-portal/src/app/(admin)/employee/listings/page.tsx`
- `admin-portal/src/components/portal/PartnerDetailPage.tsx`
- `admin-portal/src/components/portal/VisitorDetailPage.tsx`

### Migration priority

- Highest priority

### Why

- core SEO route
- currently exposes full UUID in public browser URL
- also reused inside internal detail navigation

## Entity 2: Dealers

### Public frontend routes

- `/dealers/[id]`

Route files:

- `frontend/src/app/dealers/[id]/page.tsx`
- `frontend/src/app/dealers/[id]/data.ts`

Public link generators:

- `frontend/src/app/dealers/DealersPageClient.tsx`
- `frontend/src/app/machines/[id]/MachineDetailClient.tsx`

### Current issue

- public dealer pages still expose plain raw IDs
- canonical URLs also use raw IDs

### Migration priority

- High priority

### Why

- public and indexable
- SEO benefit from readable path
- no public reason to expose raw ID

## Entity 3: Customer Profile Listings

### Frontend private routes

- `/profile/listings/[id]`

Route files:

- `frontend/src/app/profile/listings/[id]/page.tsx`
- `frontend/src/app/profile/listings/[id]/ProfileListingDetailClient.tsx`

Link generators:

- `frontend/src/components/profile/MyListingsTab.tsx`

### Current issue

- not SEO-indexed, but full raw ID visible in customer-facing private route

### Migration priority

- Medium-high

### Why

- part of requirement: no full ID visible even on internal/private screens

## Entity 4: Partner Records

### Admin-portal routes

- `/superadmin/partners/[id]`
- `/employee/partners/[id]`
- `/superadmin/partners/[id]/edit`
- `/employee/partners/[id]/edit`
- `/superadmin/partners/[id]/deposit`
- `/employee/partners/[id]/deposit`

Route files include:

- `admin-portal/src/app/(admin)/superadmin/partners/[id]/page.tsx`
- `admin-portal/src/app/(admin)/employee/partners/[id]/page.tsx`
- `admin-portal/src/app/(admin)/superadmin/partners/[id]/edit/page.tsx`
- `admin-portal/src/app/(admin)/employee/partners/[id]/edit/page.tsx`
- `admin-portal/src/app/(admin)/superadmin/partners/[id]/deposit/page.tsx`
- `admin-portal/src/app/(admin)/employee/partners/[id]/deposit/page.tsx`

Known link generators:

- `admin-portal/src/app/(admin)/superadmin/partners/page.tsx`
- `admin-portal/src/components/kyc/KycOnboardingClient.tsx`

### Current issue

- partner management paths expose raw IDs throughout admin workflows

### Migration priority

- High priority

### Why

- internal visible-ID requirement explicitly includes admin routes
- multiple subroutes mean shared entity resolver is needed

## Entity 5: Visitors

### Admin-portal routes

- `/superadmin/visitors/[id]`
- `/employee/visitors/[id]`

Files:

- `admin-portal/src/app/(admin)/superadmin/visitors/[id]/page.tsx`
- `admin-portal/src/app/(admin)/employee/visitors/[id]/page.tsx`
- `admin-portal/src/components/portal/VisitorDirectoryPage.tsx`
- `admin-portal/src/components/portal/VisitorDetailPage.tsx`

### Migration priority

- Medium

### Why

- internal only
- visible raw IDs
- linked to listing detail pages

## Entity 6: Leads / Enquiries

### Admin-portal routes

- `/partner/leads/[id]`
- `/superadmin/enquiries/[id]`
- `/employee/enquiries/[id]`

Files:

- `admin-portal/src/app/(partner)/partner/leads/[id]/page.tsx`
- `admin-portal/src/components/portal/LeadInboxPage.tsx`
- `admin-portal/src/components/portal/LeadDetailPage.tsx`
- `admin-portal/src/app/(admin)/superadmin/enquiries/[id]/page.tsx`
- `admin-portal/src/app/(admin)/employee/enquiries/[id]/page.tsx`

### Migration priority

- Medium

### Why

- internal only
- still part of no-full-ID requirement

## Entity 7: Potential Future Candidates

These are not yet confirmed as browser-exposed detail routes needing the same migration, but should be reviewed in later phases if they surface raw IDs:

- users
- roles
- verifications
- recurrence items
- settings subresources
- customer prime payments

Current evidence suggests many of these use raw IDs in API calls but not necessarily browser route paths.

## Shared Technical Constraints

## Constraint 1: Backward compatibility

Old URLs already in circulation must continue to work:

- old plain ID machine URLs
- old `slug--full-id` machine URLs
- current raw-ID dealer URLs
- current admin raw-ID deep links

## Constraint 2: Deterministic short suffix

The suffix cannot be random on each render. It must be stable for the same record every time.

Recommended direction:

- deterministic short token from the existing ID
- same record always generates the same suffix
- no database schema change required in the first pass

## Constraint 3: Resolver layer

Internal pages cannot rely on the short suffix alone to fetch data safely unless they can resolve:

- full raw ID
- old slug/full-ID route
- new slug/short-suffix route

This means we need a shared parser/resolver utility before large-scale route replacement.

## Constraint 4: Public and internal needs are different

### Public pages

- SEO
- canonical URL
- sitemap
- schema
- social share URLs

### Internal pages

- stable navigation
- edit/view/delete safety
- back links
- table row navigation
- breadcrumbs

Both must be handled, but the safety checks differ.

## Affected Utility and Metadata Layers

## Frontend

- `frontend/src/lib/seoUtils.ts`
- `frontend/src/app/machines/[id]/page.tsx`
- `frontend/src/app/sitemap.ts`
- `frontend/src/app/dealers/[id]/page.tsx`
- any future dealer slug utility

## Admin-portal

A new shared route utility is likely needed rather than directly scattering string builders across pages.

## Risk Assessment

## Highest-risk zones

- machine route parsing
- admin listing detail navigation
- partner detail/edit/deposit subroutes
- visitor and lead detail deep links
- old copied URLs from bookmarks/history

## Medium-risk zones

- dealer public detail migration
- private profile listing route migration
- breadcrumbs and action menus

## Lower-risk zones

- sitemap/canonical once resolver is stable
- public link generator replacement after compatibility layer exists

## Phase 1 Decision Lock

This migration should include these entities in scope:

1. machines
2. dealers
3. customer profile listings
4. partner records
5. visitors
6. leads/enquiries

This migration should not directly alter API endpoint shapes in the first pass.

The safest approach is:

1. build shared short-suffix utilities
2. add compatibility parsing/resolution
3. migrate public/frontend paths
4. migrate admin/internal paths
5. validate and only then consider redirects

## Phase 1 Completion Check

- frontend dynamic route surface audited
- admin-portal dynamic route surface audited
- public SEO routes identified
- internal visible-ID routes identified
- entity scope locked
- high-risk migration zones identified
