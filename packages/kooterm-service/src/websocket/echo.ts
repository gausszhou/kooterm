import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';

export const isEcho = (frame: Frame) => {
  return frame.type === FrameType.PING || frame.type === FrameType.PONG;
};

export const onEcho = (ws: WebSocket, frame: Frame) => {
  const replyType = frame.type === FrameType.PING ? FrameType.PONG : FrameType.PING;
  const pongFrame = FrameCodec.create(replyType, frame.identifier, frame.payload, 0);
  const buffer = pongFrame.toBuffer();
  ws.send(buffer);
};
