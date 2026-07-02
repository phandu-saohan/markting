# ══════════════════════════════════════════════════════
# Dockerfile — Workers Service (NestJS + Puppeteer)
# Includes Chromium for headless browser automation
# ══════════════════════════════════════════════════════

# ── Stage 1: Install dependencies ─────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/workers/package.json ./apps/workers/

RUN pnpm install --no-frozen-lockfile --filter workers...

# ── Stage 2: Build ────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/workers/node_modules ./apps/workers/node_modules
COPY . .

RUN pnpm --filter workers run build

# ── Stage 3: Production runtime với Chromium ──────────
FROM node:22-alpine AS production
WORKDIR /app

# Cài Chromium + dependencies cho Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    # Appium / ADB dependencies (optional, uncomment nếu dùng Zalo ADB)
    # android-tools \
    && rm -rf /var/cache/apk/*

# Báo cho Puppeteer dùng Chromium hệ thống thay vì tải riêng
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S workers -u 1001

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-workspace.yaml ./
COPY apps/workers/package.json ./apps/workers/
COPY --from=builder /app/apps/workers/dist ./apps/workers/dist
COPY --from=deps /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=deps /app/node_modules ./node_modules

USER workers

# Workers không expose port HTTP
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD pgrep node || exit 1

CMD ["node", "apps/workers/dist/main.js"]
