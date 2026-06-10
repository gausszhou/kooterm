import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import loglevel, { LogLevelDesc } from 'loglevel';
import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import { isEcho, onEcho } from './echo.js';
import { isTerminal, TerminalManager } from './terminal/manager.js';
import { isVncMessage, VNCManager, onVncInit, onVncData } from './vnc/manager.js';
import { TcpManager, isTcpMessage } from './tcp/manager.js';
import { getClientIp } from '../utils.js';

const logger = loglevel.getLogger('WebSocketServer');
logger.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || 'info');

const terminalManager = new TerminalManager(Number(process.env.SSH_MAX) || 5);
const vncManager = new VNCManager();
const tcpManager = new TcpManager();

function handleTerminal(ws: WebSocket, frame: Frame) {
  switch (frame.type) {
    case FrameType.TERMINAL_INIT: {
      const sessionId = new TextDecoder().decode(frame.payload);
      logger.debug(frame.identifier, 'TERMINAL_INIT session:', sessionId);
      terminalManager.initSession(sessionId, ws, frame.identifier).then(() => {
        const resp = FrameCodec.create(FrameType.TERMINAL_INIT, frame.identifier, new Uint8Array(0));
        ws.send(resp.toBuffer());
      }).catch(err => logger.error(frame.identifier, 'SSH init failed:', err));
      break;
    }
    case FrameType.TERMINAL_REFRESH: {
      const sid = terminalManager.getSessionId(ws, frame.identifier);
      if (!sid) { logger.debug(frame.identifier, '会话未找到, 忽略 REFRESH'); break; }
      logger.debug(frame.identifier, 'TERMINAL_REFRESH session:', sid);
      terminalManager.openShell(sid).then(() => {
        const resp = FrameCodec.create(FrameType.TERMINAL_REFRESH, frame.identifier, new Uint8Array(0));
        ws.send(resp.toBuffer());
      }).catch(err => logger.error(frame.identifier, 'SSH refresh failed:', err));
      break;
    }
    case FrameType.TERMINAL_DATA: {
      const sid = terminalManager.getSessionId(ws, frame.identifier);
      if (!sid) { logger.debug(frame.identifier, '会话未找到, 忽略 DATA'); break; }
      const input = new TextDecoder().decode(frame.payload);
      const terminal = terminalManager.getSession(sid);
      if (terminal) terminal.write(input);
      break;
    }
    case FrameType.TERMINAL_RESIZE: {
      const sid = terminalManager.getSessionId(ws, frame.identifier);
      if (!sid) { logger.debug(frame.identifier, '会话未找到, 忽略 RESIZE'); break; }
      const cols = frame.payload[0] << 8 | frame.payload[1];
      const rows = frame.payload[2] << 8 | frame.payload[3];
      logger.debug(frame.identifier, `TERMINAL_RESIZE cols=${cols} rows=${rows}`);
      const terminal = terminalManager.getSession(sid);
      if (terminal) terminal.resize(cols, rows);
      break;
    }
  }
}

function handleVnc(ws: WebSocket, frame: Frame) {
  if (process.env.VNC_ENABLE !== 'true') {
    logger.debug(frame.identifier, 'VNC 未启用');
    return;
  }
  const vncSocket = vncManager.getVncSocket(ws, frame.identifier);
  if (frame.type === FrameType.VNC_INIT) {
    onVncInit(frame, vncSocket);
  } else if (frame.type === FrameType.VNC_DATA) {
    onVncData(frame, vncSocket);
  }
}

function handleTcp(ws: WebSocket, frame: Frame) {
  if (frame.type === FrameType.TCP_INIT) {
    const { host, port } = FrameCodec.decodeTarget(frame.payload);
    logger.debug(frame.identifier, `TCP_INIT ${host}:${port}`);
    tcpManager.getOrCreate(ws, frame.identifier, host, port);
  } else if (frame.type === FrameType.TCP_DATA) {
    tcpManager.write(frame.identifier, frame.payload);
  }
}

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
    const ip = getClientIp(req);
    logger.info('用户连接:', ip);

    ws.on('error', err => {
      logger.error('WebSocket 错误:', ip, err.message);
    });

    ws.on('message', (message: ArrayBuffer) => {
      let frame: Frame;
      try {
        frame = FrameCodec.decode(message);
      } catch (err) {
        logger.error('帧解码失败:', ip, err);
        return;
      }

      logger.debug(frame.identifier, FrameType[frame.type], 'payload=' + frame.payloadLength);

      if (isEcho(frame)) {
        onEcho(ws, frame);
        return;
      }

      if (isTerminal(frame)) {
        handleTerminal(ws, frame);
        return;
      }

      if (isVncMessage(frame)) {
        handleVnc(ws, frame);
        return;
      }

      if (isTcpMessage(frame)) {
        handleTcp(ws, frame);
        return;
      }

      logger.warn(frame.identifier, '未知帧类型:', FrameType[frame.type]);
    });

    ws.addEventListener('close', () => {
      logger.info('用户断开连接:', ip);
      terminalManager.removeConnection(ws);
      vncManager.removeConnection(ws);
      tcpManager.removeConnection();
    });
  });
}
