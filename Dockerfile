# syntax=docker/dockerfile:1

# ---- Build stage: install all deps and produce dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Runtime stage: production deps + built output only ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built client + bundled server (dist/index.cjs) + bundled migrator (dist/migrate.cjs).
COPY --from=build /app/dist ./dist
# Committed SQL migrations, applied at deploy time by `node dist/migrate.cjs`.
COPY --from=build /app/migrations ./migrations

EXPOSE 5000

# Simple liveness check against the health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.cjs"]
