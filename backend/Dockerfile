# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY assets ./assets
COPY templates ./templates
RUN DATABASE_URL="postgresql://ci:ci@127.0.0.1:1/ci" npm run build \
  && npm prune --omit=dev --no-audit --no-fund \
  && DATABASE_URL="postgresql://ci:ci@127.0.0.1:1/ci" ./node_modules/.bin/prisma generate

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5002

# Runtime system tools required by backend features:
# - postgresql-client (pg_dump in dbBackup.job.ts)
# - libreoffice-writer + fonts (DOCX -> PDF conversion in docxToPdf.service.ts & pdfkit)
# - curl, ca-certificates, openssl (container healthcheck, TLS, Prisma)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-dejavu-core \
    fonts-liberation \
    libreoffice-writer \
    openssl \
    postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /app/storage/public /app/storage/secure /app/uploads/public /app/uploads/secure \
  && chown -R node:node /app

USER node
EXPOSE 5002

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-5002}/health/ready" || exit 1

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/src/server.js"]
