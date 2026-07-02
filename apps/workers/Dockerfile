# ══════════════════════════════════════════════════════
# Dockerfile — Workers Service (NestJS + Puppeteer)
# Context: thư mục gốc repo (c:\Marketing)
# ══════════════════════════════════════════════════════

# ── Stage 1: Build ─────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9.15.4

# Copy toàn bộ source
COPY . .

# Cài dependencies cho Workers
WORKDIR /app/apps/workers
RUN pnpm install --no-frozen-lockfile

# Build NestJS Workers
RUN npx nest build

# ── Stage 2: Production runtime với Chromium ──────────
FROM node:22-alpine AS production
WORKDIR /app

# Cài Chromium + các thư viện đồ họa Linux cho Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    && rm -rf /var/cache/apk/*

# Puppeteer dùng Chromium hệ thống, không tự tải
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN npm install -g pnpm@9.15.4

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S workers -u 1001

# Copy package.json và cài production deps
COPY --from=builder /app/apps/workers/package.json ./
RUN pnpm install --prod --no-frozen-lockfile

# Copy dist từ builder
COPY --from=builder /app/apps/workers/dist ./dist

USER workers

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
  CMD pgrep node || exit 1

CMD ["node", "dist/main.js"]
