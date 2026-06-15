import net from 'net';
import WebSocket from 'ws';
import { analyzeVNCMessage } from '@kooterm/common';
import loglevel, { LogLevelDesc } from 'loglevel';

const VNC_PORT = Number(process.env.VNC_PORT) || 5900;
const VNC_HOST = process.env.TARGET_HOST || '127.0.0.1';
const logger = loglevel.getLogger('VNCServerSocket');

logger.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || 'info');

export class VNCServerSocket {
  private socket: net.Socket;

  private handleshakeDebug = 20; // 只分析前20条握手消息

  public identifier: number;

  constructor(ws: WebSocket, identifier: number) {
    logger.debug(identifier, '创建 VNC 连接');
    this.socket = net.createConnection({
      port: VNC_PORT,
      host: VNC_HOST,
    });
    this.identifier = identifier;
    // TCP 事件
    this.socket.on('connect', () => {
      logger.debug('VNC 连接成功');
    });

    this.socket.on('data', this._onData.bind(this));

    this.socket.on('close', () => {
      logger.debug('VNC 连接关闭');
      ws.close();
    });

    this.socket.on('error', err => {
      logger.debug('VNC 连接错误:', err);
      this.socket.end();
      ws.close();
    });

    // WebSocket 事件
    ws.on('close', () => {
      this.socket.end();
    });

    ws.on('error', () => {
      this.socket.end();
    });
  }

  createSocket() {
    const socket = net.createConnection({
      port: VNC_PORT,
      host: VNC_HOST,
    });
    return socket;
  }

  _onData(data: Uint8Array) {
    if (this.handleshakeDebug-- > 0) {
      logger.debug(analyzeVNCMessage(data, 'server_to_client'));
    }
    this.onData(data);
  }

  onData(data: Uint8Array) {
    // TODO Override
  }

  write(data: Uint8Array) {
    if (this.handleshakeDebug-- > 0) {
      logger.debug(analyzeVNCMessage(data, 'client_to_server'));
    }
    this.socket.write(data);
  }

  close() {
    this.socket.end();
  }
}
