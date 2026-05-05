FROM node:25-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/game/package.json apps/game/package.json
RUN npm ci
COPY apps/game apps/game
ARG VITE_APP_VERSION=0.0.0
ENV VITE_APP_VERSION=$VITE_APP_VERSION
RUN npm run build -w apps/game

FROM nginx:alpine
COPY apps/game/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/game/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
