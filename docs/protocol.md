# KooTerm Protocol (KTP)

KooTerm 的通信协议栈，基于 WebSocket 传输层实现多路复用的二进制帧协议，支持终端、VNC、TCP 隧道等多种业务。

## 协议栈概览

```
┌──────────────────────────────────────────────────────────┐
│  Layer 4: 应用协议                                        │
│  ├── HttpCodec      HTTP 请求/响应编解码                   │
│  └── WebSocketCodec WebSocket 帧编解码 (RFC 6455)        │
├──────────────────────────────────────────────────────────┤
│  Layer 3: TCP 隧道 (原始字节传输)                          │
│  └── TcpTunnel      TCP_INIT + TCP_DATA                  │
├──────────────────────────────────────────────────────────┤
│  Layer 2: KTP 二进制帧协议 (多路复用)                       │
│  └── FrameCodec / Frame / FrameType                      │
├──────────────────────────────────────────────────────────┤
│  Layer 1: WebSocket 传输层                                │
│  └── WebSocketConnection / WebSocketDataChannel           │
└──────────────────────────────────────────────────────────┘
```

数据流向：浏览器 ↔ WebSocket ↔ KooTerm 服务端 ↔ TCP socket ↔ 目标服务

## Layer 1: WebSocket 传输层

### WebSocketConnection

管理底层 WebSocket 连接，提供多路复用能力。

- 维护一个原生 WebSocket 实例
- 管理多个 `WebSocketDataChannel`（逻辑子通道）
- 通过 `identifier` 路由消息到正确的子通道
- 内置 ping/pong 保活和 RTT 测量
- 统计上行/下行字节数和速率

```typescript
const conn = new WebSocketConnection('ws://localhost:3001');
const terminalChannel = conn.createDataChannel('terminal');  // identifier: 随机数
const vncChannel = conn.createDataChannel('vnc');            // identifier: 另一个随机数
```

### WebSocketDataChannel

逻辑子通道，共享父连接的 WebSocket，拥有独立的 `identifier`。

- 实现 `WebSocket` 接口（可被 noVNC 等库直接使用）
- 每个 channel 有唯一 `identifier`（28 位随机数）
- 消息自动路由：服务端返回的帧通过 `identifier` 分发到对应 channel
- 可自定义 `encode`/`decode` 方法（如 VNC 需要包装 VNC_DATA 帧）

```typescript
// 每个 channel 独立收发数据
terminalChannel.onmessage = (ev) => { /* 处理终端数据 */ };
vncChannel.onmessage = (ev) => { /* 处理 VNC 数据 */ };
```

## Layer 2: KTP 二进制帧协议

### 帧格式

所有通信使用统一的二进制帧格式（大端序），共 12 字节头：

```
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|  FrameType (1B) | Reserved (1B)|       Remote Port (2B)        |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Payload Length (4B)                       |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                       Identifier (4B)                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                        Payload...                             |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

| 字段 | 大小 | 说明 |
|------|------|------|
| FrameType | 1 字节 | 帧类型（枚举值） |
| Reserved | 1 字节 | 保留位（当前为 0） |
| Remote Port | 2 字节 | 远程端口号（大端序，TCP 帧携带目标端口，其他帧为 0） |
| Payload Length | 4 字节 | 载荷长度（大端序） |
| Identifier | 4 字节 | 通道标识符（大端序，用于多路复用） |
| Payload | N 字节 | 载荷数据 |

**Header 总大小：12 字节**

### FrameType 枚举

```typescript
enum FrameType {
  // 控制帧
  PING  = 0x01,
  PONG  = 0x02,

  // 终端业务帧
  TERMINAL_INIT    = 0x11,  // 初始化终端会话
  TERMINAL_REFRESH = 0x12,  // 刷新终端
  TERMINAL_DATA    = 0x13,  // 终端输入输出数据
  TERMINAL_RESIZE  = 0x14,  // 终端窗口大小调整

  // VNC 业务帧
  VNC_INIT = 0x21,  // 初始化 VNC 连接
  VNC_DATA = 0x22,  // VNC 数据

  // TCP 隧道帧
  TCP_INIT = 0x31,  // 建立 TCP 隧道
  TCP_DATA = 0x32,  // TCP 数据转发
}
```

### FrameCodec

编解码工具类：

```typescript
// 编码（默认 port=0）
const frame = FrameCodec.create(FrameType.TERMINAL_DATA, channel.identifier, 'ls\n');
ws.send(frame.toBuffer());

