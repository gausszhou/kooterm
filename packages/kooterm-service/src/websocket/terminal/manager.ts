import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import loglevel from 'loglevel';
import { Terminal, SshConfig } from './terminal.js';

const logger = loglevel.getLogger('TerminalManager');

const SSH_HOST = process.env.TARGET_HOST || 'localhost';
const SSH_PORT = Number(process.env.SSH_PORT) || 22;
const SSH_USER = process.env.SSH_USER || 'user';
const SSH_PASS = process.env.SSH_PASS || 'user';

function sshConfig(): SshConfig {
  return { host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS };
}

const onTerminalData = (data: string, terminal: Terminal, ws: WebSocket, identifier: number) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const frame = FrameCodec.create(FrameType.TERMINAL_DATA, identifier, new TextEncoder().encode(data), 0);
  ws.send(frame.toBuffer());
  logger.debug(identifier, `[${terminal.sessionId}] -> 前端 ${data.length} bytes`);
};

export const isTerminal = (frame: Frame) => {
  return frame.type === FrameType.TERMINAL_INIT
    || frame.type === FrameType.TERMINAL_REFRESH
    || frame.type === FrameType.TERMINAL_DATA
    || frame.type === FrameType.TERMINAL_RESIZE;
};

export class TerminalManager {
  private sessions = new Map<string, Terminal>();
  private identifierSession = new Map<number, string>();
  private sessionSubscribers = new Map<string, Set<WebSocket>>();
  readonly maxSshConnections: number;

  constructor(maxSshConnections: number = 5) {
    this.maxSshConnections = maxSshConnections;
    logger.info(`最大 SSH 连接数: ${maxSshConnections}`);
  }

  getSession(sessionId: string): Terminal | undefined {
    return this.sessions.get(sessionId);
  }

  private evictLRU() {
    const key = this.sessions.keys().next().value;
    if (key !== undefined) {
      logger.warn(`LRU 淘汰会话: ${key} (当前 ${this.sessions.size} 个)`);
      const subs = this.sessionSubscribers.get(key);
      if (subs) {
        for (const ws of subs) {
          ws.close(4001, 'Session evicted');
        }
        this.sessionSubscribers.delete(key);
      }
      const term = this.sessions.get(key);
      term?.kill();
      this.sessions.delete(key);
    }
  }

  async initSession(sessionId: string, ws: WebSocket, identifier: number): Promise<Terminal> {
    this.identifierSession.set(identifier, sessionId);

    const old = this.sessions.get(sessionId);
    if (old) {
      logger.info(identifier, `[${sessionId}] 已有旧会话，关闭旧连接`);
      const subs = this.sessionSubscribers.get(sessionId);
      if (subs) {
        for (const s of subs) {
          if (s !== ws) s.close(4001, 'Session replaced');
        }
        this.sessionSubscribers.delete(sessionId);
      }
      old.kill();
      this.sessions.delete(sessionId);
    }

    if (this.sessions.size >= this.maxSshConnections) {
      this.evictLRU();
    }

    const subs = new Set<WebSocket>([ws]);
    this.sessionSubscribers.set(sessionId, subs);

    const terminal = new Terminal(sessionId);
    terminal.onData = (data: string) => onTerminalData(data, terminal, ws, identifier);
    this.sessions.set(sessionId, terminal);

    logger.info(identifier, `[${sessionId}] 开始 SSH 连接 ${SSH_HOST}:${SSH_PORT} 用户=${SSH_USER}`);
    await terminal.init(sshConfig());
    logger.info(identifier, `[${sessionId}] SSH 连接成功`);

    return terminal;
  }

  getSessionId(identifier: number): string | undefined {
    return this.identifierSession.get(identifier);
  }

  removeConnection(ws: WebSocket) {
    for (const [sessionId, subs] of this.sessionSubscribers) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.sessionSubscribers.delete(sessionId);
      }
    }
  }

  size() {
    return this.sessions.size;
  }

  debug() {
    logger.info(`当前会话数: ${this.sessions.size}/${this.maxSshConnections}`);
    for (const [id, term] of this.sessions) {
      logger.info(`  ${id} shell=${term.shell !== null}`);
    }
  }

}
