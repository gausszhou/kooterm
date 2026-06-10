export interface HttpResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export function encodeHttpRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: string | Uint8Array
): Uint8Array {
  let bodyBytes: Uint8Array;
  if (body === undefined) {
    bodyBytes = new Uint8Array(0);
  } else if (typeof body === 'string') {
    bodyBytes = new TextEncoder().encode(body);
  } else {
    bodyBytes = body;
  }

  const headerNames = Object.keys(headers);
  if (bodyBytes.length > 0 && !headerNames.some(k => k.toLowerCase() === 'content-length')) {
    headers['Content-Length'] = String(bodyBytes.length);
  }

  let head = `${method} ${path} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(headers)) {
    head += `${k}: ${v}\r\n`;
  }
  head += '\r\n';

  const headBytes = new TextEncoder().encode(head);
  const result = new Uint8Array(headBytes.length + bodyBytes.length);
  result.set(headBytes, 0);
  result.set(bodyBytes, headBytes.length);
  return result;
}

function parseHeaders(raw: string): Record<string, string> {
  const lines = raw.split('\r\n');
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const k = line.substring(0, colon).trim();
    const v = line.substring(colon + 1).trim();
    headers[k] = v;
  }
  return headers;
}

function findHeader(headers: Record<string, string>, key: string): string | undefined {
  const lower = key.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return undefined;
}

function parseChunked(body: Uint8Array): { data: Uint8Array; consumed: number } | null {
  let pos = 0;
  const chunks: Uint8Array[] = [];

  while (pos < body.length) {
    const lineEnd = indexOf(body, pos, '\n');
    if (lineEnd === -1) return null;

    const sizeStr = new TextDecoder().decode(body.slice(pos, lineEnd - 1));
    const size = parseInt(sizeStr, 16);
    if (isNaN(size)) return null;

    pos = lineEnd;
    if (size === 0) break;

    if (pos + size > body.length) return null;

    chunks.push(body.slice(pos, pos + size));
    pos += size;

    if (pos + 2 > body.length || body[pos] !== 0x0d || body[pos + 1] !== 0x0a) return null;
    pos += 2;
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const data = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    data.set(c, offset);
    offset += c.length;
  }
  return { data, consumed: pos };
}

function indexOf(buf: Uint8Array, start: number, char: string): number {
  const code = char.charCodeAt(0);
  for (let i = start; i < buf.length; i++) {
    if (buf[i] === code) return i + 1;
  }
  return -1;
}

export function decodeHttpResponse(data: Uint8Array): HttpResponse | null {
  const headerEnd = indexOfDoubleCRLF(data, 0);
  if (headerEnd === -1) return null;

  const headStr = new TextDecoder().decode(data.slice(0, headerEnd));
  const lines = headStr.split('\r\n');
  if (lines.length < 1) return null;

  const statusMatch = lines[0].match(/^HTTP\/\d+\.\d+\s+(\d+)\s+(.+)$/);
  if (!statusMatch) return null;

  const statusCode = parseInt(statusMatch[1], 10);
  const statusText = statusMatch[2];
  const headers = parseHeaders(lines.slice(1).join('\r\n'));

  let body: Uint8Array;
  let complete: boolean;

  const rawBody = data.slice(headerEnd);

  const te = findHeader(headers, 'transfer-encoding');
  if (te && te.toLowerCase().includes('chunked')) {
    const result = parseChunked(rawBody);
    if (!result) return null;
    body = result.data;
    complete = true;
  } else {
    const cl = findHeader(headers, 'content-length');
    if (cl !== undefined) {
      const length = parseInt(cl, 10);
      if (rawBody.length < length) return null;
      body = rawBody.slice(0, length);
      complete = true;
    } else {
      body = rawBody;
      complete = true;
    }
  }

  return { statusCode, statusText, headers, body };
}

function indexOfDoubleCRLF(buf: Uint8Array, start: number): number {
  for (let i = start; i < buf.length - 3; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a && buf[i + 2] === 0x0d && buf[i + 3] === 0x0a) {
      return i + 4;
    }
  }
  return -1;
}

export async function collectHttpResponse(
  onData: (cb: (chunk: Uint8Array) => void) => void,
  onEnd: (cb: () => void) => void
): Promise<HttpResponse> {
  const chunks: Uint8Array[] = [];
  let resolved = false;

  return new Promise((resolve, reject) => {
    const tryParse = () => {
      if (resolved) return;
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      const result = decodeHttpResponse(merged);
      if (result) {
        resolved = true;
        resolve(result);
      }
    };

    onData((chunk) => {
      chunks.push(chunk);
      tryParse();
    });

    onEnd(() => {
      if (!resolved) {
        const total = chunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        resolved = true;
        if (chunks.length > 0) {
          const result = decodeHttpResponse(merged);
          if (result) resolve(result);
          else {
            const headStr = new TextDecoder().decode(merged.slice(0, Math.min(merged.length, 4096)));
            reject(new Error(`Failed to parse HTTP response: ${headStr.substring(0, 200)}`));
          }
        } else {
          reject(new Error('Empty HTTP response'));
        }
      }
    });
  });
}
