# KooTerm

KooTerm - Web 终端和 Web VNC 技术调研

## 预览

![](https://www.gausszhou.top/static/data/github/kooterm/btop.png)

![](https://www.gausszhou.top/static/data/github/kooterm/vnc.webp)

## 部署 VNC

VNC 镜像预装了 `fastfetch`、`btop` 等工具。

### 预构建镜像

```bash
# macos-vnc
docker run -d --name macos -p 5900:5900 -p 8006:8006 \
  -e "VERSION=14" -e VNC_RESOLUTION=1024x768 \
  --device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN \
  -v "${PWD:-.}/macos:/storage" --stop-timeout 120 dockurr/macos

# ubuntu-xfce-vnc
docker build -f Dockerfile.ubuntu-xfce-vnc -t ubuntu-xfce-vnc .
docker run -d --name ubuntu-xfce-vnc -p 5900:5900 ubuntu-xfce-vnc
## VNC 连接 localhost:5900，密码 vncpassword

# ubuntu-gnome-vnc
docker build -f Dockerfile.ubuntu-gnome-vnc -t ubuntu-gnome-vnc .
docker run -d --name ubuntu-gnome-vnc -p 5900:5900 ubuntu-gnome-vnc
## VNC 连接 localhost:5900，密码 vncpassword
```

## Docker 部署

```bash
# 首次启动（自动构建所有镜像）
docker-compose up -d

# 重新构建并重启所有服务
docker-compose up -d --build

# 只重建 kooterm 服务，跳过 VNC 镜像构建
#（VNC Dockerfile 无变动时走缓存，改动大时可先单独打 tag）
docker build -f Dockerfile.ubuntu-xfce-vnc -t ubuntu-xfce-vnc .
docker-compose up -d --build kooterm

# 查看日志
docker-compose logs -f

# 仅查看 kooterm 日志
docker-compose logs -f kooterm

# 进入容器调试（基于 Ubuntu，支持 apt/sudo）
docker exec -it kooterm bash
```

访问 `http://localhost:53001`（HTTP）或 `https://localhost:53443`（HTTPS，自签证书）即可打开终端。

## 开发

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev:portal    # 启动前端门户 (端口由 Vite 自动分配)
pnpm dev:service   # 启动后端服务 (端口由服务配置决定)
```

### 生产构建

```bash
pnpm build
```

构建脚本会依次构建：`kooterm-common` → `kooterm-portal` → `kooterm-service`。

### 启动服务

```bash
pnpm start
```

### 其他命令

```bash
pnpm lint     # 代码检查
pnpm clean    # 清理构建产物
```

## 许可证

MIT License
