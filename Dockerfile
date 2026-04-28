# syntax=docker/dockerfile:1.7

# ----- Builder -----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

ENV PNPM_HOME=/usr/local/share/pnpm \
    PATH=/usr/local/share/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

COPY . .

# Generate Prisma client + build Next.js (uses output: "standalone")
RUN pnpm exec prisma generate && pnpm build

# Prune to production deps for the runtime stage
RUN pnpm prune --prod

# ----- Runtime -----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="file:/app/data/prod.db"

# OpenSSL is required by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates wget \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --create-home --shell /bin/bash nextjs \
    && mkdir -p /app/data && chown -R nextjs:nodejs /app

# Standalone Next output (server.js + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma assets needed at runtime (schema + migrations + engine)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin

COPY --chown=nextjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
