import { describe, it, expect, vi } from 'vitest';
import { WebSocketDataChannel } from '@kooterm/common';

describe('WebSocketDataChannel', () => {
  it('should generate a random identifier on construction', () => {
    const mockConn = { isConnected: false } as any;
    const ch1 = new WebSocketDataChannel(mockConn, 'test-1');
    const ch2 = new WebSocketDataChannel(mockConn, 'test-2');
    expect(ch1.identifier).not.toBe(ch2.identifier);
    expect(ch1.identifier).toBeGreaterThanOrEqual(0);
    expect(ch1.identifier).toBeLessThan(0xFFFFFFF);
  });

  it('should delegate binaryType to connection', () => {
    const mockConn = { binaryType: 'arraybuffer' } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    expect(ch.binaryType).toBe('arraybuffer');
    ch.binaryType = 'blob';
    expect(mockConn.binaryType).toBe('blob');
  });

  it('should delegate readyState to connection', () => {
    const mockConn = { readyState: WebSocket.OPEN } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    expect(ch.readyState).toBe(WebSocket.OPEN);
  });

  it('should delegate url to connection', () => {
    const mockConn = { url: 'ws://example.com/ws' } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    expect(ch.url).toBe('ws://example.com/ws');
  });

  it('should connect addEventListener to underlying EventTarget', () => {
    const mockConn = { isConnected: false } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    const listener = vi.fn();
    ch.addEventListener('custom', listener);
    ch.dispatchEvent(new Event('custom'));
    expect(listener).toHaveBeenCalled();
  });

  it('should fire open immediately if connection is already connected', () => {
    const mockConn = { isConnected: true } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    const openListener = vi.fn();
    ch.addEventListener('open', openListener);
    expect(openListener).toHaveBeenCalled();
  });

  it('should not fire open if connection is not connected', () => {
    const mockConn = { isConnected: false } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    const openListener = vi.fn();
    ch.addEventListener('open', openListener);
    expect(openListener).not.toHaveBeenCalled();
  });

  it('encode should return data unchanged', () => {
    const mockConn = {} as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    const data = new ArrayBuffer(8);
    expect(ch.encode('hello')).toBe('hello');
    expect(ch.encode(data)).toBe(data);
  });

  it('decode should return frame.payload', () => {
    const mockConn = {} as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    const payload = new Uint8Array([1, 2, 3]);
    const frame = { payload };
    expect(ch.decode(frame as any)).toBe(payload);
  });

  it('close should call connection.closeDataChannel', () => {
    const mockConn = { closeDataChannel: vi.fn() } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test-label');
    ch.close();
    expect(mockConn.closeDataChannel).toHaveBeenCalledWith('test-label');
  });

  it('_send should throw if connection is not open', () => {
    const mockConn = { readyState: WebSocket.CLOSED, send: vi.fn() } as any;
    const ch = new WebSocketDataChannel(mockConn, 'test');
    expect(() => ch._send(1, 'data')).toThrow('WebSocket is not open');
  });
});
