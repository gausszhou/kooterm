import { FrameType } from '../types.js';
import { Frame, FRAME_TYPE_AT, REMOTE_PORT_AT, PAYLOAD_LENGTH_AT, IDENTIFIER_AT } from './Frame.js';

export class FrameCodec {
  static create(
    type: FrameType,
    identifier: number,
    data: string | number | Uint8Array | ArrayBuffer,
    port = 0
  ): Frame {
    let playload: Uint8Array = new Uint8Array(0);
    if (typeof data === "string") {
      playload = new TextEncoder().encode(data);
    } else if (typeof data === "number") {
      playload = FrameCodec.number2buffer(data);
    } else if (data instanceof Uint8Array) {
      playload = data;
    } else if (data instanceof ArrayBuffer) {
      playload = new Uint8Array(data);
    } else {
      throw new Error("Unsupported data type for encoding");
    }
    const frame = new Frame(type, identifier, playload, port);
    return frame;
  }

  static decode(buf: ArrayBuffer): Frame {
    if (buf.byteLength < Frame.HeaderSize) {
      console.error(
        `Data too short: expected at least ${Frame.HeaderSize} bytes, got ${buf.byteLength}`
      );
    }

    const u8 = new Uint8Array(buf);
    const view = new DataView(u8.buffer);
    const type = view.getUint16(FRAME_TYPE_AT);
    const remotePort = view.getUint16(REMOTE_PORT_AT);
    const payloadLength = view.getUint32(PAYLOAD_LENGTH_AT);
    const identifier = view.getUint32(IDENTIFIER_AT, false);

    if (buf.byteLength < Frame.HeaderSize + payloadLength) {
      console.error(
        `Incomplete data: expected ${
          Frame.HeaderSize + payloadLength
        } bytes, got ${buf.byteLength}`
      );
    }

    const payload = u8.slice(
      Frame.HeaderSize,
      Frame.HeaderSize + payloadLength
    );

    if (!Object.values(FrameType).includes(type)) {
      console.log(`Invalid frame type: ${type}`);
    }

    const frame = new Frame(type, identifier, payload, remotePort);
    return frame;
  }

  static number2buffer(number: number): Uint8Array {
    const buffer = new Uint8Array(8);
    const view = new DataView(buffer.buffer);
    view.setFloat64(0, number, false);
    return buffer;
  }

  static buffer2number(data: Uint8Array): number {
    if (data.length < 8) {
      throw new Error(
        `Data too short for number conversion: expected 8 bytes, got ${data.length}`
      );
    }
    const buffer = new Uint8Array(data);
    const view = new DataView(buffer.buffer);
    return view.getFloat64(0, false);
  }

  static randomIdentifier(): number {
    return Math.floor(Math.random() * 0xfffffff);
  }

  static encodeTarget(host: string, port: number): Uint8Array {
    return new TextEncoder().encode(`${host}:${port}`);
  }

  static decodeTarget(payload: Uint8Array): { host: string; port: number } {
    const str = new TextDecoder().decode(payload);
    const colon = str.lastIndexOf(':');
    return {
      host: str.substring(0, colon),
      port: parseInt(str.substring(colon + 1), 10),
    };
  }
}
