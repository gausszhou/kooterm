import { Client, ClientChannel } from 'ssh2';
import loglevel from 'loglevel';

const logger = loglevel.getLogger('SSH');

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

  init(config: SshConfig): Promise<void> {
    logger.info(`[${this.sessionId}] SSH connecting to ${config.host}:${config.port} as ${config.username}`);
    return new Promise((resolve, reject) => {
      if (this.ssh) this.ssh.end();
      this.ssh = new Client();

      this.ssh.on('ready', () => {
        logger.info(`[${this.sessionId}] SSH connected, opening shell...`);
        this.ssh.shell({ term: 'xterm-256color' }, (err, channel) => {
          if (err) {
            logger.error(`[${this.sessionId}] shell() error:`, err);
            reject(err);
            return;
          }
          this.shell = channel;
          logger.info(`[${this.sessionId}] Shell opened`);

          channel.stderr.on('data', (data: Buffer) => {
            logger.debug(`[${this.sessionId}] Shell stderr:`, data.toString('utf-8'));
            this.onData?.(data.toString('utf-8'));
          });

          channel.on('data', (data: Buffer) => {
            this.onData?.(data.toString('utf-8'));
          });

          channel.on('close', () => {
            logger.info(`[${this.sessionId}] Shell closed`);
            this.shell = null;
          });

          resolve();
        });
      });

      this.ssh.on('error', (err) => {
        logger.error(`[${this.sessionId}] SSH error:`, err);
        reject(err);
      });

      this.ssh.on('end', () => {
        logger.info(`[${this.sessionId}] SSH end`);
      });

      this.ssh.connect({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        readyTimeout: 10000,
      });
      logger.info(`[${this.sessionId}] SSH connect() called`);
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
    logger.info(`[${this.sessionId}] Opening new shell (refresh)...`);
    return new Promise((resolve, reject) => {
      if (this.shell) {
        this.shell.close();
        this.shell = null;
      }

      this.ssh.shell({ term: 'xterm-256color' }, (err, channel) => {
        if (err) {
          logger.error(`[${this.sessionId}] openShell() error:`, err);
          reject(err);
          return;
        }
        this.shell = channel;
        logger.info(`[${this.sessionId}] New shell opened (refresh)`);

        channel.stderr.on('data', (data: Buffer) => {
          logger.debug(`[${this.sessionId}] Shell stderr:`, data.toString('utf-8'));
          this.onData?.(data.toString('utf-8'));
        });

        channel.on('data', (data: Buffer) => {
          this.onData?.(data.toString('utf-8'));
        });

        channel.on('close', () => {
          logger.info(`[${this.sessionId}] Shell closed (refresh)`);
          this.shell = null;
        });

        resolve();
      });
    });
  }

  get isConnected(): boolean {
    return this.ssh && this.shell !== null;
  }
}
