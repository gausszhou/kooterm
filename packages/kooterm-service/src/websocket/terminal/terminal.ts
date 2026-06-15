import { Client, ClientChannel } from 'ssh2';
import { getLogger } from '../../logger.js';

const logger = getLogger('Terminal');

export interface SshConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export class Terminal {
  private ssh: Client;
  public sessionId: string;
  public shell: ClientChannel | null = null;
  public onData: ((data: string) => void) | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.ssh = new Client();
  }

  private bindChannel(channel: ClientChannel) {
    this.shell = channel;

    channel.stderr.on('data', (data: Buffer) => {
      logger.debug(`[Terminal] [${this.sessionId}] stderr:`, data.toString('utf-8'));
      this.onData?.(data.toString('utf-8'));
    });

    channel.on('data', (data: Buffer) => {
      this.onData?.(data.toString('utf-8'));
    });

    channel.on('close', () => {
      logger.info(`[Terminal] [${this.sessionId}] channel closed`);
      this.shell = null;
    });
  }

  init(config: SshConfig): Promise<void> {
    logger.info(`[Terminal] [${this.sessionId}] connect ${config.host}:${config.port} as ${config.username}`);
    return new Promise((resolve, reject) => {
      if (this.ssh) this.ssh.end();
      this.ssh = new Client();

      this.ssh.on('ready', () => {
        logger.info(`[Terminal] [${this.sessionId}] ssh ready`);
        this.ssh.shell({ term: 'xterm-256color' }, (err, channel) => {
          if (err) {
            logger.error(`[Terminal] [${this.sessionId}] shell error:`, err);
            this.onData?.(`\r\n\x1b[31mShell 打开失败: ${err.message}\x1b[0m\r\n`);
            reject(err);
            return;
          }
          this.bindChannel(channel);
          logger.info(`[Terminal] [${this.sessionId}] shell opened`);
          resolve();
        });
      });

      this.ssh.on('error', (err) => {
        logger.error(`[Terminal] [${this.sessionId}] ssh error:`, err);
        this.onData?.(`\r\n\x1b[31mSSH 连接失败: ${err.message}\x1b[0m\r\n`);
        reject(err);
      });

      this.ssh.on('end', () => {
        logger.info(`[Terminal] [${this.sessionId}] ssh end`);
      });

      this.ssh.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 10000,
      });
      logger.info(`[Terminal] [${this.sessionId}] ssh connect() called`);

      setTimeout(() => {
        if (!this.shell) {
          this.onData?.(`\r\n\x1b[33mSSH 连接超时 (${config.host}:${config.port})\x1b[0m\r\n`);
        }
      }, 10000);
    });
  }

  write(data: string) {
    this.shell?.write(data);
  }

  resize(cols: number, rows: number) {
    this.shell?.setWindow(rows, cols, 0, 0);
  }

  kill() {
    if (this.shell) {
      this.shell.close();
      this.shell = null;
    }
    this.ssh.end();
  }

  openShell(config: SshConfig): Promise<void> {
    logger.info(`[Terminal] [${this.sessionId}] open shell`);
    if (this.shell) {
      this.shell.close();
      this.shell = null;
    }
    return new Promise((resolve, reject) => {
      this.ssh.shell({ term: 'xterm-256color' }, (err, channel) => {
        if (err) {
          logger.error(`[Terminal] [${this.sessionId}] openShell error:`, err);
          reject(err);
          return;
        }
        this.bindChannel(channel);
        logger.info(`[Terminal] [${this.sessionId}] shell opened`);
        resolve();
      });
    });
  }

  get isConnected(): boolean {
    return this.ssh && this.shell !== null;
  }
}
