# Multi-stage Next.js standalone Docker build for the Tempest dashboard.
#
# Stage 1 (deps):    install all deps needed for the build.
# Stage 2 (builder): run the build, producing the standalone artifact.
# Stage 3 (runner):  minimal runtime — Node + the standalone bundle.
#
# The final image runs `node server.js` directly from the standalone
# output. `next start` is intentionally NOT used; the standalone bundle
# includes its own server and bundles only the runtime deps it needs,
# producing a much smaller image (~150 MB vs ~700 MB for full deps).

# ──────────────────────────────────────────────────────────────────
# Stage 1: deps — install everything needed to run the build.
# ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# libc6-compat resolves missing glibc symbols some npm binaries expect
# on Alpine. Cheap insurance.
RUN apk add --no-cache libc6-compat
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ──────────────────────────────────────────────────────────────────
# Stage 2: builder — produce .next/standalone via `pnpm build`.
# ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next telemetry (anonymous usage data — nothing personal, but
# off-by-default for a self-hosted appliance).
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ──────────────────────────────────────────────────────────────────
# Stage 3: runner — minimal runtime image.
# ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Non-root user — standard Next.js Docker hardening.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone server output. The standalone bundle already
# includes the minimum node_modules required at runtime; we add the
# `public/` folder and the `.next/static` chunks (CSS/JS) Next serves
# directly.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
