# Slug + Short Suffix Phase 2 Strategy Lock

Date: August 25, 2026

## Goal

Lock the final URL strategy for migrating raw/full ID routes to readable `slug + short unique suffix` routes across:

- frontend public SEO routes
- frontend private routes
- admin-portal internal detail/edit routes

This phase defines the exact format, suffix source, compatibility behavior, and technical guardrails for later implementation phases.

## Final Decision Summary

## Chosen strategy

Use:

- readable slug
- deterministic short suffix derived from the existing UUID
- compatibility support for old full-ID routes

## Chosen suffix format

Use the first two UUID groups:

- example full UUID:
  - `1cd17a78-5747-49b5-aaf6-bbddccb1df281`
- short suffix token:
  - `1cd17a78-5747`

This gives:

- 12 hex characters of uniqueness
- 1 separator already present
- direct backend/database resolvability using `startsWith`
- no schema change required

## Chosen public machine URL shape

`/machines/[slug]-[uuidPrefix]`

Example:

`/machines/rtfg-2026-not-specified-1cd17a78-5747`

## Why this was chosen

This is the best safe compromise for the current codebase because:

- it is much shorter than the full UUID
- it is deterministic
- it does not require a new database slug column in the first pass
- it can be resolved safely from existing UUID-backed records
- it allows backward compatibility for old URLs

## Why a 5-6 character suffix was not chosen

A very short suffix like:

- `a9k3p`
- `k4p9x2`

would look cleaner, but in the current architecture it introduces a major lookup problem:

- the system cannot derive the full UUID back from that token
- current APIs mostly fetch records by exact `id`
- without a persisted mapping or new unique token field, a tiny suffix cannot be resolved safely at scale

So for a true tiny suffix, we would need:

- database schema change, or
- dedicated persisted short token field, or
- new indexed lookup layer

That can be a later optimization, but it is not the safest first migration.

## Final Route Pattern by Entity

## Machines

Preferred:

- `/machines/[slug]-[uuidPrefix]`

Backward compatible:

- `/machines/[full-id]`
- `/machines/[slug--full-id]`

## Dealers

Preferred:

- `/dealers/[slug]-[uuidPrefix]`

Current raw-ID routes must still resolve during migration.

## Customer profile listings

Preferred:

- `/profile/listings/[slug]-[uuidPrefix]`

This route is not for SEO, but it removes visible full IDs.

## Admin/partner listing detail routes

Preferred:

- `/partner/listings/[slug]-[uuidPrefix]`
- `/superadmin/listings/[slug]-[uuidPrefix]`
- `/employee/listings/[slug]-[uuidPrefix]`

## Partner detail/edit/deposit routes

Preferred:

- `/superadmin/partners/[slug]-[uuidPrefix]`
- `/superadmin/partners/[slug]-[uuidPrefix]/edit`
- `/superadmin/partners/[slug]-[uuidPrefix]/deposit`
- `/employee/partners/[slug]-[uuidPrefix]`
- `/employee/partners/[slug]-[uuidPrefix]/edit`
- `/employee/partners/[slug]-[uuidPrefix]/deposit`

## Visitors

Preferred:

- `/superadmin/visitors/[slug]-[uuidPrefix]`
- `/employee/visitors/[slug]-[uuidPrefix]`

## Leads / enquiries

Preferred:

- `/partner/leads/[slug]-[uuidPrefix]`
- `/superadmin/enquiries/[slug]-[uuidPrefix]`
- `/employee/enquiries/[slug]-[uuidPrefix]`

For internal entities without strong public naming fields, short readable slugs may be simpler:

- `lead-[uuidPrefix]`
- `visitor-[uuidPrefix]`

This is acceptable because the main goal is to hide full IDs safely, not to optimize those internal routes for SEO.

## Slug Rules

## Public SEO entities

Use descriptive slug sources:

- machine: `title + year + city`
- dealer: `businessName + district`

## Internal entities

Use the best available stable human-readable field:

- partner: `businessName` or user name fallback
- visitor: user name fallback, then `visitor`
- lead/enquiry: listing title or customer name fallback, then `lead`

If no meaningful label exists:

- use entity fallback like `listing`, `partner`, `visitor`, `lead`

## Parsing and Resolver Rules

## Parsing rule

Every route parser should support:

1. full raw UUID
2. old machine format `slug--full-id`
3. new format `slug-uuidPrefix`

## Resolver rule

For new short routes:

- parse the UUID prefix from the route tail
- resolve the entity by matching IDs that start with that prefix
- if exactly one match is found, continue
- if zero matches are found, show not found
- if multiple matches are found, treat as collision and fail safely

## Collision policy

Collision risk with `8-4` UUID prefix is very low for this project size, but must still be handled explicitly.

If collision ever occurs:

- do not guess
- do not open the wrong record
- fail safe and log/debug

## SEO Rules

## Public routes

Preferred canonical must point only to the new `slug + uuidPrefix` route.

## Sitemap

Sitemap should emit only the new preferred URLs once migration reaches the SEO alignment phase.

## Structured data

Product and LocalBusiness schema URLs must use the new preferred route.

## Old routes

Old routes should keep working during migration.

Recommended sequence:

- first support old + new routes together
- then set canonical to new route
- only later consider redirects

## Scope

- In:
  - deterministic slug generation strategy
  - UUID prefix short suffix format
  - backward compatibility rules
  - public + internal route pattern lock

- Out:
  - actual route implementation
  - actual resolver code
  - redirects
  - database schema changes

## Action Items for Next Phases

- Build shared slug/suffix utilities for all entities.
- Build route parsers that detect old and new formats.
- Add resolver helpers for exact ID and UUID-prefix matching.
- Migrate public machine URLs first.
- Migrate public dealer URLs next.
- Migrate internal listing and partner routes after compatibility is proven.
- Align canonical, sitemap, metadata, and schema to preferred public routes.
- Validate collisions, old links, and deep-link behavior before redirects.

## Validation Notes

The following must be true before implementation is considered safe:

- the same record always generates the same short route
- old copied URLs still open
- new routes resolve exactly one record
- no public canonical points to full raw IDs
- internal edit/detail pages still open the correct record

## Phase 2 Completion Check

- final route format locked
- suffix algorithm locked
- no-DB-change safe path selected
- collision policy defined
- public and internal route strategy defined
- next implementation phases unblocked
