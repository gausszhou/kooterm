import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import loglevel, { LogLevelDesc } from 'loglevel';
import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import { isEcho, onEcho } from './echo.js';
import { isTerminal, TerminalManager } from './terminal/manager.js';
import { isVncMessage, VNCManager } from './vnc/manager.js';
import { VNCServerSocket } from './vnc/vnc.js';
import { TcpManager } from './tcp/manager.js';

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

const terminalManager = new TerminalManager(Number(process.env.SSH_MAX) || 5);
const vncManager = new VNCManager();
const tcpManager = new TcpManager();

const onVncInit = (frame: Frame, socket: VNCServerSocket) => {
  logger.debug(frame.identifier, '收到 VNC_INIT 帧:', frame.payloadLength);
};

const onVncData = (frame: Frame, socket: VNCServerSocket) => {
  logger.debug(frame.identifier, '收到 VNC_DATA 帧:', frame.payloadLength);
  socket.write(frame.payload);
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
  wss.addListener('connection', (ws: WebSocket, req) => {
    logger.info('用户连接:', getClientIp(req));

    ws.on('message', (message: ArrayBuffer) => {
      const frame = FrameCodec.decode(message);
      if (isEcho(frame)) {
        onEcho(ws, frame);
      } else if (isTerminal(frame)) {
        if (frame.type === FrameType.TERMINAL_INIT) {
          const sessionId = new TextDecoder().decode(frame.payload);
          logger.debug(frame.identifier, 'TERMINAL_INIT session:', sessionId);
          terminalManager.initSession(sessionId, ws, frame.identifier)
            .catch(err => logger.error('SSH init failed:', err));
        } else {
          const sid = terminalManager.getSessionId(ws, frame.identifier);
          if (!sid) return;
          if (frame.type === FrameType.TERMINAL_REFRESH) {
            logger.debug(frame.identifier, 'TERMINAL_REFRESH session:', sid);
            terminalManager.openShell(sid).catch(err => logger.error('SSH refresh failed:', err));
          } else if (frame.type === FrameType.TERMINAL_DATA) {
            const input = new TextDecoder().decode(frame.payload);
            const terminal = terminalManager.getSession(sid);
            if (terminal) terminal.write(input);
          } else if (frame.type === FrameType.TERMINAL_RESIZE) {
            const cols = frame.payload[0] << 8 | frame.payload[1];
            const rows = frame.payload[2] << 8 | frame.payload[3];
            const terminal = terminalManager.getSession(sid);
            if (terminal) terminal.resize(cols, rows);
          }
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
        const { host, port } = FrameCodec.decodeTarget(frame.payload);
        tcpManager.getOrCreate(ws, frame.identifier, host, port);
      } else if (frame.type === FrameType.TCP_DATA) {
        tcpManager.write(frame.identifier, frame.payload);
      } else {
        logger.warn(frame.identifier, '收到未知帧类型:', FrameType[frame.type]);
      }
    });

    ws.addEventListener('close', () => {
      logger.info('用户断开连接:', getClientIp(req));
      terminalManager.removeConnection(ws);
      vncManager.removeConnection(ws);
      tcpManager.removeConnection();
    });
  });
}
