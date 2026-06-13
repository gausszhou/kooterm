import { vi } from 'vitest';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  readyState: number = WebSocket.OPEN;
  binaryType: BinaryType = 'arraybuffer';
  bufferedAmount = 0;
  extensions = '';
  protocol = '';

  onopen: ((ev: Event) => any) | null = null;
  onclose: ((ev: CloseEvent) => any) | null = null;
  onerror: ((ev: Event) => any) | null = null;
  onmessage: ((ev: MessageEvent) => any) | null = null;

  constructor(url: string, _protocol?: string) {
    this.url = url;
  }

  send(_data: string | ArrayBuffer | Blob | ArrayBufferView) {}
  close() {}
  addEventListener(_type: string, _listener: any) {}
  removeEventListener(_type: string, _listener: any) {}
  dispatchEvent(_event: Event) { return true; }
}

vi.stubGlobal('WebSocket', MockWebSocket);
