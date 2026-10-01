FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
	chromium fonts-liberation fonts-dejavu-core ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
	PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM base AS deps-prod
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
COPY --chown=node:node package.json ./
COPY --from=deps-prod --chown=node:node /app/node_modules ./node_modules
COPY --from=build     --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
