FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY public ./public
COPY server ./server
COPY cloud-run ./cloud-run

USER node
EXPOSE 8080
CMD ["node", "cloud-run/server.mjs"]
