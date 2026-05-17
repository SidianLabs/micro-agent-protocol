# MAP Protocol Reference Server — Multi-stage Dockerfile
#
# Copyright © 2026 Sidian Labs
# SPDX-License-Identifier: Apache-2.0

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/
COPY schemas/ ./schemas/
COPY demo/ ./demo/
COPY packages/typescript/src/ ./packages/typescript/src/
COPY protocol/ ./protocol/

RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS production

LABEL org.opencontainers.image.title="MAP Protocol Reference Server"
LABEL org.opencontainers.image.description="Policy enforcement and audit layer for AI agents"
LABEL org.opencontainers.image.source="https://github.com/SidianLabs/micro-agent-protocol"
LABEL org.opencontainers.image.licenses="Apache-2.0"

ENV NODE_ENV=production
ENV PORT=8787
ENV MAP_DEPLOYMENT_PROFILE=open

RUN addgroup -g 1001 -S nodejs && adduser -S map -u 1001

WORKDIR /app

# Copy built output and install production deps only
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

RUN npm ci --omit=dev --ignore-scripts && \
    chown -R node:node /app

USER map

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["node", "dist/src/server-main.js"]