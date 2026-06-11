import { describe, it, expect } from 'vitest';
import { Frame, FrameCodec, FrameType } from "@kooterm/common";

describe("FrameCodec", () => {
  describe("encode", () => {
    it("should encode string data correctly", () => {
      const type = FrameType.TERMINAL_DATA;
      const identifier = 123;
      const data = "Hello, World!";

      const frame = FrameCodec.create(type, identifier, data);

      expect(frame.type).toBe(type);
      expect(frame.identifier).toBe(identifier);
      expect(frame.payloadLength).toBe(new TextEncoder().encode(data).byteLength);
      expect(new TextDecoder().decode(frame.payload)).toBe(data);
    });

    it("should encode number data correctly", () => {
      const type = FrameType.PING;
      const identifier = 456;
      const data = 123.456;

      const frame = FrameCodec.create(type, identifier, data);

      expect(frame.type).toBe(type);
      expect(frame.identifier).toBe(identifier);
      expect(frame.payloadLength).toBe(8); // double precision float
      expect(FrameCodec.buffer2number(frame.payload)).toBe(data);
    });

    it("should encode Uint8Array data correctly", () => {
      const type = FrameType.TERMINAL_REFRESH;
      const identifier = 789;
      const data = new Uint8Array([10, 20, 30, 40, 50]);

      const frame = FrameCodec.create(type, identifier, data);

      expect(frame.type).toBe(type);
      expect(frame.identifier).toBe(identifier);
      expect(frame.payloadLength).toBe(data.byteLength);
      expect(frame.payload).toEqual(data);
    });

    it("should encode ArrayBuffer data correctly", () => {
      const type = FrameType.TERMINAL_DATA;
      const identifier = 999;
      const arrayBuffer = new ArrayBuffer(4);
      const view = new DataView(arrayBuffer);
      view.setUint32(0, 0x12345678, true);

      const frame = FrameCodec.create(type, identifier, arrayBuffer);

      expect(frame.type).toBe(type);
      expect(frame.identifier).toBe(identifier);
      expect(frame.payloadLength).toBe(4);

      const payloadView = new DataView(frame.payload.buffer);
      expect(payloadView.getUint32(0, true)).toBe(0x12345678);
    });

    it("should throw error for unsupported data type", () => {
      expect(() => {
        FrameCodec.create(FrameType.TERMINAL_DATA, 123, { invalid: "object" } as any);
      }).toThrow("Unsupported data type for encoding");
    });

    it("should default remotePort to 0", () => {
      const frame = FrameCodec.create(FrameType.TERMINAL_DATA, 1, "test");
      expect(frame.remotePort).toBe(0);
    });

    it("should encode remotePort correctly", () => {
      const frame = FrameCodec.create(FrameType.TCP_DATA, 1, "test", 4096);
      expect(frame.remotePort).toBe(4096);
    });
  });

  describe("decode", () => {
    it("should decode valid buffer correctly", () => {
      const originalFrame = FrameCodec.create(FrameType.PONG, 555, "test message");
      const buffer = originalFrame.toBuffer();

      const decodedFrame = FrameCodec.decode(buffer);

      expect(decodedFrame.type).toBe(FrameType.PONG);
      expect(decodedFrame.identifier).toBe(555);
      expect(decodedFrame.payloadLength).toBe(12); // "test message" length
      expect(new TextDecoder().decode(decodedFrame.payload)).toBe("test message");
    });

    it("should handle all valid frame types", () => {
      const validTypes = [FrameType.PING, FrameType.PONG, FrameType.TERMINAL_INIT, FrameType.TERMINAL_REFRESH, FrameType.TERMINAL_DATA];

      validTypes.forEach(type => {
        const frame = FrameCodec.create(type, 111, "test");
        const decodedFrame = FrameCodec.decode(frame.toBuffer());
        expect(decodedFrame.type).toBe(type);
      });
    });

    it("should round-trip remotePort through encode/decode", () => {
      const frame = FrameCodec.create(FrameType.TCP_DATA, 42, "hello", 8080);
      const decoded = FrameCodec.decode(frame.toBuffer());
      expect(decoded.remotePort).toBe(8080);
      expect(decoded.identifier).toBe(42);
      expect(new TextDecoder().decode(decoded.payload)).toBe("hello");
    });

    it("should preserve remotePort=0 in round-trip", () => {
      const frame = FrameCodec.create(FrameType.TERMINAL_DATA, 1, "data", 0);
      const decoded = FrameCodec.decode(frame.toBuffer());
      expect(decoded.remotePort).toBe(0);
    });
  });

  describe("number2buffer and buffer2number", () => {
    it("should convert number to buffer and back correctly", () => {
      const testNumbers = [0, 1, -1, 123.456, -789.123, Math.PI, Number.MAX_SAFE_INTEGER];

      testNumbers.forEach(number => {
        const buffer = FrameCodec.number2buffer(number);
        const convertedNumber = FrameCodec.buffer2number(buffer);
        expect(convertedNumber).toBe(number);
      });
    });

    it("should throw error for buffer too short in buffer2number", () => {
      const shortBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7]); // 7 bytes instead of 8

      expect(() => {
        FrameCodec.buffer2number(shortBuffer);
      }).toThrow("Data too short for number conversion: expected 8 bytes, got 7");
    });

    it("should handle edge case numbers", () => {
      const edgeCases = [
        Number.MIN_VALUE,
        Number.MAX_VALUE,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NaN
      ];

      edgeCases.forEach(number => {
        const buffer = FrameCodec.number2buffer(number);
        const convertedNumber = FrameCodec.buffer2number(buffer);

        if (Number.isNaN(number)) {
          expect(Number.isNaN(convertedNumber)).toBe(true);
        } else {
          expect(convertedNumber).toBe(number);
        }
      });
    });
  });

  describe("randomIdentifier", () => {
    it("should generate identifiers within valid range", () => {
      const identifiers = Array.from({ length: 100 }, () => FrameCodec.randomIdentifier());

      identifiers.forEach(id => {
        expect(id).toBeGreaterThanOrEqual(0);
        expect(id).toBeLessThan(0xfffffff); // 小于 2^28
        expect(Number.isInteger(id)).toBe(true);
      });
    });

    it("should generate unique identifiers", () => {
      const identifiers = new Set();

      // 生成足够多的标识符来测试唯一性
      for (let i = 0; i < 1000; i++) {
        identifiers.add(FrameCodec.randomIdentifier());
      }

      // 由于是随机数，可能会有重复，但重复率应该很低
      expect(identifiers.size).toBeGreaterThan(900); // 允许少量重复
    });
  });

  describe("encodeTarget and decodeTarget", () => {
    it("should encode and decode IPv4 target correctly", () => {
      const host = "192.168.1.100";
      const port = 5900;
      const encoded = FrameCodec.encodeTarget(host, port);
      const decoded = FrameCodec.decodeTarget(encoded);
      expect(decoded.host).toBe(host);
      expect(decoded.port).toBe(port);
    });

    it("should encode and decode hostname target correctly", () => {
      const host = "vnc.example.com";
      const port = 5901;
      const encoded = FrameCodec.encodeTarget(host, port);
      const decoded = FrameCodec.decodeTarget(encoded);
      expect(decoded.host).toBe(host);
      expect(decoded.port).toBe(port);
    });

    it("should handle IPv6 address correctly", () => {
      const host = "::1";
      const port = 5900;
      const encoded = FrameCodec.encodeTarget(host, port);
      const decoded = FrameCodec.decodeTarget(encoded);
      expect(decoded.host).toBe(host);
      expect(decoded.port).toBe(port);
    });

    it("should handle port 0 correctly", () => {
      const host = "localhost";
      const port = 0;
      const encoded = FrameCodec.encodeTarget(host, port);
      const decoded = FrameCodec.decodeTarget(encoded);
      expect(decoded.host).toBe(host);
      expect(decoded.port).toBe(port);
    });

    it("should handle max port correctly", () => {
      const host = "10.0.0.1";
      const port = 65535;
      const encoded = FrameCodec.encodeTarget(host, port);
      const decoded = FrameCodec.decodeTarget(encoded);
      expect(decoded.host).toBe(host);
      expect(decoded.port).toBe(port);
    });

    it("should round-trip through Frame payload correctly", () => {
      const host = "192.168.1.1";
      const port = 8080;
      const payload = FrameCodec.encodeTarget(host, port);
      const frame = FrameCodec.create(FrameType.VNC_INIT, 123, payload, port);
      const decodedFrame = FrameCodec.decode(frame.toBuffer());
      const target = FrameCodec.decodeTarget(decodedFrame.payload);
      expect(target.host).toBe(host);
      expect(target.port).toBe(port);
      expect(decodedFrame.type).toBe(FrameType.VNC_INIT);
      expect(decodedFrame.identifier).toBe(123);
      expect(decodedFrame.remotePort).toBe(port);
    });
  });

  describe("integration tests", () => {
    it("should encode and decode complex data correctly", () => {
      const testData = {
        string: "Hello, World! 🚀",
        number: 123.456789,
        binary: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05])
      };

      // 测试字符串
      const stringFrame = FrameCodec.create(FrameType.TERMINAL_DATA, 1, testData.string);
      const decodedStringFrame = FrameCodec.decode(stringFrame.toBuffer());
      expect(new TextDecoder().decode(decodedStringFrame.payload)).toBe(testData.string);

      // 测试数字
      const numberFrame = FrameCodec.create(FrameType.PING, 2, testData.number);
      const decodedNumberFrame = FrameCodec.decode(numberFrame.toBuffer());
      expect(FrameCodec.buffer2number(decodedNumberFrame.payload)).toBe(testData.number);

      // 测试二进制数据
      const binaryFrame = FrameCodec.create(FrameType.TERMINAL_DATA, 3, testData.binary);
      const decodedBinaryFrame = FrameCodec.decode(binaryFrame.toBuffer());
      expect(decodedBinaryFrame.payload).toEqual(testData.binary);
    });

    it("should handle round-trip encoding/decoding", () => {
      const originalData = "Round-trip test data with special chars: ñáéíóú 中文 🎉";
      const identifier = FrameCodec.randomIdentifier();

      const encodedFrame = FrameCodec.create(FrameType.TERMINAL_DATA, identifier, originalData);
      const buffer = encodedFrame.toBuffer();
      const decodedFrame = FrameCodec.decode(buffer);
      const decodedData = new TextDecoder().decode(decodedFrame.payload);

      expect(decodedData).toBe(originalData);
      expect(decodedFrame.type).toBe(FrameType.TERMINAL_DATA);
      expect(decodedFrame.identifier).toBe(identifier);
    });

    it("should encode TCP_DATA with port and decode correctly", () => {
      const payload = new TextEncoder().encode("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n");
      const frame = FrameCodec.create(FrameType.TCP_DATA, 999, payload, 4096);
      const decoded = FrameCodec.decode(frame.toBuffer());

      expect(decoded.type).toBe(FrameType.TCP_DATA);
      expect(decoded.identifier).toBe(999);
      expect(decoded.remotePort).toBe(4096);
      expect(decoded.payload).toEqual(payload);
    });
  });
});
