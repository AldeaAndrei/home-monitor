FROM node:22-alpine AS base
WORKDIR /app

# -------------------
# Dependencies
# -------------------
FROM base AS deps
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# -------------------
# Build
# -------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN \
  if [ -f yarn.lock ]; then yarn build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# -------------------
# Runtime
# -------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]

# -------------------
# Scheduler (daily summary cron)
# -------------------
FROM base AS scheduler
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Europe/Bucharest

# Without tzdata Alpine silently falls back to UTC and cron fires at the wrong hour
RUN apk add --no-cache tzdata

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY lib ./lib
COPY app/scripts ./app/scripts

COPY docker/crontab /etc/crontabs/root
# BusyBox cron rejects CRLF line endings and non-0600 crontabs
RUN sed -i 's/\r$//' /etc/crontabs/root && chmod 0600 /etc/crontabs/root

CMD ["crond", "-f", "-d", "8"]
