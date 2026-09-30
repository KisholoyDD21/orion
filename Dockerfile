FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY server ./server
COPY client ./client
COPY docs ./docs
COPY data ./data
COPY scripts ./scripts
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node", "server/index.js"]
