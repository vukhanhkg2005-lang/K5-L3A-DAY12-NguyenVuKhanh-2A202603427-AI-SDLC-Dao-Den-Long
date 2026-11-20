FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 4173
CMD ["node", "src/run.js", "--host", "0.0.0.0", "--port", "4173"]
