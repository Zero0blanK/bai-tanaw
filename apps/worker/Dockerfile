# Build from the repo root: docker build -f apps/worker/Dockerfile .
FROM node:22-alpine AS base
WORKDIR /app
# OpenSSL for Prisma's engines; Nmap runs inside the worker (service detection only, -T3).
# Unprivileged, so Nmap uses TCP connect scans.
# nmap-scripts holds nse_main.lua, which -sV needs even without --script.
RUN apk add --no-cache openssl nmap nmap-scripts
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
# The worker postinstall generates the Prisma client from the API's schema.
COPY apps/api/prisma apps/api/prisma

FROM base AS build
RUN npm ci -w @tanaw/worker -w @tanaw/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN npm run build -w @tanaw/shared && npm run build -w @tanaw/worker

FROM base AS runtime
ENV NODE_ENV=production
RUN npm ci --omit=dev -w @tanaw/worker -w @tanaw/shared && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
WORKDIR /app/apps/worker
ENV NMAP_BIN=nmap STORAGE_LOCAL_DIR=/app/storage
CMD ["node", "dist/index.js"]
