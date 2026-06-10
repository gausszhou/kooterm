import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import loglevel from 'loglevel';
import { Terminal, SshConfig } from './terminal.js';

const logger = loglevel.getLogger('TerminalManager');

const SSH_HOST = process.env.SSH_HOST || 'localhost';
const SSH_PORT = Number(process.env.SSH_PORT) || 22;
const SSH_USER = process.env.SSH_USER || 'user';
const SSH_PASS = process.env.SSH_PASS || 'user';

function sshConfig(): SshConfig {
  return { host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS };
}

const onTerminalData = (data: string, terminal: Terminal, ws: WebSocket, identifier: number) => {
  const frame = FrameCodec.create(FrameType.TERMINAL_DATA, identifier, new TextEncoder().encode(data));
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
  private channelSession = new Map<WebSocket, Map<number, string>>();
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
      const term = this.sessions.get(key);
      term?.kill();
      this.sessions.delete(key);
    }
  }

  async initSession(sessionId: string, ws: WebSocket, identifier: number): Promise<Terminal> {
    let terminal = this.sessions.get(sessionId);
    const isNew = !terminal;

    let inner = this.channelSession.get(ws);
    if (!inner) {
      inner = new Map();
      this.channelSession.set(ws, inner);
    }
    inner.set(identifier, sessionId);
    logger.debug(identifier, `[${sessionId}] 映射 identifier=${identifier}, 新建=${isNew}`);

    if (!terminal) {
      if (this.sessions.size >= this.maxSshConnections) {
        this.evictLRU();
      }
      terminal = new Terminal(sessionId);
      terminal.onData = (data: string) => onTerminalData(data, terminal!, ws, identifier);
      this.sessions.set(sessionId, terminal);
      logger.info(identifier, `[${sessionId}] 开始 SSH 连接 ${SSH_HOST}:${SSH_PORT} 用户=${SSH_USER}`);
      await terminal.init(sshConfig());
      logger.info(identifier, `[${sessionId}] SSH 连接成功`);
    } else {
      terminal.onData = (data: string) => onTerminalData(data, terminal!, ws, identifier);
      if (!terminal.shell) {
        logger.info(identifier, `[${sessionId}] Shell 已关闭，重新打开`);
        await terminal.openShell(sshConfig());
      } else {
        logger.debug(identifier, `[${sessionId}] 复用已有会话`);
      }
    }

    return terminal;
  }

  getSessionId(ws: WebSocket, identifier: number): string | undefined {
    return this.channelSession.get(ws)?.get(identifier);
  }

  async openShell(sessionId: string): Promise<Terminal> {
    const terminal = this.sessions.get(sessionId);
    if (!terminal) {
      logger.error(`[openShell] 会话不存在: ${sessionId}`);
      throw new Error(`Session ${sessionId} not found`);
    }
    logger.info(`[${sessionId}] 刷新 Shell`);
    await terminal.openShell(sshConfig());
    return terminal;
  }

  removeConnection(ws: WebSocket) {
    const channels = this.channelSession.get(ws);
    if (channels) {
      logger.info(`断开连接, 清理 ${channels.size} 个通道映射`);
    }
    this.channelSession.delete(ws);
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

  removeSession(sessionId: string) {
    const terminal = this.sessions.get(sessionId);
    if (terminal) {
      logger.info(`手动移除会话: ${sessionId}`);
      terminal.kill();
    }
    this.sessions.delete(sessionId);
  }
}
