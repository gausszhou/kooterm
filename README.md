# KooTerm

KooTerm - Web 终端和 Web VNC 技术调研

## 预览

![](https://www.gausszhou.top/static/data/github/kooterm/terminal.png)

![](https://www.gausszhou.top/static/data/github/kooterm/vnc.webp)

## 部署 VNC

### 预构建镜像

```bash
# macos-vnc
docker run -d --name macos -p 5900:5900 -p 8006:8006 -e "VERSION=14" -e VNC_RESOLUTION=1024x768 --device=/dev/kvm --device=/dev/net/tun --cap-add NET_ADMIN -v "${PWD:-.}/macos:/storage" --stop-timeout 120 dockurr/macos
# ubuntu-xfce-vnc
docker run -d --name ubuntu-xfce -p 5901:5901 -p 6901:6901 -e VNC_PW="vncpassword" -e VNC_RESOLUTION=1024x768 consol/ubuntu-xfce-vnc
```

### ubuntu-gnome-vnc（自定义）

```bash
# 构建镜像
docker build -f dockers/Dockerfile.ubuntu-gnome-vnc -t ubuntu-gnome-vnc .

# 运行容器
docker run -d --name ubuntu-gnome-vnc -p 5902:5901 ubuntu-gnome-vnc

# VNC 连接 localhost:5902，密码 vncpassword
```

## Docker 部署

```bash
# 构建镜像
docker build -t kooterm .

# 首次运行
docker run -d --name kooterm -p 53001:3001 kooterm

# 重新构建并重启（更新代码后）
docker build -t kooterm . && docker stop kooterm && docker rm kooterm && docker run -d --name kooterm -p 53001:3001 kooterm

# 查看日志
docker logs -f kooterm

# 进入容器调试（基于 Ubuntu，支持 apt/sudo）
docker exec -it kooterm bash
```

访问 `http://localhost:3001` 即可打开终端。

## 开发

### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

### 开发模式

```bash
# 分别启动服务
pnpm dev:portal    # 启动前端门户 (端口由Vite自动分配)
pnpm dev:service   # 启动后端服务 (端口由服务配置决定)
```

### 生产构建

```bash
# 构建所有项目
pnpm build

# 构建脚本会依次构建：
# 1. kooterm-common (公共库)
# 2. kooterm-portal (前端门户)
# 3. kooterm-service (后端服务)
```

### 启动服务

```bash
# 启动后端服务
pnpm start
```

### 其他命令

```bash
# 代码检查
pnpm lint

# 清理构建产物
pnpm clean
```

## 许可证

MIT License