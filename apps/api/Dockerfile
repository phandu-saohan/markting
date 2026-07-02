# ══════════════════════════════════════════════════════
# Dockerfile — API Service (NestJS)
# Context: thư mục gốc repo (c:\Marketing)
# ══════════════════════════════════════════════════════

# ── Stage 1: Build ─────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Cài pnpm
RUN npm install -g pnpm@9.15.4

# Copy toàn bộ source (context là thư mục gốc)
COPY . .

# Cài dependencies cho API
WORKDIR /app/apps/api
RUN pnpm install --no-frozen-lockfile

# Build NestJS API
RUN npx nest build

# ── Stage 2: Production runtime ───────────────────────
FROM node:22-alpine AS production
WORKDIR /app

RUN npm install -g pnpm@9.15.4

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copy package.json và cài production deps
COPY --from=builder /app/apps/api/package.json ./
RUN pnpm install --prod --no-frozen-lockfile

# Copy dist từ builder
COPY --from=builder /app/apps/api/dist ./dist

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
