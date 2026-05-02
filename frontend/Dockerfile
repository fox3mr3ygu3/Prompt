# Multi-stage: build the Vite SPA, then ship the static artefact.
# The static files are then copied into the nginx container's /var/www/html
# via a shared volume in compose. We don't run a Node server in prod.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . ./
RUN npm run build

# Static-output image — used by the compose `frontend` service to seed the
# shared /var/www/html volume on startup.
FROM alpine:3 AS static
WORKDIR /out
COPY --from=build /app/dist/ ./
CMD ["sh", "-c", "cp -r /out/. /www/ && tail -f /dev/null"]