// 编码 TCP 帧（携带远程端口）
const tcpFrame = FrameCodec.create(FrameType.TCP_DATA, tunnel.identifier, payload, 4096);

// 解码
const received = FrameCodec.decode(arrayBuffer);
// received.type, received.identifier, received.remotePort, received.payload
```

### 多路复用机制

单个 WebSocket 连接承载多个逻辑通道：

```
WebSocket 连接
├── identifier=12345 → Terminal Channel → SSH 会话
├── identifier=67890 → VNC Channel → VNC 代理
├── identifier=11111 → TCP Channel (HTTP) → 容器 HTTP 服务
└── identifier=22222 → TCP Channel (WebSocket) → 容器 WS 服务
```

服务端通过 `identifier` 将收到的帧路由到对应的处理逻辑（TerminalManager / VNCManager / TcpManager）。

## Layer 3: TCP 隧道

TCP 隧道在 KTP 帧之上提供原始 TCP 字节流传输能力。

### 建立隧道

客户端发送 `TCP_INIT` 帧，payload 为目标地址：

```
TCP_INIT 帧
  identifier: 随机数（唯一标识此隧道）
  payload: "127.0.0.1:4096"  (UTF-8 编码的 host:port)
```

服务端收到后，创建 `net.Socket` 连接到目标地址，后续此 identifier 的 `TCP_DATA` 帧全部转发到该 socket。

### 数据传输

双向原始字节转发，帧头 `remotePort` 字段始终携带目标端口：

```
客户端 → 服务端:  TCP_DATA 帧 (identifier=X, remotePort=4096, payload=原始字节)
服务端 → 客户端:  TCP_DATA 帧 (identifier=X, remotePort=4096, payload=原始字节)
```

### 关闭隧道

- 客户端关闭：WebSocket 断开时，服务端关闭所有 TCP socket
- 服务端关闭：目标 TCP socket 关闭时，服务端从管理器中移除，不关闭 WebSocket 连接
- 每个隧道独立关闭，不影响其他隧道

### TcpTunnel 接口

```typescript
interface TcpTunnel {
  host: string;                                // 目标主机
  port: number;                                // 目标端口
  send(data: Uint8Array | ArrayBuffer): void;  // 发送原始字节
  close(): void;                               // 关闭此隧道
  onData: ((data: Uint8Array) => void) | null; // 接收回调
}
```

## Layer 4a: HTTP 代理

HttpCodec 在 TCP 隧道之上提供 HTTP 请求/响应的编解码。

### 编码 HTTP 请求

```typescript
const raw = HttpCodec.encodeRequest(
  'GET', '/api/sessions',
  { 'Host': '127.0.0.1:4096', 'Accept': 'application/json' }
);
tunnel.send(raw);
```

生成的原始 HTTP/1.1 请求：
```
GET /api/sessions HTTP/1.1
Host: 127.0.0.1:4096
Accept: application/json

```

### 解码 HTTP 响应

```typescript
tunnel.onData = (chunk) => {
  // 累积数据
  buffer = concat(buffer, chunk);
  const response = HttpCodec.decodeResponse(buffer);
  if (response) {
    // statusCode: 200, headers: {...}, body: Uint8Array
  }
};
```

### 流式收集

```typescript
const response = await HttpCodec.collectResponse(
  (onChunk) => { tunnel.onData = onChunk; },
  (onEnd) => { /* 连接关闭时回调 */ }
);
```

## Layer 4b: WebSocket 代理

WebSocketCodec 在 TCP 隧道之上提供 WebSocket 帧的编解码，用于代理目标服务的 WebSocket 连接。

### 升级流程

```
1. 客户端发送 HTTP Upgrade 请求（通过 TCP 隧道）
   GET /ws HTTP/1.1
   Upgrade: websocket
   Connection: Upgrade
   Sec-WebSocket-Key: ...
   Sec-WebSocket-Version: 13

2. 目标服务返回 101 Switching Protocols
   HTTP/1.1 101 Switching Protocols
   Upgrade: websocket
   Connection: Upgrade
   Sec-WebSocket-Accept: ...

