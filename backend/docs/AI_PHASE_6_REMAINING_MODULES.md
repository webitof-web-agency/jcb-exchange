# AI Phase 6 — Remaining modules

Phase 6 extends the read-only AI operational layer to the remaining platform areas:

- Recruitment remains available through `recruitment.summary`.
- Visitors remain covered by the scoped customer tools (`customer.summary` and `customer.detail`).
- Master data: `categories.summary`, `brands.summary`, `models.summary`, and `locations.summary`.
- Content and localization: `blogs.summary` and `translations.summary`.
- Platform administration: `settings.summary`, `users.summary`, and `roles.summary`.
- Commercial subscriptions: `subscriptions.summary`.

All new tools are bounded by the shared range/limit contract, permission checked, read-only, and passed through the common provider-safe sanitizer. Results intentionally exclude credentials, encrypted settings, raw configuration payloads, user contact data, payment details, permission arrays, document URLs, and other sensitive fields.

The question catalog and intent router now recognize the English, Hindi, Hinglish, and common shorthand forms for these modules. Reliability events also classify them under master data, content CMS, settings, users/permissions, and subscriptions.

Future modules are kept as catalog/planning coverage until a real schema, permission contract, and safe read-only data source exist. No fabricated records or mutation paths are exposed for future modules.
