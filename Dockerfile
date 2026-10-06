FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json ./
RUN pnpm install
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json ./
RUN pnpm install --prod
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
