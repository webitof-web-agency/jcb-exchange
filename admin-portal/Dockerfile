# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PUBLIC_SITE_URL=https://jcbexchange.com
ARG NEXT_PUBLIC_FRONTEND_URL=https://jcbexchange.com
ARG NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES=15

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_PUBLIC_SITE_URL=$NEXT_PUBLIC_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_FRONTEND_URL=$NEXT_PUBLIC_FRONTEND_URL
ENV NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES=$NEXT_PUBLIC_IDLE_TIMEOUT_MINUTES
ENV NEXT_TELEMETRY_DISABLED=1

RUN if [ -z "$NEXT_PUBLIC_API_URL" ]; then \
      echo "ERROR: NEXT_PUBLIC_API_URL build arg is required for admin-portal." >&2; \
      exit 1; \
    fi \
  && npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat curl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3001}/" >/dev/null || exit 1

CMD ["node", "server.js"]
