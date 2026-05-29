# --- Build-Stage ---
FROM node:24-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# API-URL zur Build-Zeit einbacken (Vite ersetzt import.meta.env.VITE_*)
ARG VITE_API_BASE=https://kietec-api.kriwi-dl.de
ENV VITE_API_BASE=$VITE_API_BASE

RUN npm run build

# --- Serve-Stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]