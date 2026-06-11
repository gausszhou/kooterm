import net from 'net';
import loglevel, { LogLevelDesc } from 'loglevel';

const logger = loglevel.getLogger('TcpProxySocket');
logger.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || 'info');

/**
 * TCP 隧道服务端（net.Socket 封装）
 *
 * 生命周期独立：TCP socket 关闭时只通知 manager 清理，
 * 不关闭共享的 WebSocket 连接，确保其他隧道不受影响。
 */
export class TcpProxySocket {
  private socket: net.Socket;
  public identifier: number;
  public port: number;
  public onClose: (() => void) | null = null;

  constructor(identifier: number, host: string, port: number) {
    logger.debug(identifier, `TCP 代理: ${host}:${port}`);
    this.socket = net.createConnection({ host, port });
    this.identifier = identifier;
    this.port = port;

    this.socket.on('connect', () => {
      logger.debug(identifier, 'TCP 连接成功');
    });

    this.socket.on('data', this._onData.bind(this));

    this.socket.on('close', () => {
      logger.debug(identifier, 'TCP 连接关闭');
      this.onClose?.();
    });

    this.socket.on('error', err => {
      logger.debug(identifier, 'TCP 错误:', err.message);
      this.socket.end();
    });
  }

  _onData(data: Uint8Array) {
    this.onData(data);
  }

  onData(data: Uint8Array) {
    // 由 manager 设置
  }

  write(data: Uint8Array) {
    this.socket.write(data);
  }

  close() {
    this.socket.end();
  }
}
