/**
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |  FrameType (1B) | Reserved (1B)|     Remote Port (2B)        |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                       Payload Length (4B)                     |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                       Identifier (4B)                        |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 * |                                                               |
 * |                       Payload...                              |
 * |                                                               |
 * +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */

import { FrameType } from '../types.js';

export const FRAME_TYPE_SIZE = 1;
export const RESERVED_SIZE = 1;
export const REMOTE_PORT_SIZE = 2;
export const PAYLOAD_LENGTH_SIZE = 4;
export const IDENTIFIER_SIZE = 4;
export const HEADER_SIZE = FRAME_TYPE_SIZE + RESERVED_SIZE + REMOTE_PORT_SIZE + PAYLOAD_LENGTH_SIZE + IDENTIFIER_SIZE;

export const FRAME_TYPE_AT = 0;
export const RESERVED_AT = FRAME_TYPE_AT + FRAME_TYPE_SIZE;
export const REMOTE_PORT_AT = RESERVED_AT + RESERVED_SIZE;
export const PAYLOAD_LENGTH_AT = REMOTE_PORT_AT + REMOTE_PORT_SIZE;
export const IDENTIFIER_AT = PAYLOAD_LENGTH_AT + PAYLOAD_LENGTH_SIZE;

export class Frame {
  static HeaderSize = HEADER_SIZE;

  type: FrameType;
  payloadLength: number;
  identifier: number;
  remotePort: number;
  payload: Uint8Array;

  constructor(type: FrameType, identifier: number, payload: Uint8Array, remotePort = 0) {
    this.type = type;
    this.payloadLength = payload.byteLength;
    this.identifier = identifier;
    this.remotePort = remotePort;
    this.payload = payload;
  }

  toBuffer(): ArrayBuffer {
    const buffer = new Uint8Array(Frame.HeaderSize + this.payloadLength);
    const view = new DataView(buffer.buffer);
    view.setUint16(FRAME_TYPE_AT, this.type);
    view.setUint16(REMOTE_PORT_AT, this.remotePort);
    view.setUint32(PAYLOAD_LENGTH_AT, this.payloadLength);
    view.setUint32(IDENTIFIER_AT, this.identifier, false);
    buffer.set(this.payload, Frame.HeaderSize);
    return buffer.buffer;
  }
}
