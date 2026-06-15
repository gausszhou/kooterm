# KooTerm

3-package pnpm monorepo: `kooterm-common` → `kooterm-portal` → `kooterm-service`.

## Build & Dev

```bash
pnpm build                          # common → portal → service (顺序重要)
pnpm build:common                   # 单包构建
pnpm dev:portal                     # Vite 3002, 自动代理 /api/ws/* → 3001
pnpm dev:service                    # nodemon + tsx, 监听 3001
pnpm start                          # node dist/index.js (生产)
pnpm serve                          # build + start
```

- `kooterm-common`: `vite build && pnpm tsc`（vite 出 bundle，tsc 出 .d.ts）
- `kooterm-portal`: `vite build`，资源输出到 `dist/portal-direct-assets/`
- `kooterm-service`: `pnpm tsc` 到 `dist/`

## Test

```bash
pnpm test:common                    # vitest run（common 包）
```

- vitest config 在 `vitest.config.ts`，环境 `node`，有 `setupFiles`
- WebSocket 不可用时需要 setup mock（见 `tests/setup.ts`）

## Deploy

```bash
docker-compose up -d --build        # 全量构建启动
docker-compose up -d --build kooterm # 只重建 kooterm
```

- Dockerfile: builder（node:20）→ runner（ubuntu 24.04）
- `.dockerignore` 排除 `packages/*/dist`，构建产物在容器内生成
- HTTP 53001→3001, HTTPS 53443→3443（自签证书）
- LOG_LEVEL 环境变量控制服务端日志级别

## 架构要点

**前端（portal）**
- Vue 3 + Vue Router + Vite
- 路由：`/terminal`, `/desktop`, `/opencode`, `/openvscode`
- Service Worker `/tcp-proxy-sw.js`
  - 拦截 `/tcp-proxy/{host}:{port}/*`（通过 `parseUrl`）
  - 拦截所有来自已代理 iframe 的非 `/api*`、非 `/portal-direct-assets/*` 请求（通过 `proxySessions` 按 `event.clientId` 匹配）
  - 对 `text/html` 等文本响应做 URL 重写（`rewriteHtml`），排除 `/portal-direct-assets/`
  - header 查找用 `getHeader()`（大小写不敏感）
  - 超时 10s
- `useTcpProxy` hook：SW message → KTP tunnel → TCP socket（每个 HTTP 请求独立 tunnel）
- `HttpCodec.collectResponse` 在 `tunnel.send()` 之前设置 `tunnel.onData`

**后端（service）**
- Express + `ws`，共享同一个 HTTP server
- WebSocket 路径：`/api/ws/terminal`, `/api/ws/vnc`, `/api/ws/tcp`
- `express.static` 挂载 `kooterm-portal/dist`（含 `/portal-direct-assets` 独立挂载，1y immutable）
- TCP 代理服务端：`src/websocket/tcp/`，TCP_INIT → TCP_DATA/TCP_ERROR 帧

**协议（common）**
- KTP 帧：12 字节头 + payload
  ```
  FrameType(1) | Reserved(1) | RemotePort(2) | PayloadLen(4) | Identifier(4)
  ```
- FrameType: PING=0x01, PONG=0x02, TCP_INIT=0x31, TCP_DATA=0x32, TCP_ERROR=0x33
- TcpErrorType: REFUSED=0x01, TIMEOUT=0x02, RESET=0x03, CLOSED=0x04

## 已知约束

- `pnpm` 版本 ≥ 8，Node ≥ 18
- `dist/` 可能是 Docker root 权限，本地无法 rm（用 `--emptyOutDir false` 或清 Docker 产物）
- vitest 在 node 环境运行，未 mock WebSocket 全局会抛 `WebSocket is not defined`

## 引用

- `packages/kooterm-service/src/index.ts` — Express entry
- `packages/kooterm-common/src/index.ts` — common lib entry
- `packages/kooterm-portal/public/tcp-proxy-sw.js` — SW
- `packages/kooterm-portal/src/hooks/useTcpProxy.ts` — SW ↔ KTP 桥接
