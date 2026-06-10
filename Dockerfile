# syntax=docker/dockerfile:1
FROM node:20 AS builder

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages/kooterm-common/package.json packages/kooterm-common/
COPY packages/kooterm-portal/package.json packages/kooterm-portal/
COPY packages/kooterm-service/package.json packages/kooterm-service/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install

COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm build

FROM ubuntu:22.04 AS runner

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sudo \
    ca-certificates \
    locales \
    btop \
    && locale-gen en_US.UTF-8 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /usr/share/doc /usr/share/man /usr/share/info

ADD https://github.com/fastfetch-cli/fastfetch/releases/latest/download/fastfetch-linux-amd64.deb /tmp/fastfetch.deb
RUN dpkg -i /tmp/fastfetch.deb && rm -f /tmp/fastfetch.deb

ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

WORKDIR /app

COPY ssl /ssl
ENV SSL_KEY_PATH=/ssl/key.pem SSL_CERT_PATH=/ssl/cert.pem

COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/kooterm-common/package.json packages/kooterm-common/
COPY --from=builder /app/packages/kooterm-common/dist packages/kooterm-common/dist
COPY --from=builder /app/packages/kooterm-portal/package.json packages/kooterm-portal/
COPY --from=builder /app/packages/kooterm-portal/dist packages/kooterm-portal/dist
COPY --from=builder /app/packages/kooterm-service/package.json packages/kooterm-service/
COPY --from=builder /app/packages/kooterm-service/dist packages/kooterm-service/dist
COPY --from=builder /app/packages/kooterm-service/node_modules packages/kooterm-service/node_modules
COPY --from=builder /app/node_modules node_modules

ENV PORT=3001
EXPOSE 3001

CMD ["node", "packages/kooterm-service/dist/index.js"]