3. 升级完成，之后双向 WebSocket 帧
```

### WebSocket 帧格式 (RFC 6455)

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-------+-+-------------+-------------------------------+
|F|R|R|R| opcode|M| Payload len |    Extended payload length    |
|I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
|N|V|V|V|       |S|             |   (if payload len==126/127)   |
| |1|2|3|       |K|             |                               |
+-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
|     Extended payload length continued, if payload len == 127  |
+ - - - - - - - - - - - - - - - +-------------------------------+
|                               |Masking-key, if MASK set to 1  |
+-------------------------------+-------------------------------+
| Masking-key (continued)       |          Payload Data         |
+-------------------------------- - - - - - - - - - - - - - - - +
:                     Payload Data continued ...                :
+ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
|                     Payload Data (continued)                  |
+---------------------------------------------------------------+
```

### 操作码

| 值 | 名称 | 说明 |
|----|------|------|
| 0x0 | Continuation | 延续帧（分片） |
| 0x1 | Text | 文本帧 |
| 0x2 | Binary | 二进制帧 |
| 0x8 | Close | 关闭连接 |
| 0x9 | Ping | 心跳探测 |
| 0xA | Pong | 心跳回应 |

### 编码

```typescript
// 编码文本帧（客户端发送自动加掩码）
const frame = WebSocketCodec.encode(WsOpcode.Text, 'hello', true);

// 编码二进制帧（服务端发送不加掩码）
const frame = WebSocketCodec.encode(WsOpcode.Binary, uint8Array, false);

// 便捷方法
const textFrame = WebSocketCodec.encodeText('hello');
const closeFrame = WebSocketCodec.encodeClose(1000, 'Normal');
const pingFrame = WebSocketCodec.encodePing();
```

### 解码

```typescript
const wsFrame = WebSocketCodec.decode(rawBytes);
// wsFrame.fin: boolean
// wsFrame.opcode: WsOpcode
// wsFrame.masked: boolean
// wsFrame.payload: Uint8Array (已解掩码)
```

### 分片处理

WebSocket 支持大消息分片传输：

```
帧1: fin=false, opcode=Text,    payload=部分数据
帧2: fin=false, opcode=Continuation, payload=部分数据
帧3: fin=true,  opcode=Continuation, payload=最后数据
```

调用方需自行合并分片帧的 payload。

## 代理架构示例

### Service Worker HTTP 代理

```
iframe (目标 HTTP 页面)
  ↓ fetch 请求
Service Worker (拦截 /tcp-proxy/*)
  ↓ postMessage → 主线程
主线程 (useTcpProxy)
  ↓ HttpCodec.encodeRequest() → TCP_DATA → KTP → WebSocket
服务端 TcpManager
  ↓ net.Socket → 容器 HTTP 服务
  ↓ 响应回传
主线程 ← HttpCodec.decodeResponse()
Service Worker → 返回 Response → iframe
```

### Service Worker WebSocket 代理

```
iframe (目标 WebSocket 页面)
  ↓ WebSocket upgrade
Service Worker (拦截 connect 事件)
  ↓ 接受浏览器 WS，postMessage → 主线程
主线程 (useTcpProxy)
  ↓ HttpCodec.encodeRequest(upgrade) → TCP 隧道
  ↓ 收到 101 响应后切换到 WS 帧模式
  ↓ WebSocketCodec.encode() ↔ TCP 隧道 ↔ WebSocketCodec.decode()
服务端 TcpManager
  ↓ net.Socket → 容器 WebSocket 服务
```

## 命名规范

| 类名 | 文件 | 职责 |
|------|------|------|
| `FrameCodec` | `index.ts` | KTP 二进制帧编解码 |
| `Frame` | `index.ts` | KTP 帧数据结构 |
| `WebSocketConnection` | `WebSocketConnection.ts` | WebSocket 连接管理 + 多路复用 |
| `WebSocketDataChannel` | `WebSocketDataChannel.ts` | 逻辑子通道 |
| `TcpProxy` | `TcpProxy.ts` | TCP 隧道客户端（创建隧道） |
| `TcpTunnel` | `TcpProxy.ts` | TCP 隧道接口 |
| `TcpProxySocket` | `tcp.ts` | TCP 隧道服务端（net.Socket 封装） |
| `TcpManager` | `manager.ts` | TCP 隧道服务端管理器 |
| `HttpCodec` | `HttpCodec.ts` | HTTP 请求/响应编解码 |
| `WebSocketCodec` | `WebSocketCodec.ts` | WebSocket 帧编解码 (RFC 6455) |
