# PHP backend for NovelHub (no Redis/SQL, file-based storage)
FROM php:8.2-cli-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy backend source
COPY novelhub/backend/public ./public
COPY novelhub/backend/src ./src

# Ensure data directory exists and is writable
RUN mkdir -p /app/data && chown -R app:app /app

USER app

EXPOSE 4000

# Start PHP built-in server
CMD ["php", "-S", "0.0.0.0:4000", "-t", "public", "public/index.php"]
