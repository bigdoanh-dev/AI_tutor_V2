FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations
COPY data ./data
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "npm run migrate && npm start"]
