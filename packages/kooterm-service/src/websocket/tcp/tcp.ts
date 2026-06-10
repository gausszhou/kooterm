import net from 'net';
import WebSocket from 'ws';
import loglevel, { LogLevelDesc } from 'loglevel';

const logger = loglevel.getLogger('TcpProxySocket');
logger.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || 'info');

export class TcpProxySocket {
  private socket: net.Socket;
  public identifier: number;

  constructor(ws: WebSocket, identifier: number, host: string, port: number) {
    logger.debug(identifier, `TCP 代理: ${host}:${port}`);
    this.socket = net.createConnection({ host, port });
    this.identifier = identifier;

    this.socket.on('connect', () => {
      logger.debug(identifier, 'TCP 连接成功');
    });

    this.socket.on('data', this._onData.bind(this));

    this.socket.on('close', () => {
      ws.close();
    });

    this.socket.on('error', err => {
      logger.debug('TCP 错误:', err);
      this.socket.end();
      ws.close();
    });

    ws.on('close', () => {
      this.socket.end();
    });

    ws.on('error', () => {
      this.socket.end();
    });
  }

  _onData(data: Uint8Array) {
    this.onData(data);
  }

  onData(data: Uint8Array) {
  }

  write(data: Uint8Array) {
    this.socket.write(data);
  }

  close() {
    this.socket.end();
  }
}
