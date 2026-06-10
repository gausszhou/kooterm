import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import { Terminal, SshConfig } from './terminal.js';

const SSH_HOST = process.env.SSH_HOST || 'localhost';
const SSH_PORT = Number(process.env.SSH_PORT) || 22;
const SSH_USER = process.env.SSH_USER || 'user';
const SSH_PASS = process.env.SSH_PASS || 'user';

function sshConfig(): SshConfig {
  return { host: SSH_HOST, port: SSH_PORT, username: SSH_USER, password: SSH_PASS };
}

const onTerminalData = (data: string, terminal: Terminal, ws: WebSocket) => {
  const frame = FrameCodec.create(FrameType.TERMINAL_DATA, 0, new TextEncoder().encode(data));
  ws.send(frame.toBuffer());
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
  }

  getSession(sessionId: string): Terminal | undefined {
    return this.sessions.get(sessionId);
  }

  private evictLRU() {
    const key = this.sessions.keys().next().value;
    if (key !== undefined) {
      const term = this.sessions.get(key);
      term?.kill();
      this.sessions.delete(key);
    }
  }

  async initSession(sessionId: string, ws: WebSocket, identifier: number): Promise<Terminal> {
    let terminal = this.sessions.get(sessionId);

    if (!terminal) {
      if (this.sessions.size >= this.maxSshConnections) {
        this.evictLRU();
      }
      terminal = new Terminal(sessionId);
      terminal.onData = (data: string) => onTerminalData(data, terminal!, ws);
      await terminal.init(sshConfig());
      this.sessions.set(sessionId, terminal);
    }

    let inner = this.channelSession.get(ws);
    if (!inner) {
      inner = new Map();
      this.channelSession.set(ws, inner);
    }
    inner.set(identifier, sessionId);

    return terminal;
  }

  getSessionId(ws: WebSocket, identifier: number): string | undefined {
    return this.channelSession.get(ws)?.get(identifier);
  }

  async openShell(sessionId: string): Promise<Terminal> {
    const terminal = this.sessions.get(sessionId);
    if (!terminal) throw new Error(`Session ${sessionId} not found`);
    await terminal.openShell(sshConfig());
    return terminal;
  }

  removeConnection(ws: WebSocket) {
    this.channelSession.delete(ws);
  }

  size() {
    return this.sessions.size;
  }

  removeSession(sessionId: string) {
    const terminal = this.sessions.get(sessionId);
    terminal?.kill();
    this.sessions.delete(sessionId);
  }
}
