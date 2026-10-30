FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY ops/Caddyfile /etc/caddy/Caddyfile
