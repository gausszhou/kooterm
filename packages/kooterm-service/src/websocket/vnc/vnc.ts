import net from 'net';
import WebSocket from 'ws';
import { analyzeVNCMessage } from '@kooterm/common';
import { getLogger } from '../../logger.js';

const VNC_PORT = Number(process.env.VNC_PORT) || 5900;
const VNC_HOST = process.env.TARGET_HOST || '127.0.0.1';
const logger = getLogger('VNCProxy');

export class VNCServerSocket {
  private socket: net.Socket;

  private handleshakeDebug = 20; // 只分析前20条握手消息

  public identifier: number;

  constructor(ws: WebSocket, identifier: number) {
    logger.debug(`[VNCProxy] [${identifier}] connect ${VNC_HOST}:${VNC_PORT}`);
    this.socket = net.createConnection({
      port: VNC_PORT,
      host: VNC_HOST,
    });
    this.identifier = identifier;
    this.socket.on('connect', () => {
      logger.debug(`[VNCProxy] [${identifier}] connected`);
    });

    this.socket.on('data', this._onData.bind(this));

    this.socket.on('close', () => {
      logger.debug(`[VNCProxy] [${identifier}] closed`);
      ws.close();
    });

    this.socket.on('error', err => {
      logger.debug(`[VNCProxy] [${identifier}] error:`, err);
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
