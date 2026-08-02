# Multi-stage build using Next.js standalone output. The final runtime image
# ships only the compiled server + its minimal traced dependencies - not npm,
# not devDependencies, not the full node_modules tree - so the npm-bundled
# tooling CVEs (tar, brace-expansion, undici, etc. from Node's own npm CLI)
# never reach the running image, the same way pip is excluded from the
# backend's runtime image.

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk update && apk upgrade --no-cache
COPY package.json package-lock.json ./
RUN npm ci


FROM node:24-alpine AS builder
WORKDIR /app
RUN apk update && apk upgrade --no-cache
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


FROM node:24-alpine AS runner
WORKDIR /app
RUN apk update && apk upgrade --no-cache

ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# The base image ships a global npm CLI (and its own bundled deps: tar,
# brace-expansion, undici, sigstore, etc.) that this container never invokes
# at runtime - it only runs the standalone `node server.js` traced output.
# Strip it so npm's own bundled-dependency CVEs don't show up in image scans
# for code that is never executed here.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=builder /app/public ./public
COPY --from=builder --chown=appuser:appgroup /app/.next/standalone ./
COPY --from=builder --chown=appuser:appgroup /app/.next/static ./.next/static

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
