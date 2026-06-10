import http from 'http';
import net from 'net';
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

function getClientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  const xri = req.headers['x-real-ip'];
  if (typeof xri === 'string' && xri) return xri;
  return req.socket.remoteAddress || 'unknown';
}

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

const tcpSockets = new Map<number, net.Socket>();

const onTcpInit = (ws: WebSocket, frame: Frame) => {
  const { host, port } = FrameCodec.decodeTarget(frame.payload);
  logger.debug(frame.identifier, `TCP 代理: ${host}:${port}`);

  const existing = tcpSockets.get(frame.identifier);
  if (existing) {
    existing.end();
    tcpSockets.delete(frame.identifier);
  }

  const socket = net.createConnection({ host, port });
  tcpSockets.set(frame.identifier, socket);

  socket.on('connect', () => {
    logger.debug(frame.identifier, 'TCP 连接成功');
  });

  socket.on('data', (data: Uint8Array) => {
    const out = FrameCodec.create(FrameType.TCP_DATA, frame.identifier, data);
    ws.send(out.toBuffer());
  });

  socket.on('close', () => {
    tcpSockets.delete(frame.identifier);
    ws.close();
  });

  socket.on('error', err => {
    logger.debug('TCP 错误:', err);
    socket.end();
    tcpSockets.delete(frame.identifier);
    ws.close();
  });
};

const onTcpData = (frame: Frame) => {
  const socket = tcpSockets.get(frame.identifier);
  if (socket) {
    socket.write(frame.payload);
  }
};

export function useWebSocket(server: http.Server | http.Server[]) {
  const servers = Array.isArray(server) ? server : [server];
  const wss = new WebSocketServer({ noServer: true });
  servers.forEach(s => {
    s.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, ws => {
        wss.emit('connection', ws, request);
      });
    });
  });
  wss.addListener('headers', (headers, req) => {
    logger.debug('WebSocket请求头:', getClientIp(req), headers);
  });
  wss.addListener('listening', () => {
    logger.info('WebSocket服务器已启动，等待客户端连接...');
  });
  const terminalManager = new TerminalManager(Number(process.env.TERMINAL_MAX) || 10);
  const vncManager = new VNCManager();
  // WebSocket连接处理
  wss.addListener('connection', (ws: WebSocket, req) => {
    logger.info('用户连接:', getClientIp(req));

    ws.on('message', (message: ArrayBuffer) => {
      const frame = FrameCodec.decode(message);
      if (isEcho(frame)) {
        onEcho(ws, frame);
      } else if (isTerminal(frame)) {
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
        const vncSocket = vncManager.getVncSocket(ws, frame.identifier);
        if (frame.type === FrameType.VNC_INIT) {
          onVncInit(frame, vncSocket);
        } else if (frame.type === FrameType.VNC_DATA) {
          onVncData(frame, vncSocket);
        }
      } else if (frame.type === FrameType.TCP_INIT) {
        onTcpInit(ws, frame);
      } else if (frame.type === FrameType.TCP_DATA) {
        onTcpData(frame);
      } else {
        logger.warn(frame.identifier, '收到未知帧类型:', FrameType[frame.type]);
      }
    });

    ws.addEventListener('close', () => {
      logger.info('用户断开连接:', getClientIp(req));
      for (const [id, socket] of tcpSockets) {
        socket.end();
        tcpSockets.delete(id);
      }
      terminalManager.removeConnection(ws);
      vncManager.removeConnection(ws);
    });
  });
}
