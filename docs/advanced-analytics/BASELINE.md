# Advanced Analytics Baseline

Date: 2026-09-10

## Repository state

- Branch: `main` tracking `origin/main`.
- The worktree was already heavily modified before this task: 102 tracked files changed and 97 untracked paths, including recruitment, listing payments, mobile configuration, and translation work.
- Those changes are preserved and are not treated as part of this analytics implementation.
- No reset, clean, database reset, or migration reset was run.

## Checks run before analytics changes

| Area | Command | Result |
| --- | --- | --- |
| Backend TypeScript | `npx tsc --noEmit` | PASS |
| Backend Prisma schema | `npx prisma validate` | PASS (run with approved elevated read-only access) |
| Admin portal lint | `npm run lint` | FAIL: 5 existing React lint errors in employee/superadmin listings pages |
| Customer frontend lint | `npm run lint` | FAIL: 9 existing errors in jobs/home/invoice PDF files; 24 warnings |
| Mobile lint | `npm run lint` | PASS |
| Mobile tests | `npm test -- --runInBand` | Test suite PASS (1 test); existing act/open-handle warnings remain |
| Backend package build | `npm run build` | BLOCKED by sandbox EPERM while Prisma engine resolves `C:\Users\meghr`; backend TypeScript itself passes |
| Database migration status | `npx prisma migrate status` | 9 repository migrations are pending on the configured Neon database; no migration was applied during baseline |

## Baseline interpretation

The admin/frontend lint errors are in pre-existing modified files and are not silently attributed to analytics. Final validation must show no new errors in analytics files and must be compared with this baseline.

