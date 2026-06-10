import { FrameCodec, FrameType } from '@kooterm/common';
import { WebSocketConnection } from '@/modules/WebSocketConnection';
import { WebSocketDataChannel } from '@/modules/WebSocketDataChannel';

export interface TcpTunnel {
  send(data: ArrayBuffer | Uint8Array): void;
  close(): void;
  onData: ((data: Uint8Array) => void) | null;
}

export function useTcpProxy(url: string) {
  const conn = new WebSocketConnection(url);
  const channel = conn.createDataChannel('tcp');

  function createTunnel(host: string, port: number): Promise<TcpTunnel> {
    return new Promise((resolve, reject) => {
      const tunnel: TcpTunnel = {
        send(data) {
          const frame = FrameCodec.create(FrameType.TCP_DATA, channel.identifier, data);
          conn.send(frame.toBuffer());
        },
        close() {
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

      conn.addEventListener('open', () => {
        // connection opened, channel will fire 'open' next
      });

      conn.addEventListener('close', () => {
        tunnel.close();
      });
    });
  }

  async function httpRequest(
    host: string,
    port: number,
    request: string | Uint8Array
  ): Promise<Uint8Array> {
    const tunnel = await createTunnel(host, port);
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      const timeout = setTimeout(() => {
        tunnel.close();
        reject(new Error('HTTP request timed out'));
      }, 30000);

      tunnel.onData = (data) => {
        chunks.push(data);
      };

      const origClose = tunnel.close.bind(tunnel);
      tunnel.close = () => {
        clearTimeout(timeout);
        origClose();
        const total = chunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        resolve(merged);
      };

      conn.addEventListener('close', () => {
        clearTimeout(timeout);
        reject(new Error('WebSocket closed'));
      });

      if (typeof request === 'string') {
        tunnel.send(new TextEncoder().encode(request));
      } else {
        tunnel.send(request);
      }
    });
  }

  function destroy() {
    conn.close();
  }

  return { createTunnel, httpRequest, destroy, connection: conn };
}
