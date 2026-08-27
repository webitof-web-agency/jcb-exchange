# SEO Phase 23 Deployment Checklist

Date: August 25, 2026

## Goal

Launch the implemented SEO safely in production and verify that search engines see the intended canonical, robots, sitemap, and metadata setup.

## Pre-Deploy Checks

- Confirm frontend production domain is `https://jcbexchange.com`.
- Confirm frontend metadata uses the production domain in canonicals, Open Graph, Twitter image URLs, schema IDs, and sitemap entries.
- Confirm public image hosts are reachable from production.
- Confirm admin portal remains `noindex, nofollow`.
- Confirm private frontend routes remain `noindex, nofollow`.

## Post-Deploy Smoke Checks

Open these URLs on production and confirm `200` unless noted:

- `/`
- `/machines`
- `/categories`
- `/dealers`
- `/sold-vehicles`
- `/sitemap.xml`
- `/robots.txt`
- `/machines/[slug--id]`
- `/sold-machines`
  Expected: redirect to `/sold-vehicles`

## Metadata Checks

Inspect page source on:

- homepage
- machine detail page
- dealer detail page
- machines listing page

Verify:

- canonical URL is present and correct
- `og:title`, `og:description`, `og:image` are present
- `twitter:card` and `twitter:image` are present
- private routes show `noindex, nofollow`
- search-result pages like `/machines?q=...` show `noindex,follow`

## Structured Data Checks

Validate these in Google's Rich Results Test or Schema Markup Validator:

- homepage `Organization` + `WebSite`
- machine detail `Product`
- dealer detail `LocalBusiness`
- collection pages `CollectionPage`

## Search Console Submission

After production deploy:

1. Open Google Search Console for `https://jcbexchange.com/`
2. Submit `https://jcbexchange.com/sitemap.xml`
3. Inspect the homepage URL
4. Inspect one machine detail URL
5. Request indexing for key pages if required

## Robots Checks

Verify `robots.txt` contains:

- sitemap reference
- `Disallow: /profile`

If admin portal has a separate domain/subdomain, verify its own robots and metadata independently.

## Performance Spot Check

Run Lighthouse or PageSpeed Insights on:

- homepage
- machines listing page
- one machine detail page

Priorities:

- LCP image loads correctly
- no broken optimized images
- mobile performance remains acceptable

## Success Criteria

- sitemap is reachable and valid
- robots rules are correct
- canonical URLs match intended preferred URLs
- private pages are not indexable
- public pages are indexable where intended
- social share image and icon assets load correctly
