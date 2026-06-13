import { describe, it, expect, vi } from 'vitest';
import { TcpProxy } from '@kooterm/common';

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function responseBytes(status: string, headers: Record<string, string>, body: string): Uint8Array {
  let head = `HTTP/1.1 ${status}\r\n`;
  for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
  head += '\r\n';
  return new TextEncoder().encode(head + body);
}

function okResponse(body: string): Uint8Array {
  return responseBytes('200 OK', { 'Content-Length': String(body.length) }, body);
}

function emptyOk(): Uint8Array {
  return new TextEncoder().encode('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n');
}

function makeTunnel() {
  return {
    host: '',
    port: 0,
    identifier: 1,
    send: vi.fn(),
    close: vi.fn(),
    onData: null as ((data: Uint8Array) => void) | null,
    onError: null as ((type: number, msg: string) => void) | null,
  };
}

describe('TcpProxy', () => {
  describe('httpRequest', () => {
    it('should send request and parse response', async () => {
      const proxy = new TcpProxy('ws://localhost:8080/ws');
      const tunnel = makeTunnel();
      proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

      const responsePromise = proxy.httpRequest(
        { host: 'example.com', port: 80 }, 'GET', '/', { Accept: 'text/html' },
      );
      await flush();

      tunnel.onData!(okResponse('Hello, World!'));

      await flush();

      expect(tunnel.send).toHaveBeenCalled();
      const sent = new TextDecoder().decode(tunnel.send.mock.calls[0][0] as Uint8Array);
      expect(sent).toContain('GET / HTTP/1.1');
      expect(sent).toContain('Accept: text/html');

      const res = await responsePromise;
      expect(res.statusCode).toBe(200);
      expect(new TextDecoder().decode(res.body)).toBe('Hello, World!');
    });

    it('should add Host header if not provided', async () => {
      const proxy = new TcpProxy('ws://localhost:8080/ws');
      const tunnel = makeTunnel();
      proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

      const responsePromise = proxy.httpRequest(
        { host: 'example.com', port: 8080 }, 'GET', '/',
      );
      await flush();

      tunnel.onData!(emptyOk());

      await flush();

      const sent = new TextDecoder().decode(tunnel.send.mock.calls[0][0] as Uint8Array);
      expect(sent).toContain('Host: example.com:8080');
      await responsePromise;
    });

    it('should use existing Host header over target host', async () => {
      const proxy = new TcpProxy('ws://localhost:8080/ws');
      const tunnel = makeTunnel();
      proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

      const responsePromise = proxy.httpRequest(
        { host: 'example.com', port: 80 }, 'GET', '/', { Host: 'custom.com:9090' },
      );
      await flush();

      tunnel.onData!(emptyOk());

      await flush();

      const sent = new TextDecoder().decode(tunnel.send.mock.calls[0][0] as Uint8Array);
      expect(sent).toContain('Host: custom.com:9090');
      expect(sent).not.toContain('Host: example.com');
      await responsePromise;
    });

    it('should send POST body with auto Content-Length', async () => {
      const proxy = new TcpProxy('ws://localhost:8080/ws');
      const tunnel = makeTunnel();
      proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

      const responsePromise = proxy.httpRequest(
        { host: 'example.com', port: 80 }, 'POST', '/api',
        { 'Content-Type': 'application/json' }, '{"key":"value"}',
      );
      await flush();

      tunnel.onData!(new TextEncoder().encode('HTTP/1.1 201 Created\r\nContent-Length: 0\r\n\r\n'));

      await flush();

      const sent = new TextDecoder().decode(tunnel.send.mock.calls[0][0] as Uint8Array);
      expect(sent).toContain('Content-Length: 15');
      expect(sent).toContain('{"key":"value"}');

      const res = await responsePromise;
      expect(res.statusCode).toBe(201);
    });
  });
});
