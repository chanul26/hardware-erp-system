# STAGE 1: Dependencies
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# STAGE 2: Builder
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Critical: Generate Prisma for the correct engine
RUN npx prisma generate
RUN npm run build

# STAGE 3: Runner
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# The shop's day is a Colombo day, and every daily total — takings, banking,
# the drawer count, the reports date filters — is cut at local midnight. The
# node images default to UTC, which would start the shop day at 5.30am and run
# it into the next morning. tzdata is needed for the zone to resolve at all.
RUN apk add --no-cache tzdata
ENV TZ=Asia/Colombo

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create public folder if it doesn't exist to prevent crash
RUN mkdir public

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Only copy public if it actually exists in the builder
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]