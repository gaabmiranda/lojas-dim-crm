# ─── deps ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN NODE_ENV=development PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

# ─── builder ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Incrementar CACHE_BUST força rebuild limpo quando o cache do BuildKit ficar stale.
ARG CACHE_BUST=20260606
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

# scripts/migrate-prod.js já é bundle standalone (gerado localmente via esbuild,
# inclui drizzle-orm + postgres + dotenv). Não precisa compilar aqui.

# ─── runner ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=America/Sao_Paulo

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && apk add --no-cache tzdata curl \
    && cp /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime \
    && echo "America/Sao_Paulo" > /etc/timezone

# Standalone bundle do Next + estáticos.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Bundles standalone (esbuild) — migrate + seeds idempotentes + admin (sob demanda).
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-prod.js ./scripts/migrate-prod.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/seed-templates.js ./scripts/seed-templates.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/create-admin.js ./scripts/create-admin.js
COPY --from=builder --chown=nextjs:nodejs /app/db/seed/feature_flags.js ./scripts/feature_flags.js

COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

ENTRYPOINT ["./entrypoint.sh"]
