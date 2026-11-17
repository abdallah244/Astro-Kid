# Astro Kid website + browser game, built with Vite and served by nginx. Build context: the repository root.
FROM node:20-alpine AS build
ARG SITE_URL=
ENV VITE_MOCK_AUTH=false \
    VITE_SITE_URL=${SITE_URL}
WORKDIR /src/game
COPY game/package.json game/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY game/ ./
RUN npm run build \
 && if [ -n "$SITE_URL" ]; then \
      find dist -maxdepth 1 \( -name '*.html' -o -name 'sitemap.xml' -o -name 'robots.txt' \) \
        -exec sed -i "s#https://example.com#${SITE_URL}#g; s#https://astrokid.site#${SITE_URL}#g; s#\[Website URL\]#${SITE_URL}#g" {} + ; \
    fi

FROM nginx:1.27-alpine
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/game/dist /usr/share/nginx/html
RUN mkdir -p /releases
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
