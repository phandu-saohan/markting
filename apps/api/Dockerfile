# ══════════════════════════════════════════════════════
# Dockerfile — API Service (NestJS)
# Multi-stage build, non-root user, production-ready
# ══════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ─────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile --filter api...

# ── Stage 2: Build ────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

RUN pnpm --filter api run build

# ── Stage 3: Production runtime ───────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Non-root user cho security
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/node_modules ./node_modules

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "apps/api/dist/main.js"]
