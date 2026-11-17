# Astro Kid API (Fastify + PostgreSQL). Build context: the repository root.
FROM node:20-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    RELEASES_DIR=/releases

WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY server/src ./src
COPY server/scripts ./scripts
COPY server/migrations ./migrations
COPY deploy/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint.sh
RUN chmod +x /usr/local/bin/api-entrypoint.sh && mkdir -p /releases

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/api-entrypoint.sh"]
CMD ["node", "src/server.js"]
