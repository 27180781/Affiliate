# Client image. Build context MUST be the repository root so we can bake the
# canonical tracking script (tracking/clicker-affiliate.js) into the site.
#
#   docker build -f client/Dockerfile -t clicker-affiliate-web .
#
# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
# Single source of truth for the tracking snippet → served at /clicker-affiliate.js
COPY tracking/clicker-affiliate.js ./public/clicker-affiliate.js

# The dashboard calls the API same-origin via the nginx /api proxy, so no
# build-time API URL is required. Override VITE_API_URL only for split hosting.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- serve stage ----
FROM nginx:alpine
# Where the SPA reaches the API. On CapRover this is the API app's internal
# name, e.g. srv-captain--affiliate-api:4000. Override via the app's env config.
ENV API_UPSTREAM=srv-captain--affiliate-api:4000
COPY client/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
