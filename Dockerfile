FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html postcss.config.js tailwind.config.ts tsconfig.json tsconfig.app.json tsconfig.server.json vite.config.ts ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine AS runtime

RUN apk add --no-cache ca-certificates dumb-init

ENV NODE_ENV=production
ENV APP_CONFIG_FILE=/app/config/config.yaml
ENV DATA_DIR=/app/data

WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node sentinel ./sentinel
COPY --chown=node:node config.docker.example.yaml /app/config/config.yaml

RUN mkdir -p /app/data \
  && chown node:node /app/data \
  && chmod 400 /app/config/config.yaml
USER node

EXPOSE 1000
VOLUME ["/app/data"]
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server/index.js"]
