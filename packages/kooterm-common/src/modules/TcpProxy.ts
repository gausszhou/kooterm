import { WebSocketConnection } from './WebSocketConnection.js';
import { WebSocketDataChannel } from './WebSocketDataChannel.js';
import { Frame, FrameCodec, FrameType } from '../index.js';
import { HttpCodec, type HttpResponse } from './HttpCodec.js';
import { log } from '../logger.js';

export interface TcpTunnel {
  host: string;
  port: number;
  identifier: number;
  send(data: Uint8Array | ArrayBuffer): void;
  close(): void;
  onData: ((data: Uint8Array) => void) | null;
  onError: ((type: number, message: string) => void) | null;
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

  get connection(): WebSocketConnection {
    return this.conn;
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
      let resolved = false;

      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        reject(new Error('Tunnel connection timeout'));
        channel.close();
      }, 10000);

      const tunnel: TcpTunnel = {
        host,
        port,
        identifier: channel.identifier,
        send: (data) => {
          if (channel.readyState !== WebSocket.OPEN) return;
          const frame = FrameCodec.create(FrameType.TCP_DATA, channel.identifier, data, port);
          this.conn.send(frame.toBuffer());
        },
        close: () => {
          channel.close();
        },
        onData: null,
        onError: null,
      };

      channel.addEventListener('open', () => {
        const payload = FrameCodec.encodeTarget(host, port);
        log.info(`[TCP] >>> TCP_INIT sent identifier=${channel.identifier} target=${host}:${port}`);
        channel._send(FrameType.TCP_INIT, payload);
      });

      channel.addEventListener('error', () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        reject(new Error('DataChannel error'));
      });

      channel._onmessage = (ev: Event) => {
        try {
          const frame = (ev as MessageEvent).data as Frame;
          if (!resolved && frame.type === FrameType.TCP_INIT) {
            resolved = true;
            clearTimeout(timeout);
            log.info(`[TCP] <<< TCP_INIT ack identifier=${channel.identifier}`);
            resolve(tunnel);
            return;
          }
          if (frame.type === FrameType.TCP_ERROR) {
            const errorType = frame.payload[0];
            const errorMsg = new TextDecoder().decode(frame.payload.slice(1));
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              reject(new Error(errorMsg));
              return;
            }
            tunnel.onError?.(errorType, errorMsg);
            return;
          }
          log.info(`[TCP Proxy] [${label}] TCP_DATA received (${frame.payloadLength} bytes), forwarding to tunnel.onData`);
          const rawStr = new TextDecoder().decode(frame.payload.slice(0, Math.min(frame.payload.length, 500)));
          console.log(`[TCP Proxy] [${label}] RAW data (first 500):`, JSON.stringify(rawStr));
          console.log(`[TCP Proxy] [${label}] tunnel.onData is`, typeof tunnel.onData, tunnel.onData ? 'SET' : 'NULL');
          tunnel.onData?.(new Uint8Array(frame.payload));
        } catch (e) {
          log.error(`[TCP Proxy] [${label}] _onmessage error:`, e);
        }
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
