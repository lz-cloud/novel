# Build static assets
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Run with unprivileged nginx (listens on :8080)
FROM nginxinc/nginx-unprivileged:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
