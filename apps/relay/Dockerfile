FROM node:25-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/debug-protocol/package.json packages/debug-protocol/package.json
COPY apps/relay/package.json apps/relay/package.json
RUN npm ci
COPY packages/debug-protocol packages/debug-protocol
COPY apps/relay apps/relay
RUN npm run build -w packages/debug-protocol && npm run build -w apps/relay

FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY packages/debug-protocol/package.json packages/debug-protocol/package.json
COPY apps/relay/package.json apps/relay/package.json
RUN npm ci --omit=dev -w apps/relay -w packages/debug-protocol && npm cache clean --force
COPY --from=build /app/packages/debug-protocol/dist packages/debug-protocol/dist
COPY --from=build /app/apps/relay/dist apps/relay/dist
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1
CMD ["npm", "run", "start", "-w", "apps/relay"]
