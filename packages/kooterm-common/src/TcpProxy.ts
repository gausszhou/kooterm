import { WebSocketConnection } from './WebSocketConnection.js';
import { WebSocketDataChannel } from './WebSocketDataChannel.js';
import { FrameCodec, FrameType } from './index.js';
import { encodeHttpRequest, collectHttpResponse, type HttpResponse } from './http.js';

export interface TcpTunnel {
  send(data: Uint8Array | ArrayBuffer): void;
  close(): void;
  onData: ((data: Uint8Array) => void) | null;
}

export class TcpProxy {
  private conn: WebSocketConnection;
  private channel: WebSocketDataChannel;

  constructor(url: string) {
    this.conn = new WebSocketConnection(url);
    this.channel = this.conn.createDataChannel('tcp');
  }

  createTunnel(host: string, port: number): Promise<TcpTunnel> {
    return new Promise((resolve, reject) => {
      const tunnel: TcpTunnel = {
        send: (data) => {
          const frame = FrameCodec.create(FrameType.TCP_DATA, this.channel.identifier, data);
          this.conn.send(frame.toBuffer());
        },
        close: () => {
          this.channel.close();
        },
        onData: null,
      };

      this.channel.addEventListener('open', () => {
        const payload = FrameCodec.encodeTarget(host, port);
        this.channel._send(FrameType.TCP_INIT, payload);
        resolve(tunnel);
      });

      this.channel.addEventListener('error', () => {
        reject(new Error('Tunnel connection failed'));
      });

      this.channel._onmessage = (ev: Event) => {
        const msg = ev as MessageEvent;
        const data = new Uint8Array(msg.data);
        tunnel.onData?.(data);
      };

      this.conn.addEventListener('close', () => {
        tunnel.close();
      });
    });
  }

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

    const raw = encodeHttpRequest(method, path, allHeaders, body);

    const response = await collectHttpResponse(
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
