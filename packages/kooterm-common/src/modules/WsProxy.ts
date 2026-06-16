import { TcpProxy, type TcpTunnel } from './TcpProxy.js';
import { WebSocketCodec, WsOpcode, type WsFrame } from './WebSocketCodec.js';
import { HttpCodec } from './HttpCodec.js';
import { log } from '../logger.js';

export interface WsSession {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((data: string | Uint8Array) => void) | null;
  onclose: ((code: number, reason: string) => void) | null;
  onerror: ((error: Error) => void) | null;
}

interface WsUrlParts {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

function parseWsUrl(url: string): WsUrlParts | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    const port = u.port ? parseInt(u.port, 10) : (u.protocol === 'wss:' ? 443 : 80);
    return {
      host: u.hostname,
      port,
      path: u.pathname + u.search + u.hash,
      secure: u.protocol === 'wss:',
    };
  } catch {
    return null;
  }
}

function generateKey(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return btoa(String.fromCharCode(...bytes));
}

function wsFrameLength(data: Uint8Array): number {
  if (data.length < 2) return 0;
  let payloadLen = data[1] & 0x7F;
  let offset = 2;
  if (payloadLen === 126) {
    if (data.length < 4) return 0;
    payloadLen = (data[2] << 8) | data[3];
    offset = 4;
  } else if (payloadLen === 127) {
    if (data.length < 10) return 0;
    payloadLen = (data[6] << 24) | (data[7] << 16) | (data[8] << 8) | data[9];
    offset = 10;
  }
  if (data[1] & 0x80) offset += 4;
  offset += payloadLen;
  return offset;
}

export class WsProxy {
  private tcpProxy: TcpProxy;

  constructor(tcpProxy: TcpProxy) {
    this.tcpProxy = tcpProxy;
  }

  async connect(url: string, protocols?: string[]): Promise<WsSession> {
    const parsed = parseWsUrl(url);
    if (!parsed) throw new Error(`Invalid WebSocket URL: ${url}`);

    const { host, port, path } = parsed;
    const tunnel = await this.tcpProxy.createTunnel(host, port);
    const key = generateKey();

    const upgradeHeaders: Record<string, string> = {
      'Host': host + (port === 80 || port === 443 ? '' : ':' + port),
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13',
    };
    if (protocols && protocols.length > 0) {
      upgradeHeaders['Sec-WebSocket-Protocol'] = protocols.join(', ');
    }

    const upgradeBytes = HttpCodec.encodeRequest('GET', path, upgradeHeaders);

    const session = new WsSessionImpl(tunnel);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!session.upgraded) {
          reject(new Error('WebSocket upgrade timeout'));
          tunnel.close();
        }
      }, 10000);

      tunnel.onData = (chunk: Uint8Array) => {
        if (!session.upgraded) {
          session.upgradeBuffer.push(chunk);
          const total = session.upgradeBuffer.reduce((s, c) => s + c.length, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of session.upgradeBuffer) {
            merged.set(c, offset);
            offset += c.length;
          }
          const parsed = HttpCodec.parseHeaders(merged);
          if (!parsed) return;

          if (parsed.statusCode !== 101) {
            clearTimeout(timeout);
            reject(new Error(`WebSocket upgrade failed: ${parsed.statusCode} ${parsed.statusText}`));
            tunnel.close();
            return;
          }

          session.upgraded = true;
          clearTimeout(timeout);
          log.info(`[WsProxy] upgraded ${url}`);

          const bodyStart = parsed.headerLength;
          if (merged.length > bodyStart) {
            session.feedData(merged.slice(bodyStart));
          }

          resolve(session);
          Promise.resolve().then(() => {
            session._onopen?.();
          });
          return;
        }

        session.feedData(chunk);
      };

      tunnel.onError = (type, message) => {
        clearTimeout(timeout);
        const err = new Error(`WebSocket error: ${type} ${message}`);
        if (!session.upgraded) {
          reject(err);
        } else {
          session._onerror?.(err);
        }
      };

      tunnel.send(upgradeBytes);
    });
  }
}

class WsSessionImpl implements WsSession {
  tunnel: TcpTunnel;
  upgraded = false;
  upgradeBuffer: Uint8Array[] = [];

