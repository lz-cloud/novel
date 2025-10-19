# --- Base deps stage ---
FROM node:20-alpine AS deps
WORKDIR /app
# Install system deps
RUN apk add --no-cache openssl

# Copy package files
COPY backend/package*.json ./

# Install dependencies (include dev for Prisma)
RUN npm ci

# Copy backend source
COPY backend/ ./

# Generate Prisma client
RUN npx prisma generate --schema=src/prisma/schema.prisma

# --- Runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

# Copy node_modules and app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app ./

# Ensure correct ownership
RUN chown -R app:app /app
USER app

EXPOSE 4000

# Start: apply migrations (or push schema) then run server
CMD ["sh", "-lc", "npm run migrate:deploy || npm run db:push; npm start"]
