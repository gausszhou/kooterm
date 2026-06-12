import net from 'net';
import { TcpErrorType } from '@kooterm/common';
import loglevel, { LogLevelDesc } from 'loglevel';

const logger = loglevel.getLogger('TcpProxySocket');
logger.setLevel((process.env.LOG_LEVEL as LogLevelDesc) || 'info');

function mapErrorType(code: string | undefined): number {
  switch (code) {
    case 'ECONNREFUSED': return TcpErrorType.REFUSED;
    case 'ETIMEDOUT': return TcpErrorType.TIMEOUT;
    case 'ECONNRESET': return TcpErrorType.RESET;
    default: return TcpErrorType.OTHER;
  }
}

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
  public onError: ((type: number, message: string) => void) | null = null;
  public onConnect: (() => void) | null = null;

  constructor(identifier: number, host: string, port: number) {
    logger.debug(identifier, `TCP 代理: ${host}:${port}`);
    this.socket = net.createConnection({ host, port, readableHighWaterMark: 65536 });
    this.identifier = identifier;
    this.port = port;

    this.socket.on('connect', () => {
      logger.debug(identifier, 'TCP 连接成功');
      this.onConnect?.();
    });

    this.socket.on('data', this._onData.bind(this));

    this.socket.on('close', () => {
      logger.debug(identifier, 'TCP 连接关闭');
      this.onError?.(TcpErrorType.CLOSED, 'Connection closed');
      this.onClose?.();
    });

    this.socket.on('error', err => {
      logger.debug(identifier, 'TCP 错误:', err.message);
      const errType = mapErrorType((err as NodeJS.ErrnoException).code);
      this.onError?.(errType, err.message);
      this.socket.end();
    });
  }

  _onData(data: Uint8Array) {
    const head = new TextDecoder().decode(data.slice(0, Math.min(data.length, 512)));
    const tail = data.length > 1024 ? '\n... ...\n' + new TextDecoder().decode(data.slice(-512)) : '';
    logger.debug(this.identifier, `[TCP] <<< ${data.length} bytes:\n${head}${tail}`);
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