  private dataBuffer = new Uint8Array(0);
  private fragmentBuffer: Uint8Array[] | null = null;
  private fragmentOpcode: WsOpcode | null = null;
  private _closed = false;

  _onopen: (() => void) | null = null;
  _onmessage: ((data: string | Uint8Array) => void) | null = null;
  _onclose: ((code: number, reason: string) => void) | null = null;
  _onerror: ((error: Error) => void) | null = null;

  get onopen(): (() => void) | null { return this._onopen; }
  set onopen(cb: (() => void) | null) { this._onopen = cb; }

  get onmessage(): ((data: string | Uint8Array) => void) | null { return this._onmessage; }
  set onmessage(cb: ((data: string | Uint8Array) => void) | null) { this._onmessage = cb; }

  get onclose(): ((code: number, reason: string) => void) | null { return this._onclose; }
  set onclose(cb: ((code: number, reason: string) => void) | null) { this._onclose = cb; }

  get onerror(): ((error: Error) => void) | null { return this._onerror; }
  set onerror(cb: ((error: Error) => void) | null) { this._onerror = cb; }

  constructor(tunnel: TcpTunnel) {
    this.tunnel = tunnel;
  }

  send(data: string | Uint8Array) {
    if (this._closed) return;
    const frame = typeof data === 'string'
      ? WebSocketCodec.encodeText(data)
      : WebSocketCodec.encodeBinary(data);
    this.tunnel.send(frame);
  }

  close(code = 1000, reason = '') {
    if (this._closed) return;
    this._closed = true;
    const frame = WebSocketCodec.encodeClose(code, reason);
    this.tunnel.send(frame);
    this.tunnel.close();
  }

  feedData(chunk: Uint8Array) {
    const newBuf = new Uint8Array(this.dataBuffer.length + chunk.length);
    newBuf.set(this.dataBuffer, 0);
    newBuf.set(chunk, this.dataBuffer.length);
    this.dataBuffer = newBuf;

    while (this.dataBuffer.length > 0) {
      const frameLen = wsFrameLength(this.dataBuffer);
      if (frameLen === 0 || frameLen > this.dataBuffer.length) break;

      const frameData = this.dataBuffer.slice(0, frameLen);
      this.dataBuffer = this.dataBuffer.slice(frameLen);

      const frame = WebSocketCodec.decode(frameData);
      if (!frame) break;

      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: WsFrame) {
    if (frame.opcode === WsOpcode.Close) {
      const code = frame.payload.length >= 2
        ? (frame.payload[0] << 8) | frame.payload[1]
        : 1005;
      const reason = frame.payload.length > 2
        ? new TextDecoder().decode(frame.payload.slice(2))
        : '';
      this._closed = true;
      const closeFrame = WebSocketCodec.encodeClose(code, reason, false);
      this.tunnel.send(closeFrame);
      this.tunnel.close();
      this._onclose?.(code, reason);
      return;
    }

    if (frame.opcode === WsOpcode.Ping) {
      const pong = WebSocketCodec.encodePong(frame.payload, false);
      this.tunnel.send(pong);
      return;
    }

    if (frame.opcode === WsOpcode.Pong) {
      return;
    }

    if (frame.opcode === WsOpcode.Text || frame.opcode === WsOpcode.Binary) {
      if (frame.fin) {
        const data = frame.opcode === WsOpcode.Text
          ? new TextDecoder().decode(frame.payload)
          : frame.payload;
        this._onmessage?.(data);
      } else {
        this.fragmentBuffer = [frame.payload];
        this.fragmentOpcode = frame.opcode;
      }
      return;
    }

    if (frame.opcode === WsOpcode.Continuation) {
      if (!this.fragmentBuffer) {
        log.warn('[WsProxy] orphan continuation frame');
        return;
      }
      this.fragmentBuffer.push(frame.payload);
      if (frame.fin) {
        const total = this.fragmentBuffer.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of this.fragmentBuffer) {
          merged.set(c, offset);
          offset += c.length;
        }
        const data = this.fragmentOpcode === WsOpcode.Text
          ? new TextDecoder().decode(merged)
          : merged;
        this.fragmentBuffer = null;
        this.fragmentOpcode = null;
        this._onmessage?.(data);
      }
    }
  }
}
