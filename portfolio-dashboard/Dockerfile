# Build the static bundle, then serve it from nginx (which also proxies /api/figi).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# nginx's entrypoint renders /etc/nginx/templates/*.template with envsubst into conf.d
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/njs/ /etc/nginx/njs/
COPY --chmod=755 deploy/10-users.sh /docker-entrypoint.d/10-users.sh
COPY --chmod=755 deploy/15-data-dir.sh /docker-entrypoint.d/15-data-dir.sh
COPY --from=build /app/dist /usr/share/nginx/html
ENV OPENFIGI_API_KEY=""
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
