import { WebSocketConnection } from './WebSocketConnection.js';
import { WebSocketDataChannel } from './WebSocketDataChannel.js';
import { FrameCodec, FrameType } from '../index.js';
import { HttpCodec, type HttpResponse } from './HttpCodec.js';

export interface TcpTunnel {
  host: string;
  port: number;
  send(data: Uint8Array | ArrayBuffer): void;
  close(): void;
  onData: ((data: Uint8Array) => void) | null;
}

/**
 * TCP over KTP 代理客户端
 *
 * 每次 createTunnel 创建独立的 WebSocketDataChannel（独立 identifier），
 * 确保多个隧道互不影响。
 *
 * 协议栈：HTTP/WS → TCP tunnel → KTP frames → WebSocket → 服务端
 */
export class TcpProxy {
  private conn: WebSocketConnection;
  private tunnelIndex = 0;

  constructor(url: string) {
    this.conn = new WebSocketConnection(url);
  }

  /**
   * 创建一个独立的 TCP 隧道
   *
   * 每次调用创建新的 DataChannel（label: tcp-0, tcp-1, ...），
   * 保证每个隧道有独立的 identifier，服务端可独立管理生命周期。
   */
  createTunnel(host: string, port: number): Promise<TcpTunnel> {
    const label = `tcp-${this.tunnelIndex++}`;
    const channel = this.conn.createDataChannel(label);

    return new Promise((resolve, reject) => {
      const tunnel: TcpTunnel = {
        host,
        port,
        send: (data) => {
          if (channel.readyState !== WebSocket.OPEN) return;
          const frame = FrameCodec.create(FrameType.TCP_DATA, channel.identifier, data, port);
          this.conn.send(frame.toBuffer());
        },
        close: () => {
          channel.close();
        },
        onData: null,
      };

      channel.addEventListener('open', () => {
        const payload = FrameCodec.encodeTarget(host, port);
        channel._send(FrameType.TCP_INIT, payload);
        resolve(tunnel);
      });

      channel.addEventListener('error', () => {
        reject(new Error('Tunnel connection failed'));
      });

      channel._onmessage = (ev: Event) => {
        const msg = ev as MessageEvent;
        const data = new Uint8Array(msg.data);
        tunnel.onData?.(data);
      };

      this.conn.addEventListener('close', () => {
        tunnel.close();
      });
    });
  }

  /**
   * 便捷方法：通过 TCP 隧道发送单个 HTTP 请求并收集完整响应
   */
  async httpRequest(
    target: { host: string; port: number },
    method: string,
    path: string,
    headers?: Record<string, string>,
    body?: string | Uint8Array
  ): Promise<HttpResponse> {
    const tunnel = await this.createTunnel(target.host, target.port);

    const allHeaders: Record<string, string> = { ...headers };
    if (!Object.keys(allHeaders).some(k => k.toLowerCase() === 'host')) {
      const portStr = target.port === 80 || target.port === 443 ? '' : `:${target.port}`;
      allHeaders['Host'] = `${target.host}${portStr}`;
    }

    const raw = HttpCodec.encodeRequest(method, path, allHeaders, body);

    const response = await HttpCodec.collectResponse(
      (cb) => { tunnel.onData = cb; },
      (cb) => { this.conn.addEventListener('close', () => cb()); }
    );

    tunnel.send(raw);
    return response;
  }

  close() {
    this.conn.close();
  }
}
