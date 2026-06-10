import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import { TcpProxySocket } from './tcp.js';

export class TcpManager {
  private tcpMap = new Map<number, TcpProxySocket>();

  getOrCreate(ws: WebSocket, identifier: number, host: string, port: number): TcpProxySocket {
    const existing = this.tcpMap.get(identifier);
    if (existing) {
      existing.close();
      this.tcpMap.delete(identifier);
    }
    const socket = new TcpProxySocket(ws, identifier, host, port);
    socket.onData = (data: Uint8Array) => {
      const out = FrameCodec.create(FrameType.TCP_DATA, identifier, data);
      ws.send(out.toBuffer());
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
