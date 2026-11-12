# Deployment, staging and operations

How code gets from `main` to the server, and the one-time setup that needs a person with server,
GitHub and Play Console access.

## How a deploy works

`deploy/deploy.sh` runs on the server, inside the repository checkout:

1. Refuses to run if tracked files on the server were edited by hand.
2. Checks out the requested commit (default `origin/main`).
3. `npm ci` + build for `backend`, `frontend`, `admin-portal`. A failed build stops here and the
   running apps keep serving the old build.
4. Saves a database backup (`pg_dump`, custom format) to `BACKUP_DIR` (keeps the last 14).
5. `prisma migrate deploy`.
6. `pm2 startOrReload deploy/ecosystem.config.cjs` (apps `jcb-api`, `jcb-web`, `jcb-portal`).
7. Waits for `GET /health/ready` (API up and database answering).

Code rollback: `deploy/deploy.sh --rollback` (database migrations are not reverted; restore the
pre-deploy dump if a migration has to be undone).

From GitHub: **Actions → Deploy → Run workflow**, pick `staging` or `production` and a ref. CI
(type-check + unit tests of all three apps) must pass first.

## One-time setup

### GitHub

1. **Settings → Environments**: create `production` and `staging`. On `production`, add yourself
   under *Required reviewers*, so every production deploy waits for a click.
2. In each environment add secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (a key used only for
   deploys), `DEPLOY_PATH` (checkout path on the server), optionally `DEPLOY_PORT`.
3. Repository secrets for the Android build (see "Android signing key" below):
   `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. **Settings → Branches**: protect `main` and require the `CI` checks to pass.

### Server (once per environment)

```bash
sudo npm i -g pm2
git clone <repo> /var/www/jcbexchange && cd /var/www/jcbexchange
# backend/.env, frontend/.env.production, admin-portal/.env.production as today
cat > deploy/.deploy.env <<'EOF'
PM2_PREFIX=jcb
API_PORT=5002
WEB_PORT=3000
PORTAL_PORT=3001
BACKUP_DIR=/var/backups/jcbexchange
EOF
bash deploy/deploy.sh
pm2 startup   # restart the apps after a reboot
```

`pg_dump` must be the same major version as the database server (PostgreSQL 18).

If the apps currently run under other pm2 names, stop those once (`pm2 delete <old-name>`) before the
first `deploy.sh`, otherwise both copies try to use the same ports. Keep nginx pointing at the same ports.

### First super admin (new or restored database only)

Public sign-up no longer creates a super admin. On the server:

```bash
cd backend
SUPERADMIN_EMAIL=owner@example.com SUPERADMIN_NAME="Owner" SUPERADMIN_PASSWORD='at-least-12-chars' npm run admin:create
```

## Staging on the same server

Staging is a second checkout with its own database, ports and pm2 names.

1. Create an empty database `jcbexchange_staging` and build it:
   `DATABASE_URL=.../jcbexchange_staging npx tsx scripts/setup-fresh-database.ts`, then
   `npx tsx scripts/reseed-master.ts --locations`, `npm run roles:sync`, and optionally
   `npx tsx scripts/seed-full-demo.ts` for demo data. Create the admin with `npm run admin:create`.
2. Clone to `/var/www/jcbexchange-staging`, copy the `.env` files, and change: `DATABASE_URL` →
   staging database, `PORT`, site URLs (`staging.` subdomains), and set `ENABLE_BACKGROUND_JOBS=false`
   unless you are testing jobs.
3. `deploy/.deploy.env`: `PM2_PREFIX=jcb-staging`, `API_PORT=5102`, `WEB_PORT=3100`, `PORTAL_PORT=3101`,
   `BACKUP_DIR=/var/backups/jcbexchange-staging`.
4. nginx server blocks for `staging.jcbexchange.com`, `api-staging...`, `portal-staging...`, with basic
   auth so search engines and customers never see staging.

**Never** copy the production database into staging without clearing the WhatsApp, SMS, email,
Razorpay/PhonePe and Surepass settings first: staging would message real customers and spend real
verification credit.

**Local development** should use a local database as well. Today `backend/.env` points at production,
so every local run (including its cron jobs) writes to live data. Until that changes, start the local
API with `ENABLE_BACKGROUND_JOBS=false`.

## Monitoring

- **Errors**: set `SENTRY_DSN` (and `SENTRY_ENVIRONMENT=production`) in `backend/.env`. Unset means
  nothing is sent. Request bodies, cookies and auth headers are stripped before sending.
- **Uptime**: point a monitor (UptimeRobot, Better Stack, …) at `https://<api-host>/health/ready`
  every minute. It returns 503 when the database is unreachable.

## Backups

- Daily `pg_dump` to Google Drive (existing job) and a dump before every deploy (`deploy.sh`).
- **Monthly restore drill**: `deploy/restore-drill.sh <dump-file>` restores into a temporary database,
  prints row counts, checks there is a super admin, then drops it. A backup is only proven once it
  has been restored.

## Background jobs and scaling

Cron jobs and workers (backups, retention, CRM, Finance Hub posting, notification outbox, AI briefing)
run inside the API process, and rate limits are kept in memory. Run exactly **one** API process with
jobs on. Any extra API process (pm2 cluster, second server, staging pointed at the same DB) must have
`ENABLE_BACKGROUND_JOBS=false`.

## Android signing key (must be done by the Play Console owner)

Until 2026-11-12 the upload keystore and its password were committed to git, so the old key must be
treated as known to anyone who had the repository.

1. Generate a new upload key: `keytool -genkeypair -v -keystore upload-2026.keystore -alias jcbexchange -keyalg RSA -keysize 2048 -validity 10000`.
2. Play Console → the app → **Test and release → App integrity → App signing → Request upload key reset**,
   upload the new certificate (`keytool -export -rfc -keystore upload-2026.keystore -alias jcbexchange -file upload_certificate.pem`).
3. After Google confirms, put the new key in the GitHub secrets above
   (`base64 -w0 upload-2026.keystore`) and in your local `JCB-Exchange/android/keystore.properties`.
4. Optionally remove the old keystore from git history (`git filter-repo --path JCB-Exchange/android/app/jcbexchange.keystore --invert-paths`).
   This rewrites history and needs a force push that everyone (including other developers) must re-clone after.
