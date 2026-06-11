/**
 * WebSocket 帧操作码 (RFC 6455 Section 11.8)
 */
export enum WsOpcode {
  Continuation = 0x0,
  Text = 0x1,
  Binary = 0x2,
  Close = 0x8,
  Ping = 0x9,
  Pong = 0xA,
}

/**
 * 解码后的 WebSocket 帧
 */
export interface WsFrame {
  fin: boolean;
  opcode: WsOpcode;
  masked: boolean;
  payload: Uint8Array;
}

/**
 * WebSocket 帧编解码器 (RFC 6455)
 *
 * 用于在 TCP 隧道上代理 WebSocket 连接时，
 * 编码和解码 WebSocket 线格式帧。
 *
 * 注意：分片帧（continuation）需要调用方自行合并 payload。
 */
export class WebSocketCodec {
  /**
   * 编码 WebSocket 帧为原始字节
   *
   * @param opcode  操作码
   * @param payload 载荷数据
   * @param isClient 是否为客户端发送（客户端必须 masked）
   * @returns 编码后的帧字节
   */
  static encode(
    opcode: WsOpcode,
    payload: Uint8Array | string,
    isClient = true
  ): Uint8Array {
    const payloadBytes = typeof payload === 'string'
      ? new TextEncoder().encode(payload)
      : payload;
    const payloadLen = payloadBytes.length;

    // 计算帧长度
    let extendedLenSize = 0;
    if (payloadLen > 65535) {
      extendedLenSize = 8; // 64-bit extended length
    } else if (payloadLen > 125) {
      extendedLenSize = 2; // 16-bit extended length
    }

    const maskSize = isClient ? 4 : 0;
    const frameSize = 2 + extendedLenSize + maskSize + payloadLen;
    const frame = new Uint8Array(frameSize);
    const view = new DataView(frame.buffer);

    // Byte 0: FIN + opcode
    frame[0] = 0x80 | (opcode & 0x0F); // FIN=1 + opcode

    // Byte 1: MASK + payload length
    let offset = 1;
    if (payloadLen <= 125) {
      frame[offset] = (isClient ? 0x80 : 0x00) | payloadLen;
      offset++;
    } else if (payloadLen <= 65535) {
      frame[offset] = (isClient ? 0x80 : 0x00) | 126;
      offset++;
      view.setUint16(offset, payloadLen, false);
      offset += 2;
    } else {
      frame[offset] = (isClient ? 0x80 : 0x00) | 127;
      offset++;
      // 64-bit length, high 32 bits must be 0 for reasonable payloads
      view.setUint32(offset, 0, false);
      offset += 4;
      view.setUint32(offset, payloadLen, false);
      offset += 4;
    }

    // Masking key + masked payload
    if (isClient) {
      const mask = generateMask();
      frame[offset] = mask[0];
      frame[offset + 1] = mask[1];
      frame[offset + 2] = mask[2];
      frame[offset + 3] = mask[3];
      offset += 4;

      for (let i = 0; i < payloadLen; i++) {
        frame[offset + i] = payloadBytes[i] ^ mask[i & 3];
      }
    } else {
      frame.set(payloadBytes, offset);
    }

    return frame;
  }

  /**
   * 解码原始字节为 WebSocket 帧
   *
   * @returns 解码后的帧，数据不完整返回 null
   */
  static decode(data: Uint8Array): WsFrame | null {
    if (data.length < 2) return null;

    // Byte 0: FIN + opcode
    const fin = (data[0] & 0x80) !== 0;
    const opcode = data[0] & 0x0F;

    // Byte 1: MASK + payload length
    const masked = (data[1] & 0x80) !== 0;
    let payloadLen = data[1] & 0x7F;
    let offset = 2;

    // Extended payload length
    if (payloadLen === 126) {
      if (data.length < 4) return null;
      payloadLen = (data[2] << 8) | data[3];
      offset = 4;
    } else if (payloadLen === 127) {
      if (data.length < 10) return null;
      // 64-bit length, check high 32 bits
      if (data[2] !== 0 || data[3] !== 0 || data[4] !== 0 || data[5] !== 0) {
        throw new Error('WebSocket frame payload too large');
      }
      payloadLen = (data[6] << 24) | (data[7] << 16) | (data[8] << 8) | data[9];
      offset = 10;
    }

    // Masking key
    let mask: Uint8Array | null = null;
    if (masked) {
      if (data.length < offset + 4) return null;
      mask = data.slice(offset, offset + 4);
      offset += 4;
    }

    // Payload
    if (data.length < offset + payloadLen) return null;
    const payload = data.slice(offset, offset + payloadLen);

    // Unmask
    if (mask) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] = payload[i] ^ mask[i & 3];
      }
    }

    return { fin, opcode: opcode as WsOpcode, masked, payload };
  }

  static encodeText(text: string, isClient = true): Uint8Array {
    return WebSocketCodec.encode(WsOpcode.Text, text, isClient);
  }

  static encodeBinary(data: Uint8Array, isClient = true): Uint8Array {
    return WebSocketCodec.encode(WsOpcode.Binary, data, isClient);
  }

  static encodeClose(code = 1000, reason = '', isClient = true): Uint8Array {
    const reasonBytes = new TextEncoder().encode(reason);
    const payload = new Uint8Array(2 + reasonBytes.length);
    const view = new DataView(payload.buffer);
    view.setUint16(0, code, false);
    payload.set(reasonBytes, 2);
    return WebSocketCodec.encode(WsOpcode.Close, payload, isClient);
  }

  static encodePing(data: Uint8Array = new Uint8Array(0), isClient = true): Uint8Array {
    return WebSocketCodec.encode(WsOpcode.Ping, data, isClient);
  }

  static encodePong(data: Uint8Array = new Uint8Array(0), isClient = true): Uint8Array {
    return WebSocketCodec.encode(WsOpcode.Pong, data, isClient);
  }
}

function generateMask(): Uint8Array {
  const mask = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    mask[i] = Math.floor(Math.random() * 256);
  }
  return mask;
}
