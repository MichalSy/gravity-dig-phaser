FROM node:25-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY packages/debug-protocol/package.json packages/debug-protocol/package.json
COPY apps/editor/package.json apps/editor/package.json
RUN npm ci
COPY packages/debug-protocol packages/debug-protocol
COPY apps/editor apps/editor
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w packages/debug-protocol && npm run build -w apps/editor

FROM node:25-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=80
COPY --from=build /app/apps/editor/.next/standalone ./
COPY --from=build /app/apps/editor/.next/static ./apps/editor/.next/static
COPY --from=build /app/apps/editor/public ./apps/editor/public
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1
CMD ["node", "apps/editor/server.js"]
