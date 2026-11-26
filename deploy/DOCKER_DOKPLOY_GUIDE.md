# JCB Exchange — Docker + GitHub Actions + Dokploy Setup & Cutover Guide

Is architecture mein **heavy builds GitHub Actions par parallel** chalte hain aur aapka VPS (Dokploy) sirf pre-built chhoti (~180–250 MB) Docker images pull karta hai. Isse deploy time **45 min → 2–4 min** ho jata hai aur VPS par zero CPU/RAM spike aata hai.

---

## 1. GitHub Container Registry (GHCR) Token Setup

1. GitHub par jaayein: **Settings → Developer settings → Personal access tokens → Tokens (classic)** → **Generate new token (classic)**.
2. Scope select karein: `read:packages` (agar private repo hai to `repo` bhi select karein).
3. **Dokploy Dashboard → Settings → Registry (ya Docker Registry)** open karein aur add karein:
   - **Registry URL:** `ghcr.io`
   - **Username:** `<your-github-username>`
   - **Password / Token:** `<generated-PAT>`

*(Note: Pehli baar `docker-deploy.yml` push karega tab GHCR packages banenge. Dokploy registry login tab configure karein jab aap Dokploy se images pull karne ke liye ready hon.)*

---

## 2. Dokploy mein 3 Alag Applications Banayein

Har app ko **Provider = Docker** (Docker Image source, NOT Git build!) par set karein:

### App 1: `jcbexchange-backend`
- **Docker Image (Production):** `ghcr.io/<github-owner>/jcbexchange-backend:latest`
  *(Staging ke liye tag `:staging` use karein)*
- **Registry:** Jo Step 1 mein GHCR registry add ki hai woh select karein.
- **Port / Domain:** Port `5002` (API domain attach karein, e.g. `api.jcbexchange.com`).
- **Replicas:** **`1`** (Important: cron jobs aur rate-limiter single instance expect karte hain).
- **Persistent Volume (Mount):**
  - **Volume Name / Host Path:** `jcbexchange_backend_storage` (ya host path `/var/lib/jcbexchange/storage`)
  - **Container Path:** `/app/storage`
- **Healthcheck Path:** `/health/ready` (Interval `15s`, Timeout `5s`, Start Period `30s`, Retries `5`).
- **Environment Variables:** Apne VPS ke `backend/.env` se saare secrets paste karein + ye ensure karein:
  - `NODE_ENV=production`
  - `PORT=5002`
  - `APP_STORAGE_DIR=/app/storage`
  - `ENABLE_BACKGROUND_JOBS=true`
- **Deploy Webhook URL copy karein** (Dokploy App → Deployments / Webhook tab).

### App 2: `jcbexchange-frontend`
- **Docker Image (Production):** `ghcr.io/<github-owner>/jcbexchange-frontend:latest` *(Staging: `:staging`)*
- **Registry:** GHCR
- **Port / Domain:** Port `3000` (Website domain attach karein, e.g. `jcbexchange.com`).
- **Healthcheck Path:** `/`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `PORT=3000`
  - `HOSTNAME=0.0.0.0`
- **Deploy Webhook URL copy karein.**

### App 3: `jcbexchange-admin-portal`
- **Docker Image (Production):** `ghcr.io/<github-owner>/jcbexchange-admin-portal:latest` *(Staging: `:staging`)*
- **Registry:** GHCR
- **Port / Domain:** Port `3001` (Portal domain attach karein, e.g. `admin.jcbexchange.com`).
- **Healthcheck Path:** `/`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `PORT=3001`
  - `HOSTNAME=0.0.0.0`
- **Deploy Webhook URL copy karein.**

---

## 3. GitHub Repository Environments (`production` aur `staging`) Configure Karein

GitHub Repo → **Settings → Environments → `production`** (aur `staging` agar staging use kar rahe hain) mein ye Variables & Secrets add karein:

### Environment Variables (**Variables** tab)

Ye values optional hain: workflow inke na hone par production defaults use karke images publish karta hai. Custom domain/API endpoint ho to set karein.
| Name | Example Production Value | Required For |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.jcbexchange.com/api` | `frontend` & `admin-portal` |
| `NEXT_PUBLIC_SITE_URL` | `https://jcbexchange.com` | `frontend` & `admin-portal` |
| `NEXT_PUBLIC_PUBLIC_SITE_URL` | `https://jcbexchange.com` | `admin-portal` |
| `NEXT_PUBLIC_FRONTEND_URL` | `https://jcbexchange.com` | `admin-portal` |
| `NEXT_PUBLIC_PARTNER_PORTAL_URL` | `https://admin.jcbexchange.com` | `frontend` |
| `NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES` | `15` | `admin-portal` (optional, default `15`) |

*(Note: GitHub repository owner lowercase hona chahiye GHCR image name ke liye — `github.repository_owner` ko lowercase ensure karein ya agar aapka GitHub username/org capital letters mein hai to Dokploy mein lowercase repo owner name use karein.)*

### Environment Secrets (**Secrets** tab)

Ye secrets optional hain. Inke bina GitHub image publish ko successful rakhega aur Dokploy deployment skip karega. Teeno webhook secrets set karne ke baad har successful image push Dokploy deployment automatically trigger karega.
| Secret Name | Value |
|---|---|
| `DOKPLOY_BACKEND_WEBHOOK_URL` | Dokploy `jcbexchange-backend` Deploy Webhook URL |
| `DOKPLOY_FRONTEND_WEBHOOK_URL` | Dokploy `jcbexchange-frontend` Deploy Webhook URL |
| `DOKPLOY_ADMIN_PORTAL_WEBHOOK_URL` | Dokploy `jcbexchange-admin-portal` Deploy Webhook URL |

---

## 4. Pehli Baar PM2 se Dokploy par Safe Switchover (Cutover Steps)

1. **GitHub Actions manual trigger chalayein:**
   - GitHub → **Actions → Docker Build & Dokploy Deploy → Run workflow**
   - `environment: production`, `services: all` select karke run karein taaki teeno images GHCR par build & push ho jayein.
2. **Existing Uploaded Files Copy Karein (Agar local `backend/uploads` mein branding/files hain):**
   ```bash
   # Purane checkout ke backend/uploads ko Dokploy volume mein copy karein:
   VOLUME_PATH=$(docker volume inspect jcbexchange_backend_storage --format '{{ .Mountpoint }}')
   mkdir -p "$VOLUME_PATH/public" "$VOLUME_PATH/secure"
   cp -an /path/to/repo/backend/uploads/* "$VOLUME_PATH/" 2>/dev/null || true
   chown -R 1000:1000 "$VOLUME_PATH"
   ```
3. **Database Backup lein (Safety first):**
   ```bash
   pg_dump --format=custom --no-owner --file=/var/backups/jcbexchange/pre-docker-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
   ```
4. **PM2 band karein & Dokploy containers start karein:**
   - Dokploy mein teeno apps start/deploy karein aur `/health/ready` verify karein.
   - Purane PM2 processes stop karein (`pm2 stop jcb-api jcb-web jcb-portal`) aur reverse proxy / domain traffic Dokploy par route karein.
   - Jab sab stable chal jaye tab `pm2 delete jcb-api jcb-web jcb-portal && pm2 save`.

---

## 5. 30-Second Instant Rollback

Har deploy ek immutable SHA tag push karta hai (e.g. `prod-a1b2c3d`).
Agar kabhi kisi deploy mein issue aaye:
1. Dokploy mein us specific app ki **Docker Image** tag `:latest` se badalkar pichhla `:prod-<sha>` set karein.
2. **Deploy** click karein — ~15 second mein purana container wapas live ho jayega!
