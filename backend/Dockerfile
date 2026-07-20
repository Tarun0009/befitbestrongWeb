# ---- Shared Node 20 base --------------------------------------------------
FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS base
WORKDIR /app
# Prisma detects OpenSSL while dependencies/client are generated and needs it
# again when the API or migration release job starts.
RUN apk add --no-cache openssl
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate

# ---- Full build dependencies ----------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ---- Production dependencies ----------------------------------------------
# A separate stage prevents dev dependencies from surviving in image history.
# Prisma is intentionally a production dependency because the release job runs
# `prisma migrate deploy` from this same image.
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY prisma ./prisma
RUN pnpm prisma generate

# ---- Build ---------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ---- Runtime -------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=4000

RUN addgroup -S app && adduser -S app -G app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Render's free Docker service does not provide a separate release job.
# Run the idempotent Prisma migration step before starting the API. Render can
# override this with a pre-deploy command on plans that support one.
CMD ["/bin/sh", "-c", "pnpm run migrate:deploy && exec node dist/server.js"]

