# One image for api (serving the built web), worker and the local fake engine. Runs as the non-root `node` user.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3001
CMD ["node", "apps/api/src/main.ts"]
