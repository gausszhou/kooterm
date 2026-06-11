import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import { TcpProxySocket } from './tcp.js';

export const isTcpMessage = (frame: Frame) => {
  return frame.type === FrameType.TCP_INIT || frame.type === FrameType.TCP_DATA;
};

/**
 * TCP 隧道管理器
 *
 * 每个隧道独立管理生命周期：
 * - TCP socket 关闭时只从 tcpMap 移除自身，不关闭 WebSocket
 * - WebSocket 断开时统一关闭所有 TCP socket
 */
export class TcpManager {
  private tcpMap = new Map<number, TcpProxySocket>();

  getOrCreate(ws: WebSocket, identifier: number, host: string, port: number): TcpProxySocket {
    const existing = this.tcpMap.get(identifier);
    if (existing) {
      existing.close();
      this.tcpMap.delete(identifier);
    }
    const socket = new TcpProxySocket(identifier, host, port);

    socket.onData = (data: Uint8Array) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const out = FrameCodec.create(FrameType.TCP_DATA, identifier, data, socket.port);
      ws.send(out.toBuffer());
    };

    socket.onClose = () => {
      this.tcpMap.delete(identifier);
    };

    this.tcpMap.set(identifier, socket);
    return socket;
  }

  write(identifier: number, data: Uint8Array) {
    const socket = this.tcpMap.get(identifier);
    if (socket) socket.write(data);
  }

  removeConnection() {
    for (const [id, socket] of this.tcpMap) {
      socket.close();
      this.tcpMap.delete(id);
    }
  }

  size() {
    return this.tcpMap.size;
  }
}
