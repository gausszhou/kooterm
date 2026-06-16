import { describe, it, expect, vi } from 'vitest';
import { WsProxy, TcpProxy, WebSocketCodec, WsOpcode } from '@kooterm/common';

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function upgradeResponse(key: string): Uint8Array {
  const accept = 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=';
  const head = `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`;
  return new TextEncoder().encode(head);
}

function failedUpgrade(): Uint8Array {
  return new TextEncoder().encode('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n');
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

describe('WsProxy', () => {
  it('should connect via HTTP upgrade and exchange data', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com:8080/chat');

    await flush();

    const sent = tunnel.send.mock.calls[0][0] as Uint8Array;
    const sentStr = new TextDecoder().decode(sent);
    expect(sentStr).toContain('GET /chat HTTP/1.1');
    expect(sentStr).toContain('Upgrade: websocket');
    expect(sentStr).toContain('Sec-WebSocket-Version: 13');
    expect(sentStr).toContain('Host: example.com:8080');

    tunnel.onData!(upgradeResponse('key'));
    const session = await connectPromise;

    const onmessage = vi.fn();
    session.onmessage = onmessage;
    tunnel.send!.mockClear();

    session.send('ping');
    await flush();
    const sentFrame = tunnel.send!.mock.calls[0][0] as Uint8Array;
    const decoded = WebSocketCodec.decode(sentFrame);
    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(WsOpcode.Text);

    const serverFrame = WebSocketCodec.encodeText('pong', false);
    tunnel.onData!(serverFrame);
    await flush();
    expect(onmessage).toHaveBeenCalledWith('pong');

    session.close();
  });

  it('should reject on failed upgrade', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    const errPromise = connectPromise.catch(e => e);
    tunnel.onData!(failedUpgrade());

    const err = await errPromise;
    expect(err.message).toContain('WebSocket upgrade failed: 404');
  });

  it('should reject on tunnel error before upgrade', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    const errPromise = connectPromise.catch(e => e);
    tunnel.onError!(1, 'Connection refused');

    const err = await errPromise;
    expect(err.message).toContain('Connection refused');
  });

  it('should send text data as WS frames', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    tunnel.send!.mockClear();

    session.send('Hello, WebSocket!');

    const sent = tunnel.send!.mock.calls[0][0] as Uint8Array;
    const decoded = WebSocketCodec.decode(sent);
    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(WsOpcode.Text);
    expect(new TextDecoder().decode(decoded!.payload)).toBe('Hello, WebSocket!');
  });

  it('should send binary data as WS frames', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    tunnel.send!.mockClear();

    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xFF]);
    session.send(binaryData);

    const sent = tunnel.send!.mock.calls[0][0] as Uint8Array;
    const decoded = WebSocketCodec.decode(sent);
    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(WsOpcode.Binary);
    expect(decoded!.payload).toEqual(binaryData);
  });

  it('should receive text message', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    const onmessage = vi.fn();
    session.onmessage = onmessage;

    const frame = WebSocketCodec.encodeText('Hello from server', false);
    tunnel.onData!(frame);
    await flush();

    expect(onmessage).toHaveBeenCalledWith('Hello from server');
  });

  it('should receive binary message', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    const onmessage = vi.fn();
    session.onmessage = onmessage;

    const binaryData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    const frame = WebSocketCodec.encodeBinary(binaryData, false);
    tunnel.onData!(frame);
    await flush();

    expect(onmessage).toHaveBeenCalledWith(binaryData);
  });

  it('should handle fragmented frames', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    const onmessage = vi.fn();
    session.onmessage = onmessage;

    const frag1Payload = new TextEncoder().encode('Hello');
    const frag1 = new Uint8Array(2 + frag1Payload.length);
    frag1[0] = 0x01; // FIN=0, Text
    frag1[1] = frag1Payload.length; // mask=0, len=5
    frag1.set(frag1Payload, 2);

    const payload2 = new TextEncoder().encode(' World');
    const frag2 = new Uint8Array(2 + payload2.length);
    frag2[0] = 0x80; // FIN=1
    frag2[1] = payload2.length; // Continuation
    frag2.set(payload2, 2);

    tunnel.onData!(frag1);
    await flush();
    expect(onmessage).not.toHaveBeenCalled();

    tunnel.onData!(frag2);
    await flush();

    expect(onmessage).toHaveBeenCalledWith('Hello World');
  });

  it('should handle close frame', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    const onclose = vi.fn();
    session.onclose = onclose;

    const closeFrame = WebSocketCodec.encodeClose(1000, 'normal', false);
    tunnel.send!.mockClear();

    tunnel.onData!(closeFrame);
    await flush();

    expect(onclose).toHaveBeenCalledWith(1000, 'normal');

    const sentClose = tunnel.send!.mock.calls[0][0] as Uint8Array;
    const decoded = WebSocketCodec.decode(sentClose);
    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(WsOpcode.Close);
  });

  it('should handle ping/pong', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    tunnel.send!.mockClear();

    const pingPayload = new TextEncoder().encode('pingdata');
    const pingFrame = WebSocketCodec.encodePing(pingPayload, false);
    tunnel.onData!(pingFrame);
    await flush();

    const sent = tunnel.send!.mock.calls[0][0] as Uint8Array;
    const decoded = WebSocketCodec.decode(sent);
    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(WsOpcode.Pong);
    expect(decoded!.payload).toEqual(pingPayload);
  });

  it('should close session and tunnel', async () => {
    const proxy = new TcpProxy('ws://localhost:8080/ws');
    const tunnel = makeTunnel();
    proxy.createTunnel = vi.fn().mockResolvedValue(tunnel);

    const wsProxy = new WsProxy(proxy);
    const connectPromise = wsProxy.connect('ws://example.com/chat');

    await flush();
    tunnel.onData!(upgradeResponse('key'));
    await flush();

    const session = await connectPromise;
    tunnel.close!.mockClear();
    tunnel.send!.mockClear();

    session.close(1000, 'bye');
    await flush();

    expect(tunnel.close).toHaveBeenCalled();
    const sentClose = tunnel.send!.mock.calls[0][0] as Uint8Array;
    const decoded = WebSocketCodec.decode(sentClose);
    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(WsOpcode.Close);
  });
});
