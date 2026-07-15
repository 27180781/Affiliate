# Server image. Build context MUST be the repository root so we can bake the
# db/*.sql files into the image (used by `npm run migrate`).
#
#   docker build -f server/Dockerfile -t clicker-affiliate-api .
#
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install dependencies first for better layer caching.
COPY server/package*.json ./
RUN npm ci --omit=dev

# Application source
COPY server/src ./src

# Bake the SQL migrations in and tell migrate.js where to find them.
COPY db /app/db
ENV DB_DIR=/app/db

EXPOSE 4000

# Run migrations, then exec the API so it becomes PID 1 and receives SIGTERM
# (enabling the graceful shutdown handler). If you seed, append `--seed`.
CMD ["sh", "-c", "node src/migrate.js && exec node src/index.js"]
