# Admin panel: built with Node, then served as static files by Nginx. The same
# Nginx also fronts the API (see deploy/nginx/templates).
FROM node:24-alpine AS build

WORKDIR /app
# .npmrc carries legacy-peer-deps (react-helmet-async still declares React <=18).
COPY package*.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
