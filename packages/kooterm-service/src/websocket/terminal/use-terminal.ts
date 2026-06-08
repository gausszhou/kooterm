import { Frame, FrameCodec, FrameType } from '@kooterm/common';
import WebSocket from 'ws';
import { Terminal } from './terminal.js';

export const isTerminal = (frame: Frame) => {
  return frame.type === FrameType.TERMINAL_INIT || frame.type === FrameType.TERMINAL_REFRESH || frame.type === FrameType.TERMINAL_DATA;
};

export const onPtyData = (data: string, terminal: Terminal, ws: WebSocket) => {
  const frame = FrameCodec.create(FrameType.TERMINAL_DATA, terminal.identifier, new TextEncoder().encode(data));
  ws.send(frame.toBuffer());
};

export class TerminalManager {
  private terminalMap: Map<WebSocket, Terminal> = new Map();

  public getTerminal(identifier: number, ws: WebSocket) {
    let terminal = this.terminalMap.get(ws);
    if (terminal) {
      terminal.identifier = identifier;
      terminal.onData = (data: string) => onPtyData(data, terminal!, ws);
      return terminal;
    }
    terminal = new Terminal(identifier);
    terminal.onData = (data: string) => onPtyData(data, terminal, ws);
    this.terminalMap.set(ws, terminal);
    return terminal;
  }

  public removeConnection(ws: WebSocket) {
    const connection = this.terminalMap.get(ws);
    if (connection) {
      this.terminalMap.delete(ws);
    }
  }

  public size() {
    return this.terminalMap.size;
  }
}
