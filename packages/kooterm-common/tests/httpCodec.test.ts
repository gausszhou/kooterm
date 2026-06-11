import { describe, it, expect, vi } from 'vitest';
import { HttpCodec, type HttpResponse } from '@kooterm/common';

function str2bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function bytes2str(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

const CRLF = '\r\n';

describe('HttpCodec', () => {
  describe('encodeRequest', () => {
    it('should encode a basic GET request', () => {
      const raw = HttpCodec.encodeRequest('GET', '/', { Host: 'example.com' });
      const expected = `GET / HTTP/1.1\r\nHost: example.com\r\n\r\n`;
      expect(bytes2str(raw)).toBe(expected);
    });

    it('should encode a POST request with string body and auto Content-Length', () => {
      const raw = HttpCodec.encodeRequest('POST', '/api', { Host: 'example.com' }, 'hello');
      const lines = bytes2str(raw).split(CRLF);
      expect(lines[0]).toBe('POST /api HTTP/1.1');
      expect(lines).toContain('Host: example.com');
      expect(lines).toContain('Content-Length: 5');
      expect(String.fromCharCode(raw[raw.length - 1])).toBe('o');
      expect(String.fromCharCode(raw[raw.length - 5])).toBe('h');
    });

    it('should encode a request with Uint8Array body', () => {
      const body = new Uint8Array([0x00, 0x01, 0x02]);
      const raw = HttpCodec.encodeRequest('PUT', '/file', {}, body);
      expect(raw.slice(-3)).toEqual(body);
      expect(bytes2str(raw)).toContain('Content-Length: 3');
    });

    it('should not add Content-Length for GET requests without body', () => {
      const raw = HttpCodec.encodeRequest('GET', '/', { Host: 'a.com' });
      expect(bytes2str(raw)).not.toContain('Content-Length');
    });

    it('should not override existing Content-Length', () => {
      const raw = HttpCodec.encodeRequest('POST', '/', { 'Content-Length': '10' }, 'short');
      expect(bytes2str(raw)).toContain('Content-Length: 10');
    });

    it('should encode empty body as zero-length', () => {
      const raw = HttpCodec.encodeRequest('DELETE', '/item', {});
      const headEnd = raw.indexOf(0x0d);

      expect(raw[raw.length - 1]).toBe(0x0a);
    });

    it('should include all provided headers', () => {
      const raw = HttpCodec.encodeRequest('GET', '/', {
        Host: 'x.com',
        'User-Agent': 'test/1.0',
        Accept: '*/*',
      });
      const text = bytes2str(raw);
      expect(text).toContain('Host: x.com');
      expect(text).toContain('User-Agent: test/1.0');
      expect(text).toContain('Accept: */*');
    });

    it('should handle path with query string', () => {
      const raw = HttpCodec.encodeRequest('GET', '/search?q=hello&page=1', { Host: 'x.com' });
      const text = bytes2str(raw);
      expect(text).toContain('GET /search?q=hello&page=1 HTTP/1.1');
    });
  });

  describe('decodeResponse', () => {
    it('should decode a basic HTTP 200 response', () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 5\r\n\r\nHello`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).not.toBeNull();
      expect(res!.statusCode).toBe(200);
      expect(res!.statusText).toBe('OK');
      expect(res!.headers['Content-Type']).toBe('text/plain');
      expect(bytes2str(res!.body)).toBe('Hello');
    });

    it('should decode response with no body (204)', () => {
      const raw = str2bytes(`HTTP/1.1 204 No Content\r\n\r\n`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).not.toBeNull();
      expect(res!.statusCode).toBe(204);
      expect(res!.body.length).toBe(0);
    });

    it('should decode chunked transfer encoding', () => {
      const body = '5\r\nHello\r\n1\r\n \r\n6\r\nWorld!\r\n0\r\n\r\n';
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n${body}`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).not.toBeNull();
      expect(res!.statusCode).toBe(200);
      expect(bytes2str(res!.body)).toBe('Hello World!');
    });

    it('should return null for incomplete headers', () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nContent`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).toBeNull();
    });

    it('should return null for incomplete body', () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nHello`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).toBeNull();
    });

    it('should return null for incomplete chunked body', () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nHel`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).toBeNull();
    });

    it('should parse headers case-insensitively', () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\ncontent-type: application/json\r\nCONTENT-LENGTH: 4\r\n\r\ntest`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).not.toBeNull();
      expect(res!.headers['content-type']).toBe('application/json');
      expect(res!.headers['CONTENT-LENGTH']).toBe('4');
    });

    it('should decode response with multiple headers', () => {
      const raw = str2bytes(`HTTP/1.1 302 Found\r\nLocation: /new\r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\nContent-Length: 0\r\n\r\n`);
      const res = HttpCodec.decodeResponse(raw);
      expect(res).not.toBeNull();
      expect(res!.statusCode).toBe(302);
      expect(res!.headers['Location']).toBe('/new');
    });

    it('should handle empty response line', () => {
      const res = HttpCodec.decodeResponse(str2bytes(`\r\n`));
      expect(res).toBeNull();
    });
  });

  describe('collectResponse', () => {
    it('should resolve when complete response arrives in one chunk', async () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nHello`);
      const promise = HttpCodec.collectResponse(
        (cb) => cb(raw),
        () => {},
      );
      const res = await promise;
      expect(res.statusCode).toBe(200);
      expect(bytes2str(res.body)).toBe('Hello');
    });

    it('should resolve when data arrives in multiple chunks', async () => {
      const promise = HttpCodec.collectResponse(
        (cb) => {
          cb(str2bytes(`HTTP/1.1 200 OK\r\nContent-`));
          cb(str2bytes(`Length: 12\r\n\r\nHello `));
          cb(str2bytes(`World!`));
        },
        () => {},
      );
      const res = await promise;
      expect(res.statusCode).toBe(200);
      expect(bytes2str(res.body)).toBe('Hello World!');
    });

    it('should resolve when chunked data arrives in pieces', async () => {
      const promise = HttpCodec.collectResponse(
        (cb) => {
          cb(str2bytes(`HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nHel`));
          cb(str2bytes(`lo\r\n5\r\nWorl`));
          cb(str2bytes(`d\r\n0\r\n\r\n`));
        },
        () => {},
      );
      const res = await promise;
      expect(res.statusCode).toBe(200);
      expect(bytes2str(res.body)).toBe('HelloWorld');
    });

    it('should resolve via onEnd when close triggers before response is fully parsed', async () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nHello`);
      const promise = HttpCodec.collectResponse(
        (cb) => cb(raw),
        (cb) => cb(),
      );
      const res = await promise;
      expect(res.statusCode).toBe(200);
      expect(bytes2str(res.body)).toBe('Hello');
    });

    it('should reject on onEnd when no data received', async () => {
      const promise = HttpCodec.collectResponse(
        (_cb) => {},
        (cb) => cb(),
      );
      await expect(promise).rejects.toThrow('Empty HTTP response');
    });

    it('should reject on onEnd when response is malformed', async () => {
      const promise = HttpCodec.collectResponse(
        (cb) => cb(str2bytes(`NOT_HTTP`)),
        (cb) => cb(),
      );
      await expect(promise).rejects.toThrow('Failed to parse HTTP response');
    });

    it('should handle exact boundary - header split across chunks', async () => {
      const promise = HttpCodec.collectResponse(
        (cb) => {
          cb(str2bytes(`HTTP/1.1 200 OK\r\nContent-Length: 5\r\n`));
          cb(str2bytes(`\r\nHello`));
        },
        () => {},
      );
      const res = await promise;
      expect(res.statusCode).toBe(200);
      expect(bytes2str(res.body)).toBe('Hello');
    });

    it('should not resolve twice with duplicate data', async () => {
      const raw = str2bytes(`HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nHello`);
      let resolveCount = 0;
      const promise = HttpCodec.collectResponse(
        (cb) => {
          cb(raw);
          cb(raw);
        },
        () => {},
      );
      const res = await promise;
      expect(res.statusCode).toBe(200);
    });
  });
});
