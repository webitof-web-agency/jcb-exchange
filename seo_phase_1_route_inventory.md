# SEO Phase 1 Route Inventory

Date: August 25, 2026

## Goal

Freeze the SEO surface area before implementation so public pages can be optimized safely without accidentally indexing private or internal routes.

## Summary

- Public SEO work should target the `frontend` app.
- `admin-portal` should be treated as non-indexable internal/authenticated product space.
- `frontend` also contains some non-public customer pages that should not be indexed.
- No route behavior changes are required in Phase 1.

## Public Indexable Routes

These are the routes that should be considered for SEO, metadata, sitemap inclusion, and performance optimization.

| Route | Source | Purpose | SEO Status | Notes |
| --- | --- | --- | --- | --- |
| `/` | `frontend/src/app/page.tsx` | Homepage | Index | High-priority SEO page. |
| `/machines` | `frontend/src/app/machines/page.tsx` | Public machine listing index | Index | High-priority SEO page. |
| `/machines/[id]` | `frontend/src/app/machines/[id]/page.tsx` | Public machine detail page | Index | Highest-value detail page for metadata/schema/canonical work. |
| `/dealers` | `frontend/src/app/dealers/page.tsx` | Public dealers listing | Index | Should be SEO-eligible. |
| `/dealers/[id]` | `frontend/src/app/dealers/[id]/page.tsx` | Public dealer detail page | Index | Good candidate for entity/local-style SEO. |
| `/categories` | `frontend/src/app/categories/page.tsx` | Public category discovery page | Index | Good SEO/supporting navigation page. |
| `/sold-vehicles` | `frontend/src/app/sold-vehicles/page.tsx` | Public sold listings page | Index | Public and already has metadata. |
| `/sold-machines` | `frontend/src/app/sold-machines/page.tsx` | Alias/alternate sold listings page | Review | Public, but likely duplicates `/sold-vehicles`. Canonical decision needed in later phase. |

## Public But Non-Indexable Routes

These are publicly reachable in the browser but should not be indexed in search because they are user-specific or private-account pages.

| Route | Source | Why It Should Not Index | Recommended Future Rule |
| --- | --- | --- | --- |
| `/profile` | `frontend/src/app/profile/page.tsx` | Customer-specific dashboard page, redirects unauthenticated users | `noindex`, exclude from sitemap |
| `/profile/listings/[id]` | `frontend/src/app/profile/listings/[id]/page.tsx` | Private listing detail/history page | `noindex`, exclude from sitemap |

## Admin Portal Routes

Everything in `admin-portal` should be treated as non-indexable.

### Auth/Publicly Reachable But Non-SEO

| Route | Source | Why It Should Not Index |
| --- | --- | --- |
| `/` | `admin-portal/src/app/page.tsx` | Redirects to login; internal portal entry only |
| `/login` | `admin-portal/src/app/(auth)/login/page.tsx` | Internal auth page |
| `/signup` | `admin-portal/src/app/(auth)/signup/page.tsx` | Internal registration/setup page |
| `/register` | `admin-portal/src/app/register/page.tsx` | Redirect alias to signup |

### Partner Routes

All `admin-portal/src/app/(partner)/partner/**` routes are internal partner workflow pages and should be non-indexable.

Covered routes:

- `/partner/dashboard`
- `/partner/profile`
- `/partner/kyc`
- `/partner/analytics`
- `/partner/listings`
- `/partner/listings/[id]`
- `/partner/leads`
- `/partner/leads/[id]`
- `/partner/categories`
- `/partner/deposits`

### Admin / Employee / Superadmin Routes

All `admin-portal/src/app/(admin)/**` routes are internal operations pages and should be non-indexable.

Covered route groups:

- `/admin/**`
- `/employee/**`
- `/superadmin/**`

Examples include:

- dashboards
- listings
- partners
- users
- roles
- translations
- settings
- enquiries
- verifications
- visitors
- finance support
- recurrence
- categories
- brands
- profiles

## Duplicate / Canonical Review Queue

These routes are public but need a canonical strategy in later phases.

| Route Pair | Risk | Future Action |
| --- | --- | --- |
| `/sold-vehicles` and `/sold-machines` | Duplicate or near-duplicate public content | Choose one canonical route and keep the other as redirect or canonicalized alias |
| `/machines/[id]` and future slug route | Duplicate detail URLs if both return `200` | Keep one preferred canonical URL in later slug phase |

## Phase 1 Decisions Locked

### In Scope For SEO Implementation

- `frontend` homepage
- public machine listing/detail pages
- categories page
- dealers listing/detail pages
- sold listings public page(s)

### Out Of Scope For Search Indexing

- `frontend` profile/customer-account pages
- all `admin-portal` routes
- portal auth pages
- partner dashboard/workflow pages
- admin/employee/superadmin operational pages

## Break Risk Assessment

Phase 1 itself introduces no runtime risk because it is inventory-only.

Future risk notes:

- Very low risk:
  - adding `noindex` to admin routes
  - adding sitemap/robots after route freeze
- Medium risk:
  - canonicalizing duplicate public routes
  - introducing slug-based machine URLs
- Highest controlled risk:
  - converting client-heavy public pages to SEO-friendly server render paths

## Phase 1 Completion Check

- Public SEO-eligible routes identified
- Private frontend routes identified
- Admin portal routes classified as non-indexable
- Duplicate-route review queue captured
- Safe base ready for Phase 2
