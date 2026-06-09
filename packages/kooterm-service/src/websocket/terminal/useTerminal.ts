import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import { Terminal } from './terminal.js';

export const isTerminal = (frame: Frame) => {
  return frame.type === FrameType.TERMINAL_INIT || frame.type === FrameType.TERMINAL_REFRESH || frame.type === FrameType.TERMINAL_DATA || frame.type === FrameType.TERMINAL_RESIZE;
};

export const onPtyData = (data: string, terminal: Terminal, ws: WebSocket) => {
  const frame = FrameCodec.create(FrameType.TERMINAL_DATA, terminal.identifier, new TextEncoder().encode(data));
  ws.send(frame.toBuffer());
};

export class TerminalManager {
  private terminalMap: Map<WebSocket, Terminal> = new Map();
  private readonly maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  public getTerminal(identifier: number, ws: WebSocket) {
    let terminal = this.terminalMap.get(ws);
    if (terminal) {
      this.terminalMap.delete(ws);
      terminal.identifier = identifier;
      terminal.onData = (data: string) => onPtyData(data, terminal!, ws);
      this.terminalMap.set(ws, terminal);
      return terminal;
    }

    if (this.terminalMap.size >= this.maxSize) {
      this.evictLRU();
    }

    terminal = new Terminal(identifier);
    terminal.onData = (data: string) => onPtyData(data, terminal, ws);
    this.terminalMap.set(ws, terminal);
    return terminal;
  }

  private evictLRU() {
    const lruKey = this.terminalMap.keys().next().value;
    if (lruKey !== undefined) {
      const terminal = this.terminalMap.get(lruKey);
      if (terminal) terminal.kill();
      this.terminalMap.delete(lruKey);
      lruKey.close();
    }
  }

  public removeConnection(ws: WebSocket) {
    const connection = this.terminalMap.get(ws);
    if (connection) {
      connection.kill();
      this.terminalMap.delete(ws);
    }
  }

  public size() {
    return this.terminalMap.size;
  }
}
