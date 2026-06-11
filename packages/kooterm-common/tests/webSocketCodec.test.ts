import { describe, it, expect } from 'vitest';
import { WebSocketCodec, WsOpcode } from '@kooterm/common';

function bytes2str(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

describe('WebSocketCodec', () => {
  describe('encode', () => {
    it('should encode a small text frame from client (masked)', () => {
      const frame = WebSocketCodec.encode(WsOpcode.Text, 'Hello', true);
      expect(frame[0]).toBe(0x81);
      expect(frame[1] & 0x80).toBe(0x80);
      expect(frame[1] & 0x7F).toBe(5);
      expect(frame.length).toBe(2 + 4 + 5);

      const decoded = WebSocketCodec.decode(frame);
      expect(decoded).not.toBeNull();
      expect(decoded!.fin).toBe(true);
      expect(decoded!.opcode).toBe(WsOpcode.Text);
      expect(decoded!.masked).toBe(true);
      expect(bytes2str(decoded!.payload)).toBe('Hello');
    });

    it('should encode a frame from server (unmasked)', () => {
      const frame = WebSocketCodec.encode(WsOpcode.Text, 'Hi', false);
      expect(frame[1] & 0x80).toBe(0x00);
      expect(frame.length).toBe(2 + 2);

      const decoded = WebSocketCodec.decode(frame);
      expect(decoded).not.toBeNull();
      expect(decoded!.masked).toBe(false);
      expect(bytes2str(decoded!.payload)).toBe('Hi');
    });

    it('should encode medium payload (16-bit extended length)', () => {
      const payload = 'x'.repeat(200);
      const frame = WebSocketCodec.encode(WsOpcode.Binary, payload);
      expect(frame[1] & 0x7F).toBe(126);
      expect(frame.length).toBe(2 + 2 + 4 + 200); // header + 16-bit len + mask + payload
    });

    it('should encode large payload (64-bit extended length)', () => {
      const payload = new Uint8Array(70000);
      const frame = WebSocketCodec.encode(WsOpcode.Binary, payload);
      expect(frame[1] & 0x7F).toBe(127);
      const view = new DataView(frame.buffer);
      expect(view.getUint32(2, false)).toBe(0); // high 32 bits
      expect(view.getUint32(6, false)).toBe(70000); // low 32 bits
    });

    it('should encode with Uint8Array payload', () => {
      const payload = new Uint8Array([0x01, 0x02, 0x03]);
      const frame = WebSocketCodec.encode(WsOpcode.Binary, payload);
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload).toEqual(payload);
    });
  });

  describe('decode', () => {
    it('should return null for incomplete frame (< 2 bytes)', () => {
      expect(WebSocketCodec.decode(new Uint8Array([0x81]))).toBeNull();
    });

    it('should return null for incomplete extended length', () => {
      const buf = new Uint8Array([0x81, 0xFE, 0x01]);
      expect(WebSocketCodec.decode(buf)).toBeNull();
    });

    it('should decode all opcodes', () => {
      const opcodes = [WsOpcode.Text, WsOpcode.Binary, WsOpcode.Ping, WsOpcode.Pong, WsOpcode.Close];
      for (const opcode of opcodes) {
        const frame = WebSocketCodec.encode(opcode, 'x', true);
        const decoded = WebSocketCodec.decode(frame);
        expect(decoded).not.toBeNull();
        expect(decoded!.opcode).toBe(opcode);
      }
    });

    it('should decode fin=0 (fragmented) frame', () => {
      const buf = new Uint8Array([0x01, 0x81 | 5]); // FIN=0, Text, masked, len=5
      const mask = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
      const masked = new Uint8Array([72, 101, 108, 108, 111]); // "Hello" XOR 0 = same
      const frame = new Uint8Array([...buf, ...mask, ...masked]);
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded).not.toBeNull();
      expect(decoded!.fin).toBe(false);
      expect(bytes2str(decoded!.payload)).toBe('Hello');
    });

    it('should decode close frame with code', () => {
      const closeFrame = WebSocketCodec.encodeClose(1000, 'normal', false);
      const decoded = WebSocketCodec.decode(closeFrame);
      expect(decoded).not.toBeNull();
      expect(decoded!.opcode).toBe(WsOpcode.Close);
      expect(decoded!.payload.length).toBeGreaterThanOrEqual(2);
      const code = new DataView(decoded!.payload.buffer).getUint16(0, false);
      expect(code).toBe(1000);
    });

    it('should throw for payload larger than 2^32', () => {
      const buf = new Uint8Array(12);
      buf[0] = 0x82;
      buf[1] = 0xFF;
      buf[2] = 0x01;
      expect(() => WebSocketCodec.decode(buf)).toThrow('WebSocket frame payload too large');
    });
  });

  describe('convenience methods', () => {
    it('encodeText should set Text opcode', () => {
      const frame = WebSocketCodec.encodeText('hello');
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded!.opcode).toBe(WsOpcode.Text);
    });

    it('encodeBinary should set Binary opcode', () => {
      const frame = WebSocketCodec.encodeBinary(new Uint8Array([1, 2, 3]));
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded!.opcode).toBe(WsOpcode.Binary);
    });

    it('encodePing should set Ping opcode', () => {
      const frame = WebSocketCodec.encodePing();
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded!.opcode).toBe(WsOpcode.Ping);
    });

    it('encodePong should set Pong opcode', () => {
      const frame = WebSocketCodec.encodePong(new Uint8Array([1, 2, 3]));
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded!.opcode).toBe(WsOpcode.Pong);
    });

    it('encodePong with empty payload', () => {
      const frame = WebSocketCodec.encodePong();
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded!.payload.length).toBe(0);
    });
  });

  describe('round-trip', () => {
    it('should round-trip various payloads through encode/decode', () => {
      const payloads = ['', 'a', 'hello world', '¡Hola! 中文 🎉', 'x'.repeat(300), 'x'.repeat(70000)];
      for (const payload of payloads) {
        const frame = WebSocketCodec.encodeText(payload, true);
        const decoded = WebSocketCodec.decode(frame);
        expect(decoded).not.toBeNull();
        expect(bytes2str(decoded!.payload)).toBe(payload);
      }
    });

    it('should round-trip binary data', () => {
      const data = new Uint8Array([0x00, 0xFF, 0xAB, 0xCD, 0x12, 0x34]);
      const frame = WebSocketCodec.encodeBinary(data, false);
      const decoded = WebSocketCodec.decode(frame);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload).toEqual(data);
    });
  });
});
