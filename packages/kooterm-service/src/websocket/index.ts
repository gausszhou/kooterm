import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import loglevel, { LogLevelDesc } from 'loglevel';
import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import { Terminal } from './terminal/terminal.js';
import { isEcho, onEcho } from './echo/index.js';
import { isTerminal, TerminalManager } from './terminal/useTerminal.js';
import { isVncMessage, VNCManager } from './vnc/useVnc.js';
import { VNCServerSocket } from './vnc/vnc.js';

const logger = loglevel.getLogger('WebSocketServer');
logger.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || 'info');

const onTerminalInit = (frame: Frame, terminal: Terminal) => {
  logger.debug(frame.identifier, '收到 TERMINAL_INIT 帧:', frame.payloadLength);
  terminal.init();
};

const onTerminalRefresh = (frame: Frame, terminal: Terminal) => {
  logger.debug(frame.identifier, '收到 TERMINAL_REFRESH 帧:', frame.payloadLength);
  terminal.refresh();
};

const onTerminalData = (frame: Frame, terminal: Terminal) => {
  const input = new TextDecoder().decode(frame.payload);
  logger.debug(frame.identifier, '收到 TERMINAL_DATA 帧:', frame.payloadLength);
  terminal.write(input);
};

const onTerminalResize = (frame: Frame, terminal: Terminal) => {
  const cols = frame.payload[0] << 8 | frame.payload[1];
  const rows = frame.payload[2] << 8 | frame.payload[3];
  logger.info(frame.identifier, '收到 TERMINAL_RESIZE 帧: cols=' + cols + ' rows=' + rows + ' payload=[' + Array.from(frame.payload).join(',') + ']');
  terminal.resize(cols, rows);
};

const onVncInit = (frame: Frame, socket: VNCServerSocket) => {
  logger.debug(frame.identifier, '收到 VNC_INIT 帧:', frame.payloadLength);
};

const onVncData = (frame: Frame, socket: VNCServerSocket) => {
  logger.debug(frame.identifier, '收到 VNC_DATA 帧:', frame.payloadLength);
  socket.write(frame.payload);
};

export function useWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server });
  wss.addListener('headers', (headers, req) => {
    logger.debug('WebSocket请求头:', req.socket.remoteAddress, headers);
  });
  wss.addListener('listening', () => {
    logger.info('WebSocket服务器已启动，等待客户端连接...');
  });
  const terminalManager = new TerminalManager();
  const vncManager = new VNCManager();
  // WebSocket连接处理
  wss.addListener('connection', (ws: WebSocket, req) => {
    logger.info('用户连接:', req.socket.remoteAddress);

    ws.on('message', (message: ArrayBuffer) => {
      const frame = FrameCodec.decode(message);
      if (isEcho(frame)) {
        onEcho(ws, frame);
      } else if (isTerminal(frame)) {
        // 终端
        const terminal = terminalManager.getTerminal(frame.identifier, ws);
        if (frame.type === FrameType.TERMINAL_INIT) {
          onTerminalInit(frame, terminal);
        } else if (frame.type === FrameType.TERMINAL_REFRESH) {
          onTerminalRefresh(frame, terminal);
        } else if (frame.type === FrameType.TERMINAL_DATA) {
          onTerminalData(frame, terminal);
        } else if (frame.type === FrameType.TERMINAL_RESIZE) {
          onTerminalResize(frame, terminal);
        }
      } else if (isVncMessage(frame)) {
        if (process.env.VNC_ENABLE !== 'true') {
          logger.debug('VNC功能未启用，请检查环境变量VNC_ENABLE');
          return;
        }
        // VNC
        const vncSocket = vncManager.getVncSocket(ws, frame.identifier);
        if (frame.type === FrameType.VNC_INIT) {
          onVncInit(frame, vncSocket);
        } else if (frame.type === FrameType.VNC_DATA) {
          onVncData(frame, vncSocket);
        }
      } else {
        logger.warn(frame.identifier, '收到未知帧类型:', FrameType[frame.type]);
      }
    });

    ws.addEventListener('close', () => {
      logger.info('用户断开连接:', req.socket.remoteAddress);
      terminalManager.removeConnection(ws);
      vncManager.removeConnection(ws);
    });
  });
}
