import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import { VNCServerSocket } from './vnc.js';
import { getLogger } from '../../logger.js';

const logger = getLogger('VNCManager');

export const onVncInit = (frame: Frame, socket: VNCServerSocket) => {
  logger.debug(`[VNCManager] [${frame.identifier}] VNC_INIT payload=${frame.payloadLength}`);
};

export const onVncData = (frame: Frame, socket: VNCServerSocket) => {
  logger.debug(`[VNCManager] [${frame.identifier}] VNC_DATA payload=${frame.payloadLength}`);
  socket.write(frame.payload);
};

const onVncReply = (data: Uint8Array, socket: VNCServerSocket, ws: WebSocket) => {
  let payload: Uint8Array;
  if (typeof data === 'string') {
    payload = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    payload = data;
  } else {
    payload = new Uint8Array(data);
  }
  const frame = FrameCodec.create(FrameType.VNC_DATA, socket.identifier, data, 0);
  ws.send(frame.toBuffer());
};

export class VNCManager {
  private vncMap: Map<WebSocket, VNCServerSocket> = new Map();

  getVncSocket(ws: WebSocket, identifier: number): VNCServerSocket {
    let vncSocket = this.vncMap.get(ws); // 每个连接对应一个 VncSocket
    if (vncSocket) {
      vncSocket.identifier = identifier;
      vncSocket.onData = data => onVncReply(data, vncSocket!, ws);
      return vncSocket;
    }
    vncSocket = new VNCServerSocket(ws, identifier);
    vncSocket.onData = data => onVncReply(data, vncSocket, ws);
    this.vncMap.set(ws, vncSocket);
    return vncSocket;
  }

  removeConnection(ws: WebSocket) {
    const connection = this.vncMap.get(ws);
    if (connection) {
      connection.close();
      this.vncMap.delete(ws);
    }
  }

  size() {
    return this.vncMap.size;
  }
}

export const isVncMessage = (frame: Frame) => {
  return frame.type === FrameType.VNC_DATA || frame.type === FrameType.VNC_INIT;
};
