import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { Frame, FrameCodec, FrameType, setLogger } from '@kooterm/common';
import { isEcho, onEcho } from './echo.js';
import { isTerminal, TerminalManager } from './terminal/manager.js';
import { isVncMessage, VNCManager, onVncInit, onVncData } from './vnc/manager.js';
import { TcpManager, isTcpMessage } from './tcp/manager.js';
import { getClientIp } from '../utils.js';
import { getLogger, getCommonLogger } from '../logger.js';

// 注入统一的 logger 到 common 包
setLogger(getCommonLogger());

const logger = getLogger('WS');

const terminalManager = new TerminalManager(Number(process.env.SSH_MAX) || 5);
const vncManager = new VNCManager();
const tcpManager = new TcpManager();

function handleTerminal(ws: WebSocket, frame: Frame) {
  const id = frame.identifier;
  switch (frame.type) {
    case FrameType.TERMINAL_INIT: {
      const sessionId = new TextDecoder().decode(frame.payload);
      logger.debug(`[WS] [${id}] TERMINAL_INIT session=${sessionId}`);
      terminalManager.initSession(sessionId, ws, id).then(() => {
        const resp = FrameCodec.create(FrameType.TERMINAL_INIT, id, new Uint8Array(0), 0);
        ws.send(resp.toBuffer());
      }).catch(err => logger.error(`[WS] [${id}] SSH init failed:`, err));
      break;
    }
    case FrameType.TERMINAL_REFRESH: {
      const sessionId = new TextDecoder().decode(frame.payload);
      logger.debug(`[WS] [${id}] TERMINAL_REFRESH session=${sessionId}`);
      terminalManager.initSession(sessionId, ws, id).then(() => {
        const resp = FrameCodec.create(FrameType.TERMINAL_REFRESH, id, new Uint8Array(0), 0);
        ws.send(resp.toBuffer());
      }).catch(err => logger.error(`[WS] [${id}] SSH refresh failed:`, err));
      break;
    }
    case FrameType.TERMINAL_DATA: {
      const sid = terminalManager.getSessionId(id);
      if (!sid) { logger.debug(`[WS] [${id}] session not found, DATA ignored`); break; }
      const input = new TextDecoder().decode(frame.payload);
      const terminal = terminalManager.getSession(sid);
      if (terminal) terminal.write(input);
      break;
    }
    case FrameType.TERMINAL_RESIZE: {
      const sid = terminalManager.getSessionId(id);
      if (!sid) { logger.debug(`[WS] [${id}] session not found, RESIZE ignored`); break; }
      const cols = frame.payload[0] << 8 | frame.payload[1];
      const rows = frame.payload[2] << 8 | frame.payload[3];
      logger.debug(`[WS] [${id}] TERMINAL_RESIZE cols=${cols} rows=${rows}`);
      const terminal = terminalManager.getSession(sid);
      if (terminal) terminal.resize(cols, rows);
      break;
    }
  }
}

function handleVnc(ws: WebSocket, frame: Frame) {
  const id = frame.identifier;
  if (process.env.VNC_ENABLE !== 'true') {
    logger.debug(`[WS] [${id}] VNC disabled`);
    return;
  }
  const vncSocket = vncManager.getVncSocket(ws, id);
  if (frame.type === FrameType.VNC_INIT) {
    onVncInit(frame, vncSocket);
  } else if (frame.type === FrameType.VNC_DATA) {
    onVncData(frame, vncSocket);
  }
}

function handleTcp(ws: WebSocket, frame: Frame) {
  const id = frame.identifier;
  if (frame.type === FrameType.TCP_INIT) {
    const { host, port } = FrameCodec.decodeTarget(frame.payload);
    logger.info(`[WS] [${id}] TCP_INIT ${host}:${port}`);
    tcpManager.getOrCreate(ws, id, host, port);
  } else if (frame.type === FrameType.TCP_DATA) {
    tcpManager.write(id, frame.payload);
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
    logger.debug(`[WS] headers ${getClientIp(req)}`, headers);
  });
  wss.addListener('listening', () => {
    logger.info('[WS] server ready');
  });
  wss.addListener('connection', (ws: WebSocket, req) => {
    const ip = getClientIp(req);
    logger.info(`[WS] connect ${ip}`);

    ws.on('error', err => {
      logger.error(`[WS] error ${ip}: ${err.message}`);
    });

    ws.on('message', (message: ArrayBuffer) => {
      let frame: Frame;
      try {
        frame = FrameCodec.decode(message);
      } catch (err) {
        logger.error(`[WS] decode error ${ip}:`, err);
        return;
      }

      logger.info(`[WS] [${frame.identifier}] ${FrameType[frame.type]} payload=${frame.payloadLength}`);

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

      logger.warn(`[WS] [${frame.identifier}] unknown type ${FrameType[frame.type]}`);
    });

    ws.addEventListener('close', () => {
      logger.info(`[WS] disconnect ${ip}`);
      terminalManager.removeConnection(ws);
      vncManager.removeConnection(ws);
      tcpManager.removeConnection();
    });
  });
}
