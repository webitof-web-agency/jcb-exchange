# Phase 11: Browser Verification Checklist

Goal: verify that every important public and internal route now uses `slug + short unique suffix`, old links still work, and no full UUID remains visibly exposed after page load.

## 1. Public Routes

1. Home page featured listing card
   Expected:
   - click opens `/machines/<slug>-<shortsuffix>`
   - browser URL should not stay as full UUID
   - page should load without flicker loop

2. Machines listing page
   Expected:
   - machine cards open `/machines/<slug>-<shortsuffix>`
   - pagination/filter/search still works
   - image, title, price, location still render correctly

3. Sold vehicles page
   Expected:
   - sold listing cards open `/machines/<slug>-<shortsuffix>`
   - sold price and buyer block still load correctly if record exists

4. Dealer listing page
   Expected:
   - dealer cards open `/dealers/<slug>-<shortsuffix>`
   - no raw UUID visible in final URL

5. Machine detail legacy/raw route test
   Test manually:
   - open old raw route `/machines/<full-uuid>`
   - open any old legacy route if available
   Expected:
   - page resolves successfully
   - browser auto-normalizes to `/machines/<slug>-<shortsuffix>`
   - content stays same

6. Dealer detail legacy/raw route test
   Test manually:
   - open `/dealers/<full-uuid>`
   Expected:
   - page resolves successfully
   - browser auto-normalizes to `/dealers/<slug>-<shortsuffix>`

## 2. Profile Routes

1. Profile listing tab card click
   Expected:
   - opens `/profile/listings/<slug>-<shortsuffix>`
   - no full UUID remains in address bar

2. Profile listing raw route test
   Test manually:
   - open `/profile/listings/<full-uuid>`
   Expected:
   - page loads
   - auto-replaces to `/profile/listings/<slug>-<shortsuffix>`

3. Profile listing public CTA
   Expected:
   - "open public page" button still opens public machine detail successfully

## 3. Partner Portal Routes

1. Partner listings page
   Expected:
   - row/card click opens `/partner/listings/<slug>-<shortsuffix>`
   - no broken detail page

2. Partner listing raw route test
   Test manually:
   - open `/partner/listings/<full-uuid>`
   Expected:
   - page loads
   - auto-normalizes to short route

3. Partner leads inbox
   Expected:
   - lead click opens `/partner/leads/<slug>-<shortsuffix>`
   - page content loads correctly

4. Partner lead raw route test
   Test manually:
   - open `/partner/leads/<full-uuid>`
   Expected:
   - page loads
   - auto-normalizes to short route

## 4. Superadmin Routes

1. Superadmin listings page
   Expected:
   - listing click opens `/superadmin/listings/<slug>-<shortsuffix>`
   - detail page works

2. Superadmin enquiries page
   Expected:
   - lead click opens `/superadmin/enquiries/<slug>-<shortsuffix>`
   - detail page works and URL normalizes if raw

3. Superadmin partners page
   Expected:
   - row click opens `/superadmin/partners/<slug>-<shortsuffix>`
   - edit action opens `/superadmin/partners/<slug>-<shortsuffix>/edit`

4. Superadmin partner detail listing cards
   Expected:
   - nested listing card click opens `/superadmin/listings/<slug>-<shortsuffix>`

5. Superadmin visitors page
   Expected:
   - visitor detail opens `/superadmin/visitors/<slug>-<shortsuffix>`
   - nested listing cards also open short routes

6. Superadmin raw route tests
   Test manually:
   - `/superadmin/listings/<full-uuid>`
   - `/superadmin/enquiries/<full-uuid>`
   - `/superadmin/partners/<full-uuid>`
   - `/superadmin/partners/<full-uuid>/edit`
   - `/superadmin/visitors/<full-uuid>`
   Expected:
   - each page resolves
   - browser replaces to short canonical route

7. Deprecated deposit route
   Test manually:
   - open `/superadmin/partners/<full-uuid>/deposit`
   Expected:
   - redirects safely to partner detail short route
   - no raw UUID should remain after redirect settles

## 5. Employee Routes

1. Employee listings page
   Expected:
   - listing click opens `/employee/listings/<slug>-<shortsuffix>`

2. Employee enquiries page
   Expected:
   - lead click opens `/employee/enquiries/<slug>-<shortsuffix>`

3. Employee partners page
   Expected:
   - partner detail opens `/employee/partners/<slug>-<shortsuffix>`
   - edit opens `/employee/partners/<slug>-<shortsuffix>/edit`

4. Employee visitors page
   Expected:
   - visitor detail opens `/employee/visitors/<slug>-<shortsuffix>`

5. Employee raw route tests
   Test manually:
   - `/employee/listings/<full-uuid>`
   - `/employee/enquiries/<full-uuid>`
   - `/employee/partners/<full-uuid>`
   - `/employee/partners/<full-uuid>/edit`
   - `/employee/visitors/<full-uuid>`
   Expected:
   - each page resolves
   - browser replaces to short route

## 6. URL Quality Checks

For every tested page confirm:

1. URL pattern is readable
   Expected:
   - looks like `name-or-title-2019-city-1cd17a78-5747`
   - not full UUID

2. Refresh behavior
   Expected:
   - refresh on short URL works directly

3. Back button behavior
   Expected:
   - no redirect loop
   - back navigation remains usable

4. Copy-paste behavior
   Expected:
   - copied short URL opens correctly in new tab

5. SEO canonical behavior for public pages
   Expected:
   - machine/dealer raw URL should land on canonical short URL

## 7. Regression Checks

1. Images still render on listing cards and detail pages
2. Buyer name and sold price still render correctly on sold machine detail
3. Breadcrumbs and share links still work on public machine/dealer pages
4. Edit/save actions still work on admin listing and partner edit flows
5. Auth guards still redirect correctly for protected pages

## 8. Pass Criteria

Phase 11 can be marked complete when:

1. No tested final browser URL shows full UUID after page settles
2. Old raw UUID routes still resolve and normalize successfully
3. No redirect loop or blank page appears
4. Public detail, internal detail, and edit flows all remain functional
5. No route-related console/runtime error appears during these checks
