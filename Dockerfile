FROM node:24-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/sorane
COPY package.json package-lock.json ./
COPY packages ./packages
RUN npm ci --omit=dev

FROM node:24-bookworm-slim

LABEL org.opencontainers.image.source="https://github.com/masanork/sorane"

WORKDIR /opt/sorane
COPY --from=build /opt/sorane /opt/sorane
RUN mkdir -p /workspace && chown node:node /workspace

WORKDIR /workspace
USER node
ENTRYPOINT ["node", "/opt/sorane/packages/cli/bin/sorane.mjs"]
