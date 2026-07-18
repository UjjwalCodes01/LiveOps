# Multi-stage build so the runtime image ships only production
# dependencies and compiled output — no TypeScript, no dev tooling, no
# source maps to the wrong paths, no .env (see .dockerignore).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY scripts ./scripts

# Non-root — this only needs to talk to Postgres and the AWS/OpenAI APIs,
# never the host filesystem beyond its own working directory.
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:4000/api/health || exit 1

# start:prod runs `npm run migrate` first — schema_migrations + the
# Postgres advisory lock in scripts/migrate.cjs already make this safe to
# run on every container start, including concurrent replicas.
CMD ["npm", "run", "start:prod"]
