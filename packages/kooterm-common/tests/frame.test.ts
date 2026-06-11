import { describe, it, expect } from 'vitest';
import { Frame, FrameType, HEADER_SIZE, FRAME_TYPE_AT, REMOTE_PORT_AT, PAYLOAD_LENGTH_AT, IDENTIFIER_AT } from '@kooterm/common';

describe('Frame', () => {
  it('should construct with default remotePort=0', () => {
    const f = new Frame(FrameType.PING, 42, new Uint8Array([1, 2, 3]));
    expect(f.type).toBe(FrameType.PING);
    expect(f.identifier).toBe(42);
    expect(f.payloadLength).toBe(3);
    expect(f.remotePort).toBe(0);
    expect(f.payload).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should construct with specified remotePort', () => {
    const f = new Frame(FrameType.TCP_DATA, 100, new Uint8Array(0), 4096);
    expect(f.remotePort).toBe(4096);
  });

  it('should compute HeaderSize correctly', () => {
    expect(Frame.HeaderSize).toBe(12);
    expect(Frame.HeaderSize).toBe(HEADER_SIZE);
  });

  describe('toBuffer', () => {
    it('should produce correct byte layout', () => {
      const payload = new Uint8Array([0xAB, 0xCD]);
      const f = new Frame(FrameType.PING, 0x12345678, payload, 0xABCD);
      const buf = new Uint8Array(f.toBuffer());
      const view = new DataView(buf.buffer);

      expect(buf.length).toBe(14);
      expect(view.getUint16(FRAME_TYPE_AT)).toBe(FrameType.PING);
      expect(view.getUint16(REMOTE_PORT_AT)).toBe(0xABCD);
      expect(view.getUint32(PAYLOAD_LENGTH_AT)).toBe(2);
      expect(view.getUint32(IDENTIFIER_AT, false)).toBe(0x12345678);
      expect(buf[12]).toBe(0xAB);
      expect(buf[13]).toBe(0xCD);
    });

    it('should round-trip through toBuffer and Frame constructor', () => {
      const f1 = new Frame(FrameType.TCP_DATA, 999, new Uint8Array([10, 20, 30]), 8080);
      const buf = f1.toBuffer();
      const u8 = new Uint8Array(buf);
      const f2 = new Frame(
        new DataView(buf).getUint16(FRAME_TYPE_AT),
        new DataView(buf).getUint32(IDENTIFIER_AT, false),
        u8.slice(Frame.HeaderSize),
        new DataView(buf).getUint16(REMOTE_PORT_AT),
      );
      expect(f2.type).toBe(FrameType.TCP_DATA);
      expect(f2.identifier).toBe(999);
      expect(f2.payloadLength).toBe(3);
      expect(f2.remotePort).toBe(8080);
      expect(f2.payload).toEqual(new Uint8Array([10, 20, 30]));
    });

    it('should handle empty payload', () => {
      const f = new Frame(FrameType.PONG, 0, new Uint8Array(0));
      const buf = new Uint8Array(f.toBuffer());
      expect(buf.length).toBe(Frame.HeaderSize);
    });

    it('should handle large payload', () => {
      const payload = new Uint8Array(1000).fill(0xFF);
      const f = new Frame(FrameType.TCP_DATA, 1, payload);
      const buf = new Uint8Array(f.toBuffer());
      expect(buf.length).toBe(Frame.HeaderSize + 1000);
      expect(buf[Frame.HeaderSize]).toBe(0xFF);
      expect(buf[buf.length - 1]).toBe(0xFF);
    });
  });
});
