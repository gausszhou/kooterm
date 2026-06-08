/**
 * 0 1 2 3 4 5 6 7 0 1 2 3 4 5 6 7 0
 * +---------------+---------------+
 * |   FrameType   |  Reserve      |
 * +---------------+---------------+
 * |         Payload Length        |
 * |                               |
 * +---------------+---------------+
 * |          Identifier           |
 * |                               |
 * +---------------+---------------+
 * |                               |
 * |         Payload...            |
 * |                               |
 * +---------------+---------------+
 */

import { FrameType } from './types.js';
export * from './types.js';
export * from './utils.js';

// 不能使用 Buffer，因为 Buffer 是 Node.js 中的一个类，浏览器中没有这个类
// 使用 DataView 和 TypedArray 确保浏览器和 Node.js 行为一致

const FRAME_TYPE_SIZE = 1; // FrameType 使用 1 字节表示
const RESERVED_SIZE = 1; // Reserve 使用 1 字节表示
const PAYLOAD_LENGTH_SIZE = 4; // Payload Length 使用 4 字节表示
const IDENTIFIER_SIZE = 4; // Identifier 使用 4 字节表示
const HEADER_SIZE = FRAME_TYPE_SIZE + RESERVED_SIZE + PAYLOAD_LENGTH_SIZE + IDENTIFIER_SIZE;
const FRAME_TYPE_AT = 0;
const RESERVED_AT = FRAME_TYPE_AT + FRAME_TYPE_SIZE;
const PAYLOAD_LENGTH_AT = RESERVED_AT + RESERVED_SIZE;
const IDENTIFIER_AT = PAYLOAD_LENGTH_AT + PAYLOAD_LENGTH_SIZE;

export class Frame {
  static HeaderSize = HEADER_SIZE;

  type: FrameType;
  payloadLength: number;
  identifier: number;
  payload: Uint8Array;

  constructor(type: FrameType, identifier: number, payload: Uint8Array) {
    this.type = type;
    this.payloadLength = payload.byteLength;
    this.identifier = identifier;
    this.payload = payload;
  }

  toBuffer(): ArrayBuffer {
    const buffer = new Uint8Array(Frame.HeaderSize + this.payloadLength);
    const view = new DataView(buffer.buffer);
    view.setUint16(FRAME_TYPE_AT, this.type);
    view.setUint32(PAYLOAD_LENGTH_AT, this.payloadLength);
    view.setUint32(IDENTIFIER_AT, this.identifier, false);
    buffer.set(this.payload, Frame.HeaderSize);
    return buffer.buffer;
  }
}

export class FrameCodec {
  static create(
    type: FrameType,
    identifier: number,
    data: string | number | Uint8Array | ArrayBuffer
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
    const frame = new Frame(type, identifier, playload);
    return frame;
  }

  static decode(buf: ArrayBuffer): Frame {
    // 检查数据长度是否足够
    if (buf.byteLength < Frame.HeaderSize) {
      console.error(
        `Data too short: expected at least ${Frame.HeaderSize} bytes, got ${buf.byteLength}`
      );
    }

    const u8 = new Uint8Array(buf);
    const view = new DataView(u8.buffer);
    const type = view.getUint16(FRAME_TYPE_AT);
    const payloadLength = view.getUint32(PAYLOAD_LENGTH_AT);
    const identifier = view.getUint32(IDENTIFIER_AT, false);

    // 检查payload长度是否有效
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

    // 验证FrameType是否有效
    if (!Object.values(FrameType).includes(type)) {
      console.log(`Invalid frame type: ${type}`);
    }

    const frame = new Frame(type, identifier, payload);
    return frame;
  }

  static number2buffer(number: number): Uint8Array {
    const buffer = new Uint8Array(8);
    const view = new DataView(buffer.buffer);
    view.setFloat64(0, number, false);
    return buffer;
  }

  static buffer2number(data: Uint8Array): number {
    // 检查数据长度是否足够（需要8字节来存储double）
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
}
