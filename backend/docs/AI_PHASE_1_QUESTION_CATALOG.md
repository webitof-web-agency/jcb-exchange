# AI Phase 1 — Question Catalog

Status: complete

The canonical catalog lives in `src/services/ai/aiQuestionCatalog.service.ts`.
It is intentionally separate from database execution. The catalog describes what an operator may ask; the existing allow-listed read-only tool registry remains the only execution boundary.

## Coverage

- 21 operational domains
- 10 question families per domain: summary, list, search, detail, status, history, activity, compare, trend, forecast
- 210 catalog entries generated from the domain and intent matrix
- English, Devanagari Hindi, Roman Hinglish and WhatsApp-style shorthand aliases
- Common spelling variants such as `listng`, `vechile`, `detial`, `statstics`, `forcast`, `serach`, `cnt`, `pls` and `kon`
- Identifier text is kept available to the existing bounded router for listing IDs, invoice numbers, registration numbers and partner codes

## Routing boundary

Catalog entries are marked `supported` or `planned`.

- Only `supported` entries can produce an executable tool request.
- `planned` entries document future module coverage without pretending that an unimplemented tool exists.
- Existing entity-first routing remains first, so a supplied ID, invoice number, registration number or partner code cannot be downgraded to an aggregate query.
- Mutation language is rejected before catalog fallback, so words such as delete, update, approve, assign or send do not trigger a read-only data fetch.
- Range arguments continue to be parsed by the existing bounded router and remain limited by the tool schemas.

## Adding a future module

1. Add the module aliases to `MODULE_SPECS`.
2. Add a real allow-listed tool to `aiReadOnlyTools.service.ts` before marking an intent as supported.
3. Add the permission, Zod schema, safe projection, common data contract, audit event and latency metric for that tool.
4. Add English, Hindi, Hinglish, spelling and WhatsApp examples to the router and Phase 7 matrix tests.
5. Keep the catalog entry `planned` until the tool and permission tests pass.

The catalog tests enforce that every catalog module has all ten question families and that planned coverage never becomes executable automatically.
