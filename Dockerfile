# ── Stage 1: dependencies ──────────────────────────────────────────────
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────────────
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The Prisma client must be generated for the container's platform, not the
# developer's. Placeholder URLs satisfy schema validation; nothing connects.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV DIRECT_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXTAUTH_SECRET="build-time-placeholder-not-used-at-runtime"
RUN npm run build

# ── Stage 3: runtime ───────────────────────────────────────────────────
FROM node:24-alpine AS runner
# The shop's day is a Colombo day, and every daily total — takings, banking,
# the drawer count, the report date filters — is cut at local midnight. The
# node images default to UTC, which would start the shop day at 5.30am and run
# it into the next morning. tzdata is needed for the zone to resolve at all.
RUN apk add --no-cache libc6-compat tzdata
ENV TZ=Asia/Colombo
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next's standalone bundle: server, its traced dependencies, and static assets.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# The Prisma CLI and schema are needed so the container can apply migrations on
# start. Without these the app boots against whatever the database happens to
# contain, which is how the schema and code drift apart.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
