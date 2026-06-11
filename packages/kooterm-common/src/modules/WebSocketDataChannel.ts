import { Frame, FrameCodec, FrameType } from '../index.js';
import { WebSocketConnection } from './WebSocketConnection.js';
import { log } from '../logger.js';

export class WebSocketDataChannel extends EventTarget implements WebSocket {
  readonly CONNECTING = WebSocket.CONNECTING;
  readonly OPEN = WebSocket.OPEN;
  readonly CLOSING = WebSocket.CLOSING;
  readonly CLOSED = WebSocket.CLOSED;

  public identifier: number = FrameCodec.randomIdentifier();
  public label: string;
  private connection: WebSocketConnection;

  _onopen = (e: Event) => {};
  _onclose = (e: Event) => {};
  _onerror = (e: Event) => {};
  _onmessage = (ev: Event) => {};

  constructor(connection: WebSocketConnection, label: string) {
    super();
    this.connection = connection;
    this.label = label;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
    super.addEventListener(type, listener, options);
    if (type === 'open' && this.connection.isConnected) {
      const event = new Event('open', {});
      this._onopen(event);
      this.dispatchEvent(event);
    }
  }

  set binaryType(type: BinaryType) {
    this.connection.binaryType = type;
  }

  get binaryType(): BinaryType {
    return this.connection.binaryType;
  }

  get readyState() {
    return this.connection.readyState;
  }

  get url(): string {
    return this.connection.url;
  }

  get extensions(): string {
    return this.connection.extensions;
  }

  get protocol(): string {
    return this.connection.protocol;
  }

  get bufferedAmount(): number {
    return this.connection.bufferedAmount;
  }

  /**
   *  业务不要使用这些属性
   */
  set onopen(callback: (ev: Event) => any) {
    this._onopen = callback;
  }

  get onopen() {
    return this._onopen;
  }

  set onerror(callback: (ev: Event) => any) {
    this._onerror = callback;
  }

  set onclose(callback: (ev: Event) => any) {
    this._onclose = callback;
  }

  get onclose() {
    return this._onclose;
  }

  set onmessage(callback: (ev: Event) => any) {
    this._onmessage = ev => {
      const event = new MessageEvent('message', { data: this.decode((ev as MessageEvent).data) });
      callback(event);
    };
  }

  get onmessage() {
    return this._onmessage;
  }

  public send(data: string | ArrayBuffer) {
    const buff = this.encode(data);
    this.connection.send(buff);
  }

  public close() {
    this.connection.closeDataChannel(this.label);
  }

  public encode(data: string | ArrayBuffer) {
    return data;
  }

  public decode(data: Frame): Frame | ArrayBuffer | Uint8Array | string {
    return data.payload;
  }

  public _send(opcode: FrameType, data: string | number | ArrayBuffer | Uint8Array) {
    if (this.connection.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    const frame = FrameCodec.create(opcode, this.identifier, data, 0);
    this.connection.send(frame.toBuffer());
  }
}
