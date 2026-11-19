# Build from the repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS base
WORKDIR /app
# Every workspace manifest is needed so `npm ci` matches the lockfile.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/

FROM base AS build
RUN npm ci --ignore-scripts -w @tanaw/api -w @tanaw/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @tanaw/shared && npm run build -w @tanaw/api

FROM base AS runtime
ENV NODE_ENV=production
RUN npm ci --omit=dev --ignore-scripts -w @tanaw/api -w @tanaw/shared && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
WORKDIR /app/apps/api
ENV PORT=4000 STORAGE_LOCAL_DIR=/app/storage
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/health > /dev/null || exit 1
CMD ["node", "dist/server.js"]
