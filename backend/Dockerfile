# === Stage 1: Dependencies ===
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# === Stage 2: Build/Generate ===
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# === Stage 3: Runtime ===
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# sharp braucht libvips zur Laufzeit
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/prisma.config.ts ./

# Uploads-Verzeichnis vorbereiten (wird als Volume gemountet)
RUN mkdir -p /app/uploads/original /app/uploads/thumbnails /app/uploads/pdfs

EXPOSE 3000

# Migrations beim Start anwenden, dann Server hochfahren
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]