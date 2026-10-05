# Splity API. Built and run by docker-compose.yml at the project root.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dependencies first, so a code-only change reuses this layer.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Local-upload fallback folder (a volume in compose), owned by the non-root user.
RUN mkdir -p uploads && chown node:node uploads
USER node

EXPOSE 4000

# Exec form: Docker's stop signal reaches Node itself, so server.js gets its
# SIGTERM and closes AI jobs and sockets before exiting.
CMD ["node", "src/server.js"]
