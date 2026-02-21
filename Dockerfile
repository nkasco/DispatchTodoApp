# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV DATABASE_URL=/app/data/dispatch.db
ENV AUTH_TRUST_HOST=true

RUN apt-get update && apt-get install -y --no-install-recommends procps && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs dispatch

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/src/mcp-server ./src/mcp-server
COPY --from=builder /app/src/db/index.ts ./src/db/index.ts
COPY --from=builder /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=builder /app/src/lib/db-encryption.ts ./src/lib/db-encryption.ts
COPY --from=builder /app/src/lib/timezone.ts ./src/lib/timezone.ts
COPY --from=builder /app/docker/entrypoint.sh ./docker/entrypoint.sh
COPY --from=builder /app/docker/repair-migrations.js ./docker/repair-migrations.js

RUN mkdir -p /app/data
RUN chown -R dispatch:nodejs /app

USER dispatch

VOLUME ["/app/data"]

EXPOSE 3000
EXPOSE 3001

CMD ["sh", "/app/docker/entrypoint.sh"]
